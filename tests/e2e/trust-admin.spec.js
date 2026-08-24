"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(projectRoot, "extension");
let server;
let dashboardUrl;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

function seed() {
  const profile = "demo_profile";
  const snapshot = {
    schemaVersion: 3,
    profile,
    profileId: "900",
    followers: ["ana", "carla"],
    following: ["ana", "beto"],
    updatedAt: "2026-08-24T15:30:00.000Z",
    runId: "r3",
    reportId: "r3",
  };
  const timeline = {
    schemaVersion: 2,
    profile,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: snapshot.updatedAt,
    baseline: {
      profile,
      reportId: "r1",
      runId: "r1",
      capturedAt: "2026-08-20T10:00:00.000Z",
      followers: ["ana", "beto"],
      following: ["ana"],
    },
    reports: [
      {
        id: "r1",
        runId: "r1",
        capturedAt: "2026-08-20T10:00:00.000Z",
        isBaseline: true,
        followersCount: 2,
        followingCount: 1,
        mutualCount: 1,
        followerOnlyCount: 1,
        followingOnlyCount: 0,
        changes: { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] },
        eventCount: 0,
      },
      {
        id: "r2",
        runId: "r2",
        capturedAt: "2026-08-22T10:00:00.000Z",
        isBaseline: false,
        followersCount: 2,
        followingCount: 2,
        mutualCount: 1,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: {
          newFollowers: ["carla"],
          lostFollowers: ["beto"],
          newFollowing: ["beto"],
          lostFollowing: [],
        },
        eventCount: 3,
      },
      {
        id: "r3",
        runId: "r3",
        capturedAt: snapshot.updatedAt,
        isBaseline: false,
        followersCount: 2,
        followingCount: 2,
        mutualCount: 1,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] },
        eventCount: 0,
      },
    ],
    events: [
      { id: "r2:followed_you:carla", profile, username: "carla", type: "followed_you", occurredAt: "2026-08-22T10:00:00.000Z", reportId: "r2", runId: "r2" },
      { id: "r2:unfollowed_you:beto", profile, username: "beto", type: "unfollowed_you", occurredAt: "2026-08-22T10:00:00.000Z", reportId: "r2", runId: "r2" },
      { id: "r2:you_followed:beto", profile, username: "beto", type: "you_followed", occurredAt: "2026-08-22T10:00:00.000Z", reportId: "r2", runId: "r2" },
    ],
  };
  return {
    [`ft_history_${profile}`]: snapshot,
    [`ft_timeline_${profile}`]: timeline,
    [`ft_capture_meta_${profile}`]: {
      schemaVersion: 1,
      profile,
      reports: {
        r3: {
          status: "trusted",
          score: 98,
          source: "api",
          capturedAt: snapshot.updatedAt,
          expectedFollowers: 2,
          collectedFollowers: 2,
          followersCoverage: 1,
          expectedFollowing: 2,
          collectedFollowing: 2,
          followingCoverage: 1,
          reasons: [],
          pendingAbsences: { followers: [], following: [] },
          renames: [{ from: "ana", to: "ana_nueva" }],
        },
      },
    },
    [`ft_identity_${profile}`]: {
      schemaVersion: 1,
      profile,
      updatedAt: snapshot.updatedAt,
      records: {
        "id:1": {
          key: "id:1",
          instagramUserId: "1",
          canonicalUsername: "ana",
          currentUsername: "ana_nueva",
          previousUsernames: ["ana", "ana_nueva"],
          fullName: "Ana",
          firstSeenAt: "2026-08-20T10:00:00.000Z",
          lastSeenAt: snapshot.updatedAt,
          source: "api",
        },
      },
      aliases: { ana: "id:1", ana_nueva: "id:1" },
    },
    [`ft_people_meta_${profile}`]: { schemaVersion: 1, profile, people: {} },
    ft_settings: {
      minTrustedCoverage: 0.95,
      minHardCoverage: 0.8,
      maxTrustedDropRatio: 0.15,
      confirmRemovalsAfter: 2,
      autoAcceptTrusted: false,
      backupReminderDays: 30,
      backupReminderReports: 5,
    },
  };
}

function serveExtension(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname === "/"
    ? "dashboard.html"
    : url.pathname.replace(/^\/extension\//, "").replace(/^\//, "");
  const candidate = path.resolve(extensionRoot, relative);
  if (!candidate.startsWith(`${extensionRoot}${path.sep}`) && candidate !== extensionRoot) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(candidate, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(candidate)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(candidate).pipe(response);
  });
}

async function installMocks(page, initialStorage = seed()) {
  await page.addInitScript(({ seedValue }) => {
    const storage = JSON.parse(JSON.stringify(seedValue));
    const listeners = [];
    const downloads = [];
    const blobs = [];
    const openedTabs = [];

    function select(keys) {
      if (keys == null) return { ...storage };
      const list = typeof keys === "string"
        ? [keys]
        : Array.isArray(keys)
          ? keys
          : Object.keys(keys || {});
      const output = {};
      list.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(storage, key)) output[key] = storage[key];
      });
      return output;
    }

    globalThis.__ftTrustTest = { storage, downloads, blobs, openedTabs };
    globalThis.confirm = () => true;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        getURL(file) { return new URL(file, location.origin).href; },
      },
      tabs: { create(options) { openedTabs.push(options); } },
      storage: {
        local: {
          get(keys, callback) { callback(select(keys)); },
          set(values, callback) {
            const changes = {};
            Object.entries(values || {}).forEach(([key, value]) => {
              changes[key] = { oldValue: storage[key], newValue: value };
              storage[key] = value;
            });
            callback && callback();
            queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
          },
          remove(keys, callback) {
            const changes = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (!Object.prototype.hasOwnProperty.call(storage, key)) return;
              changes[key] = { oldValue: storage[key], newValue: undefined };
              delete storage[key];
            });
            callback && callback();
            queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
          },
        },
        onChanged: { addListener(listener) { listeners.push(listener); } },
      },
    };
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return `blob:trust-${blobs.length}`;
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function recordDownload() {
      if (this.download) downloads.push(this.download);
    };
  }, { seedValue: initialStorage });
}

async function openDashboard(page, hash = "overview") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installMocks(page);
  await page.goto(`${dashboardUrl}?profile=demo_profile#${hash}`);
  await expect(page.locator("#dashboard-content")).toBeVisible();
  await expect(page.locator('[data-view="admin"]')).toBeAttached();
  return errors;
}

test.beforeAll(async () => {
  server = http.createServer(serveExtension);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  dashboardUrl = `http://127.0.0.1:${server.address().port}/extension/dashboard.html`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

test("muestra calidad y conserva el historial al cambiar de username", async ({ page }) => {
  const errors = await openDashboard(page, "overview");
  await expect(page.locator("#trust-quality-panel")).toBeVisible();
  await expect(page.locator("#trust-quality-badge")).toContainText("98/100");
  await expect(page.locator("#trust-quality-observations")).toContainText("username");

  await page.locator('[data-view="people"]').click();
  await page.locator("#people-search").fill("ana");
  await expect(page.locator(".current-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".current-table tbody tr")).toContainText("@ana_nueva");
  await expect(page.locator(".current-table tbody tr")).toContainText("Antes @ana");
  expect(errors).toEqual([]);
});

test("guarda notas etiquetas y una persona fijada", async ({ page }) => {
  const errors = await openDashboard(page, "people");
  await page.locator('[data-view="people"]').click();
  await page.locator("#people-search").fill("ana");
  await page.locator(".current-table tbody tr").click();
  await expect(page.locator("#person-meta-editor")).toBeVisible();
  await page.locator("#person-meta-pinned").check();
  await page.locator("#person-meta-tags").fill("amistad, trabajo");
  await page.locator("#person-meta-note").fill("Nos seguimos desde marzo");
  await page.locator("#person-meta-save").click();
  await expect(page.locator("#person-meta-status")).toContainText("guardada");

  const stored = await page.evaluate(() => globalThis.__ftTrustTest.storage.ft_people_meta_demo_profile);
  expect(stored.people.ana.pinned).toBe(true);
  expect(stored.people.ana.tags).toEqual(["amistad", "trabajo"]);
  expect(stored.people.ana.note).toBe("Nos seguimos desde marzo");
  expect(errors).toEqual([]);
});

test("importa archivos oficiales y crea una captura con fuente oficial", async ({ page }) => {
  const errors = await openDashboard(page, "admin");
  await page.locator('[data-view="admin"]').click();
  await expect(page.locator("#admin")).toBeVisible();
  await page.locator("#official-import-profile").fill("official_profile");
  await page.locator("#official-import-files").setInputFiles([
    {
      name: "followers_1.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([
        { string_list_data: [{ value: "ana" }, { value: "beto" }] },
      ])),
    },
    {
      name: "following.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        relationships_following: [
          { string_list_data: [{ value: "ana" }] },
        ],
      })),
    },
  ]);
  await expect(page.locator("#official-import-preview")).toContainText("2");
  await page.locator("#official-import-save").click();
  await page.waitForFunction(() => Boolean(globalThis.__ftTrustTest.storage.ft_history_official_profile));
  const stored = await page.evaluate(() => ({
    snapshot: globalThis.__ftTrustTest.storage.ft_history_official_profile,
    metadata: globalThis.__ftTrustTest.storage.ft_capture_meta_official_profile,
  }));
  expect(stored.snapshot.followers).toEqual(["ana", "beto"]);
  expect(Object.values(stored.metadata.reports)[0].source).toBe("instagram_export");
  expect(errors).toEqual([]);
});

test("elimina un reporte intermedio y reconstruye el timeline", async ({ page }) => {
  const errors = await openDashboard(page, "admin");
  await page.locator('[data-view="admin"]').click();
  await expect(page.locator('#report-manager-content [data-report-id="r2"]')).toBeVisible();
  await page.locator('#report-manager-content [data-report-id="r2"] [data-report-action="delete"]').click();
  await page.waitForFunction(() => {
    const timeline = globalThis.__ftTrustTest.storage.ft_timeline_demo_profile;
    return timeline && timeline.reports && timeline.reports.length === 2;
  });
  const timeline = await page.evaluate(() => globalThis.__ftTrustTest.storage.ft_timeline_demo_profile);
  expect(timeline.reports.map((report) => report.id)).toEqual(["r1", "r3"]);
  expect(errors).toEqual([]);
});
