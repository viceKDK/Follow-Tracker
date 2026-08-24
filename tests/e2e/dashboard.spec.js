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
  ".webp": "image/webp",
};

let server;
let dashboardUrl;

function dashboardSeed() {
  const profile = "demo_profile";
  const snapshot = {
    schemaVersion: 2,
    profile,
    followers: ["ana", "carla", "eva"],
    following: ["ana", "beto", "eva"],
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
      following: ["ana", "diana"],
    },
    reports: [
      {
        id: "r1",
        runId: "r1",
        capturedAt: "2026-08-20T10:00:00.000Z",
        isBaseline: true,
        followersCount: 2,
        followingCount: 2,
        mutualCount: 1,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: {
          newFollowers: [],
          lostFollowers: [],
          newFollowing: [],
          lostFollowing: [],
        },
        eventCount: 0,
      },
      {
        id: "r2",
        runId: "r2",
        capturedAt: "2026-08-21T10:00:00.000Z",
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
          lostFollowing: ["diana"],
        },
        eventCount: 4,
      },
      {
        id: "r3",
        runId: "r3",
        capturedAt: snapshot.updatedAt,
        isBaseline: false,
        followersCount: 3,
        followingCount: 3,
        mutualCount: 2,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: {
          newFollowers: ["eva"],
          lostFollowers: [],
          newFollowing: ["eva"],
          lostFollowing: [],
        },
        eventCount: 2,
      },
    ],
    events: [
      {
        id: "r2:followed_you:carla",
        profile,
        username: "carla",
        type: "followed_you",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r2:unfollowed_you:beto",
        profile,
        username: "beto",
        type: "unfollowed_you",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r2:you_followed:beto",
        profile,
        username: "beto",
        type: "you_followed",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r2:you_unfollowed:diana",
        profile,
        username: "diana",
        type: "you_unfollowed",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r3:followed_you:eva",
        profile,
        username: "eva",
        type: "followed_you",
        occurredAt: snapshot.updatedAt,
        reportId: "r3",
        runId: "r3",
      },
      {
        id: "r3:you_followed:eva",
        profile,
        username: "eva",
        type: "you_followed",
        occurredAt: snapshot.updatedAt,
        reportId: "r3",
        runId: "r3",
      },
    ],
  };

  return {
    [`ft_history_${profile}`]: snapshot,
    [`ft_timeline_${profile}`]: timeline,
  };
}

function serveExtension(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname === "/" ? "dashboard.html" : url.pathname.replace(/^\/extension\//, "").replace(/^\//, "");
  const candidate = path.resolve(extensionRoot, relative);

  if (!candidate.startsWith(`${extensionRoot}${path.sep}`) && candidate !== extensionRoot) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(candidate, (statError, stat) => {
    if (statError || !stat.isFile()) {
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

async function installDashboardMocks(page, seed = dashboardSeed()) {
  await page.addInitScript(({ initialStorage }) => {
    const persisted = sessionStorage.getItem("__ft_dashboard_storage");
    const storage = persisted ? JSON.parse(persisted) : JSON.parse(JSON.stringify(initialStorage));
    const storageListeners = [];
    const downloads = [];
    const blobs = [];
    const openedTabs = [];

    function persist() {
      sessionStorage.setItem("__ft_dashboard_storage", JSON.stringify(storage));
    }

    function selectStorage(keys) {
      if (keys == null) return { ...storage };
      if (typeof keys === "string") {
        return Object.prototype.hasOwnProperty.call(storage, keys) ? { [keys]: storage[keys] } : {};
      }
      if (Array.isArray(keys)) {
        return keys.reduce((result, key) => {
          if (Object.prototype.hasOwnProperty.call(storage, key)) result[key] = storage[key];
          return result;
        }, {});
      }
      if (typeof keys === "object") {
        return Object.entries(keys).reduce((result, [key, fallback]) => {
          result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback;
          return result;
        }, {});
      }
      return {};
    }

    globalThis.__ftDashboardTest = { storage, downloads, blobs, openedTabs };
    globalThis.confirm = () => true;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        getURL(file) { return new URL(file, location.origin).href; },
      },
      tabs: {
        create(options) { openedTabs.push(options); },
      },
      storage: {
        local: {
          get(keys, callback) { callback(selectStorage(keys)); },
          set(values, callback) {
            const changes = {};
            Object.entries(values || {}).forEach(([key, value]) => {
              changes[key] = { oldValue: storage[key], newValue: value };
              storage[key] = value;
            });
            persist();
            if (callback) callback();
            queueMicrotask(() => storageListeners.forEach((listener) => listener(changes, "local")));
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
            queueMicrotask(() => storageListeners.forEach((listener) => listener(changes, "local")));
          },
        },
        onChanged: {
          addListener(listener) { storageListeners.push(listener); },
        },
      },
    };

    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return `blob:follow-tracker-dashboard-${blobs.length}`;
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function recordDownload() {
      if (this.download) downloads.push(this.download);
    };
  }, { initialStorage: seed });
}

async function openDashboard(page, hash = "relationships") {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installDashboardMocks(page);
  await page.goto(`${dashboardUrl}?profile=demo_profile#${hash}`);
  await expect(page.locator("#dashboard-content")).toBeVisible();
  await expect(page.locator("#profile-select")).toHaveValue("demo_profile");
  await expect(page.locator("#relationship-advanced")).toBeAttached();
  return pageErrors;
}

test.beforeAll(async () => {
  server = http.createServer(serveExtension);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  dashboardUrl = `http://127.0.0.1:${address.port}/extension/dashboard.html`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

test("Antes y ahora filtra, pagina, abre detalle y exporta la vista", async ({ page }) => {
  const pageErrors = await openDashboard(page);

  await page.locator('[data-preset="first"]').click();
  await expect(page.locator("#compare-from")).toHaveValue("r1");
  await expect(page.locator("#compare-to")).toHaveValue("r3");
  await expect(page.locator("#relationship-visible-count")).toContainText("5 filas");

  await page.locator("#relationship-change-filter").selectOption("unfollowed-you");
  await page.locator("#relationship-search").fill("@beto");
  await expect(page.locator(".relationship-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".relationship-table tbody tr")).toContainText("@beto");

  await page.locator(".relationship-table tbody tr").click();
  await expect(page.locator("#rel-drawer-overlay")).toBeVisible();
  await expect(page.locator("#drawer-user")).toHaveText("@beto");
  await expect(page.locator("#drawer-status")).toContainText("Antes");
  await page.keyboard.press("Escape");
  await expect(page.locator("#rel-drawer-overlay")).toBeHidden();

  await page.locator("#export-comparison-list").click();
  const downloads = await page.evaluate(() => globalThis.__ftDashboardTest.downloads.slice());
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/^follow-tracker_lista_demo_profile_r1_a_r3\.csv$/);
  expect(pageErrors).toEqual([]);
});

test("Actividad combina filtros, pagina y exporta solamente las coincidencias", async ({ page }) => {
  const pageErrors = await openDashboard(page, "activity");
  await page.locator('[data-view="activity"]').click();
  await expect(page.locator("#activity-controls")).toBeVisible();

  await page.locator("#activity-type").selectOption("unfollowed_you");
  await page.locator("#activity-search").fill("beto");
  await expect(page.locator(".activity-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".activity-table tbody tr")).toContainText("@beto");
  await expect(page.locator("#event-total")).toContainText("1 de 6");

  await page.locator("#export-activity-view").click();
  const downloads = await page.evaluate(() => globalThis.__ftDashboardTest.downloads.slice());
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/^follow-tracker_actividad_filtrada_demo_profile_.*\.csv$/);
  expect(pageErrors).toEqual([]);
});

test("Resumen muestra historial saludable y permite exportar el diagnóstico", async ({ page }) => {
  const pageErrors = await openDashboard(page, "overview");
  await page.locator('[data-view="overview"]').click();
  await expect(page.locator("#data-health-panel")).toBeVisible();
  await expect(page.locator("#health-status")).toContainText("100/100");
  await expect(page.locator("#health-issues")).toContainText("No se detectaron");

  await page.locator("#export-health").click();
  const downloads = await page.evaluate(() => globalThis.__ftDashboardTest.downloads.slice());
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/^follow-tracker_diagnostico_demo_profile_.*\.json$/);
  expect(pageErrors).toEqual([]);
});

test("Importar backup rechaza JSON roto y restaura un perfil válido", async ({ page }) => {
  const pageErrors = await openDashboard(page, "overview");

  await page.locator("#import-backup-input").setInputFiles({
    name: "roto.json",
    mimeType: "application/json",
    buffer: Buffer.from("{no-es-json"),
  });
  await expect(page.locator("#product-toast")).toContainText("No se pudo leer");

  const imported = {
    snapshot: {
      schemaVersion: 2,
      profile: "imported_profile",
      followers: ["luz"],
      following: ["luz"],
      updatedAt: "2026-08-24T18:00:00.000Z",
      runId: "import-r1",
      reportId: "import-r1",
    },
    timeline: {
      schemaVersion: 2,
      profile: "imported_profile",
      createdAt: "2026-08-24T18:00:00.000Z",
      updatedAt: "2026-08-24T18:00:00.000Z",
      baseline: {
        profile: "imported_profile",
        reportId: "import-r1",
        runId: "import-r1",
        capturedAt: "2026-08-24T18:00:00.000Z",
        followers: ["luz"],
        following: ["luz"],
      },
      reports: [
        {
          id: "import-r1",
          runId: "import-r1",
          capturedAt: "2026-08-24T18:00:00.000Z",
          isBaseline: true,
          followersCount: 1,
          followingCount: 1,
          mutualCount: 1,
          followerOnlyCount: 0,
          followingOnlyCount: 0,
          changes: { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] },
          eventCount: 0,
        },
      ],
      events: [],
    },
  };

  await page.locator("#import-backup-input").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });

  await page.waitForFunction(() => Boolean(globalThis.__ftDashboardTest.storage.ft_history_imported_profile));
  const stored = await page.evaluate(() => ({
    snapshot: globalThis.__ftDashboardTest.storage.ft_history_imported_profile,
    timeline: globalThis.__ftDashboardTest.storage.ft_timeline_imported_profile,
  }));
  expect(stored.snapshot.profile).toBe("imported_profile");
  expect(stored.timeline.reports).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
