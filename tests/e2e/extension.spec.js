"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..", "..");
const fixtureHtml = fs.readFileSync(
  path.join(projectRoot, "tests", "fixtures", "instagram-profile.html"),
  "utf8"
);

async function installBrowserMocks(page, seed = {}) {
  await page.addInitScript(({ initialStorage }) => {
    const storage = JSON.parse(JSON.stringify(initialStorage || {}));
    const listeners = [];
    const messages = [];
    const downloads = [];
    const blobs = [];

    globalThis.__ftTest = { storage, listeners, messages, downloads, blobs };
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true });
        },
        onMessage: {
          addListener(listener) { listeners.push(listener); },
        },
      },
      storage: {
        local: {
          get(keys, callback) {
            if (keys == null) { callback({ ...storage }); return; }
            const requested = typeof keys === "string"
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : Object.keys(keys || {});
            const result = {};
            requested.forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(storage, key)) result[key] = storage[key];
            });
            callback(result);
          },
          set(values, callback) {
            Object.assign(storage, values);
            if (callback) callback();
          },
          remove(keys, callback) {
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete storage[key]);
            if (callback) callback();
          },
        },
      },
    };

    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return `blob:follow-tracker-${blobs.length}`;
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function clickDownload() {
      if (this.download) downloads.push(this.download);
    };

    globalThis.__ftDispatch = (message) => new Promise((resolve) => {
      let answered = false;
      const respond = (response) => {
        if (!answered) {
          answered = true;
          resolve(response);
        }
      };
      listeners.forEach((listener) => listener(message, {}, respond));
      setTimeout(() => respond({ ok: false, error: "Sin respuesta" }), 100);
    });
  }, { initialStorage: seed });
}

async function mockInstagram(page, counts, custom = {}) {
  const unexpected = [];
  const followers = custom.followers || (counts.followers === 0
    ? []
    : [
        { pk: "1", username: "ana", full_name: "Ana Demo" },
        { pk: "2", username: "beto", full_name: "Beto Demo" },
        { pk: "3", username: "carla", full_name: "Carla Demo" },
      ]);
  const following = custom.following || (counts.following === 0
    ? []
    : [
        { pk: "1", username: "ana", full_name: "Ana Demo" },
        { pk: "4", username: "diana", full_name: "Diana Demo" },
      ]);

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.href === "https://www.instagram.com/demo_profile/") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixtureHtml });
      return;
    }
    if (url.pathname === "/api/v1/users/web_profile_info/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            user: {
              id: "123",
              username: "demo_profile",
              is_private: false,
              followed_by_viewer: true,
              edge_followed_by: { count: counts.followers },
              edge_follow: { count: counts.following },
            },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/friendships/123/followers/") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ users: followers }) });
      return;
    }
    if (url.pathname === "/api/v1/friendships/123/following/") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ users: following }) });
      return;
    }
    unexpected.push(url.href);
    await route.abort("blockedbyclient");
  });
  return unexpected;
}

async function loadExtension(page) {
  const files = [
    "core.js",
    "trust-core.js",
    "capture-store.js",
    "instagram-api.js",
    "instagram-ui.js",
    "analysis-overlay.js",
    "analysis-controller.js",
    "content-entry.js",
  ];
  for (const file of files) {
    await page.addScriptTag({ path: path.join(projectRoot, "extension", file) });
  }
  const response = await page.evaluate(() => globalThis.__ftDispatch({ type: "SHOW_OVERLAY" }));
  expect(response).toEqual({ ok: true, error: null });
}

async function runAndSave(page) {
  await page.locator("#ft3-start").click();
  await expect(page.locator("#ft3-review")).toBeVisible({ timeout: 15000 });
  await page.locator('[data-review="save"]').click();
  await expect(page.locator("#ft3-status")).toContainText("Reporte guardado", { timeout: 5000 });
}

for (const scenario of [
  { name: "perfil con relaciones", followers: 3, following: 2 },
  { name: "cuenta completamente vacía", followers: 0, following: 0 },
]) {
  test(`revisa y guarda localmente una captura API para ${scenario.name}`, async ({ page }) => {
    await installBrowserMocks(page);
    const unexpected = await mockInstagram(page, scenario);
    await page.goto("https://www.instagram.com/demo_profile/");
    await loadExtension(page);

    await expect(page.locator("#ft3-profile")).toHaveText("@demo_profile");
    await runAndSave(page);

    const result = await page.evaluate(() => ({
      downloads: globalThis.__ftTest.downloads,
      messages: globalThis.__ftTest.messages,
      storage: globalThis.__ftTest.storage,
    }));

    expect(result.downloads).toEqual([]);
    expect(result.messages.filter((message) => message.type === "capture-saved")).toHaveLength(1);
    expect(result.storage.ft_history_demo_profile.followers).toHaveLength(scenario.followers);
    expect(result.storage.ft_history_demo_profile.following).toHaveLength(scenario.following);
    expect(result.storage.ft_capture_meta_demo_profile.reports).toBeTruthy();
    expect(result.storage.ft_identity_demo_profile).toBeTruthy();
    expect(result.storage.ft_pending_capture_demo_profile).toBeUndefined();
    expect(unexpected).toEqual([]);
  });
}

test("un ID estable conserva la misma persona cuando cambia de username", async ({ page }) => {
  const seed = {
    ft_history_demo_profile: {
      schemaVersion: 3,
      profile: "demo_profile",
      followers: ["nombre_viejo"],
      following: ["nombre_viejo"],
      updatedAt: "2026-08-20T10:00:00Z",
      runId: "r1",
    },
    ft_identity_demo_profile: {
      schemaVersion: 1,
      profile: "demo_profile",
      records: {
        "id:77": {
          key: "id:77",
          instagramUserId: "77",
          canonicalUsername: "nombre_viejo",
          currentUsername: "nombre_viejo",
          previousUsernames: ["nombre_viejo"],
          firstSeenAt: "2026-08-20T10:00:00Z",
          lastSeenAt: "2026-08-20T10:00:00Z",
        },
      },
      aliases: { nombre_viejo: "id:77" },
    },
    ft_settings: { confirmRemovalsAfter: 2 },
  };
  await installBrowserMocks(page, seed);
  await mockInstagram(page, { followers: 1, following: 1 }, {
    followers: [{ pk: "77", username: "nombre_nuevo", full_name: "Persona" }],
    following: [{ pk: "77", username: "nombre_nuevo", full_name: "Persona" }],
  });
  await page.goto("https://www.instagram.com/demo_profile/");
  await loadExtension(page);
  await runAndSave(page);

  const result = await page.evaluate(() => globalThis.__ftTest.storage);
  expect(result.ft_history_demo_profile.followers).toEqual(["nombre_viejo"]);
  expect(result.ft_identity_demo_profile.records["id:77"].currentUsername).toBe("nombre_nuevo");
  const metadata = Object.values(result.ft_capture_meta_demo_profile.reports)[0];
  expect(metadata.renames).toHaveLength(1);
  expect(metadata.changes.lostFollowers).toEqual([]);
});

test("cancelar interrumpe una petición API lenta sin guardar", async ({ page }) => {
  await installBrowserMocks(page);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.href === "https://www.instagram.com/demo_profile/") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixtureHtml });
      return;
    }
    if (url.pathname === "/api/v1/users/web_profile_info/") {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" }).catch(() => {});
      return;
    }
    await route.abort("blockedbyclient");
  });

  await page.goto("https://www.instagram.com/demo_profile/");
  await loadExtension(page);
  await page.locator("#ft3-start").click();
  await page.waitForTimeout(200);
  await page.locator("#ft3-cancel").click();
  await expect(page.locator("#ft3-status")).toContainText("cancelado", { timeout: 3000 });

  const result = await page.evaluate(() => ({
    downloads: globalThis.__ftTest.downloads,
    storage: globalThis.__ftTest.storage,
  }));
  expect(result.downloads).toEqual([]);
  expect(result.storage.ft_history_demo_profile).toBeUndefined();
  expect(result.storage.ft_pending_capture_demo_profile).toBeUndefined();
});
