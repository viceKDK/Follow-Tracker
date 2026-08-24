"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..", "..");
const fixtureHtml = fs.readFileSync(
  path.join(projectRoot, "tests", "fixtures", "instagram-profile.html"),
  "utf8"
);

async function installBrowserMocks(page) {
  await page.addInitScript(() => {
    const storage = {};
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
            const requested = Array.isArray(keys) ? keys : Object.keys(storage);
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
  });
}

async function mockInstagram(page, counts) {
  const unexpected = [];
  const followers = counts.followers === 0
    ? []
    : [
        { username: "ana", full_name: "Ana Demo" },
        { username: "beto", full_name: "Beto Demo" },
        { username: "carla", full_name: "Carla Demo" },
      ];
  const following = counts.following === 0
    ? []
    : [
        { username: "ana", full_name: "Ana Demo" },
        { username: "diana", full_name: "Diana Demo" },
      ];

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
  await page.addScriptTag({ path: path.join(projectRoot, "extension", "core.js") });
  await page.addScriptTag({ path: path.join(projectRoot, "extension", "content.js") });
  await page.addScriptTag({ path: path.join(projectRoot, "extension", "export-policy.js") });
  const response = await page.evaluate(() => globalThis.__ftDispatch({ type: "SHOW_OVERLAY" }));
  expect(response).toEqual({ ok: true, error: null });
}

for (const scenario of [
  { name: "perfil con relaciones", followers: 3, following: 2 },
  { name: "cuenta completamente vacía", followers: 0, following: 0 },
]) {
  test(`extensión completa el flujo API y guarda localmente para ${scenario.name}`, async ({ page }) => {
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") {
        console.log(`[browser:${message.type()}] ${message.text()}`);
      }
    });
    await installBrowserMocks(page);
    const unexpected = await mockInstagram(page, scenario);
    await page.goto("https://www.instagram.com/demo_profile/");
    await loadExtension(page);

    await expect(page.locator("#ft-profile")).toHaveText("demo_profile");
    await page.locator("#ft-start").click();
    await expect(page.locator("#ft-status")).toContainText("Finalizado (modo API)", { timeout: 15000 });

    const result = await page.evaluate(() => ({
      downloads: globalThis.__ftTest.downloads,
      messages: globalThis.__ftTest.messages,
      storage: globalThis.__ftTest.storage,
    }));

    // El análisis nunca debe llenar Descargas. Los CSV/JSON se generan solamente
    // cuando el usuario los solicita desde el dashboard.
    expect(result.downloads).toEqual([]);
    const suppressed = result.messages.filter((message) => message.type === "legacy-report-suppressed");
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].filename).toMatch(/^ig_auto_.*\.(?:csv|xls)$/i);

    expect(result.storage.ft_history_demo_profile.followers).toHaveLength(scenario.followers);
    expect(result.storage.ft_history_demo_profile.following).toHaveLength(scenario.following);
    expect(result.storage.ft_history_demo_profile.profile).toBe("demo_profile");
    expect(unexpected).toEqual([]);
  });
}

test("cancelar interrumpe una petición API lenta sin guardar ni descargar", async ({ page }) => {
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
  await page.locator("#ft-start").click();
  await page.waitForTimeout(200);
  await page.locator("#ft-cancel").click();
  await expect(page.locator("#ft-status")).toContainText("Cancelado", { timeout: 3000 });

  const result = await page.evaluate(() => ({
    downloads: globalThis.__ftTest.downloads,
    storage: globalThis.__ftTest.storage,
  }));
  expect(result.downloads).toEqual([]);
  expect(result.storage.ft_history_demo_profile).toBeUndefined();
});
