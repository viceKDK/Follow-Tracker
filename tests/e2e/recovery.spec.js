"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(projectRoot, "extension");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

let server;
let dashboardUrl;

function seed() {
  const profile = "rollback_demo";
  const first = {
    schemaVersion: 2,
    profile,
    followers: ["ana", "beto"],
    following: ["ana"],
    updatedAt: "2026-08-20T10:00:00.000Z",
    runId: "r1",
    reportId: "r1",
  };
  const second = {
    ...first,
    followers: ["ana", "carla"],
    following: ["ana", "beto"],
    updatedAt: "2026-08-24T10:00:00.000Z",
    runId: "r2",
    reportId: "r2",
  };
  return {
    [`ft_history_${profile}`]: second,
    [`ft_timeline_${profile}`]: {
      schemaVersion: 2,
      profile,
      createdAt: first.updatedAt,
      updatedAt: second.updatedAt,
      baseline: {
        profile,
        reportId: "r1",
        runId: "r1",
        capturedAt: first.updatedAt,
        followers: first.followers,
        following: first.following,
      },
      reports: [
        {
          id: "r1",
          runId: "r1",
          capturedAt: first.updatedAt,
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
          capturedAt: second.updatedAt,
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
      ],
      events: [
        {
          id: "r2:followed_you:carla",
          profile,
          username: "carla",
          type: "followed_you",
          occurredAt: second.updatedAt,
          reportId: "r2",
          runId: "r2",
        },
        {
          id: "r2:unfollowed_you:beto",
          profile,
          username: "beto",
          type: "unfollowed_you",
          occurredAt: second.updatedAt,
          reportId: "r2",
          runId: "r2",
        },
        {
          id: "r2:you_followed:beto",
          profile,
          username: "beto",
          type: "you_followed",
          occurredAt: second.updatedAt,
          reportId: "r2",
          runId: "r2",
        },
      ],
    },
  };
}

function serve(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname.replace(/^\/extension\//, "").replace(/^\//, "") || "dashboard.html";
  const candidate = path.resolve(extensionRoot, relative);
  if (!candidate.startsWith(`${extensionRoot}${path.sep}`)) {
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

async function installMocks(page) {
  await page.addInitScript(({ initialStorage }) => {
    const persisted = sessionStorage.getItem("__ft_rollback_storage");
    const storage = persisted ? JSON.parse(persisted) : JSON.parse(JSON.stringify(initialStorage));
    const listeners = [];

    function persist() {
      sessionStorage.setItem("__ft_rollback_storage", JSON.stringify(storage));
    }

    function selected(keys) {
      if (keys == null) return { ...storage };
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
      return list.reduce((result, key) => {
        if (Object.prototype.hasOwnProperty.call(storage, key)) result[key] = storage[key];
        return result;
      }, {});
    }

    globalThis.__ftRollbackTest = { storage };
    globalThis.confirm = () => true;
    globalThis.chrome = {
      runtime: { lastError: null, getURL(file) { return new URL(file, location.origin).href; } },
      tabs: { create() {} },
      storage: {
        local: {
          get(keys, callback) { callback(selected(keys)); },
          set(values, callback) {
            const changes = {};
            Object.entries(values || {}).forEach(([key, value]) => {
              changes[key] = { oldValue: storage[key], newValue: value };
              storage[key] = value;
            });
            persist();
            if (callback) callback();
            queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
          },
          remove(keys, callback) {
            const changes = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (!Object.prototype.hasOwnProperty.call(storage, key)) return;
              changes[key] = { oldValue: storage[key], newValue: undefined };
              delete storage[key];
            });
            persist();
            if (callback) callback();
            queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
          },
        },
        onChanged: { addListener(listener) { listeners.push(listener); } },
      },
    };
    URL.createObjectURL = () => "blob:rollback";
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {};
  }, { initialStorage: seed() });
}

test.beforeAll(async () => {
  server = http.createServer(serve);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  dashboardUrl = `http://127.0.0.1:${server.address().port}/extension/dashboard.html`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("deshace el último reporte y permite restaurarlo una vez", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installMocks(page);
  await page.goto(`${dashboardUrl}?profile=rollback_demo#overview`);

  await expect(page.locator("#report-recovery-panel")).toBeVisible();
  await expect(page.locator("#rollback-summary")).toContainText("r2");
  await expect(page.locator("#rollback-summary")).toContainText("r1");
  await expect(page.locator("#rollback-latest-report")).toBeEnabled();

  const rollbackReload = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await page.locator("#rollback-latest-report").click();
  await rollbackReload;
  await expect(page.locator("#dashboard-content")).toBeVisible();

  const rolledBack = await page.evaluate(() => ({
    timeline: globalThis.__ftRollbackTest.storage.ft_timeline_rollback_demo,
    recovery: globalThis.__ftRollbackTest.storage.ft_recovery_rollback_demo,
  }));
  expect(rolledBack.timeline.reports).toHaveLength(1);
  expect(rolledBack.recovery).toBeTruthy();

  await expect(page.locator("#restore-rollback")).toBeVisible({ timeout: 7000 });
  await expect(page.locator("#restore-rollback")).toBeEnabled();
  await expect(page.locator("#rollback-latest-report")).toBeDisabled();

  const restoreReload = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await page.locator("#restore-rollback").click();
  await restoreReload;
  await expect(page.locator("#dashboard-content")).toBeVisible();

  const restored = await page.evaluate(() => ({
    snapshot: globalThis.__ftRollbackTest.storage.ft_history_rollback_demo,
    timeline: globalThis.__ftRollbackTest.storage.ft_timeline_rollback_demo,
    recovery: globalThis.__ftRollbackTest.storage.ft_recovery_rollback_demo,
  }));
  expect(restored.recovery).toBeUndefined();
  expect(restored.snapshot.reportId).toBe("r2");
  expect(restored.snapshot.followers).toEqual(["ana", "carla"]);
  expect(restored.timeline.reports.map((report) => report.id)).toEqual(["r1", "r2"]);
  expect(pageErrors).toEqual([]);
});
