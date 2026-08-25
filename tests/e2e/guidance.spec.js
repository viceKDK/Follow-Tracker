"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..", "..");
const extension = path.join(root, "extension");
let server;
let dashboardUrl;

function snapshot(profile, id, followers, following, capturedAt) {
  return { schemaVersion: 3, profile, followers, following, updatedAt: capturedAt, runId: id, reportId: id };
}

function seed({ reports = 1, pending = false } = {}) {
  const profile = "guidance_demo";
  const first = snapshot(profile, "r1", ["ana"], ["ana"], "2026-08-20T10:00:00Z");
  const second = snapshot(profile, "r2", ["ana", "beto"], ["ana"], "2026-08-24T10:00:00Z");
  const History = require(path.join(extension, "history.js"));
  let timeline = History.appendSnapshot(null, null, first);
  if (reports > 1) timeline = History.appendSnapshot(timeline, first, second);
  const current = reports > 1 ? second : first;
  const data = {
    [`ft_history_${profile}`]: current,
    [`ft_timeline_${profile}`]: timeline,
    [`ft_backup_status_${profile}`]: {
      backedUpAt: "2026-08-24T10:00:00Z",
      reportId: current.reportId,
      reportCount: reports,
    },
    ft_settings: { backupReminderDays: 30, backupReminderReports: 5 },
  };
  if (pending) data[`ft_pending_capture_${profile}`] = { profile, id: "pending-r3" };
  return data;
}

function serve(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname.replace(/^\/extension\//, "").replace(/^\//, "") || "dashboard.html";
  const candidate = path.resolve(extension, relative);
  if (!candidate.startsWith(`${extension}${path.sep}`)) return response.writeHead(403).end("Forbidden");
  fs.stat(candidate, (error, stat) => {
    if (error || !stat.isFile()) return response.writeHead(404).end("Not found");
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(candidate)] || "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    fs.createReadStream(candidate).pipe(response);
  });
}

async function installMocks(page, initialStorage) {
  await page.addInitScript(({ seedValue }) => {
    const storage = JSON.parse(JSON.stringify(seedValue));
    const listeners = [];
    globalThis.chrome = {
      runtime: { lastError: null, getURL(file) { return new URL(file, location.origin).href; } },
      tabs: { create() {} },
      storage: {
        local: {
          get(keys, callback) {
            if (keys == null) return callback({ ...storage });
            const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            callback(names.reduce((output, key) => {
              if (Object.prototype.hasOwnProperty.call(storage, key)) output[key] = storage[key];
              return output;
            }, {}));
          },
          set(values, callback) { Object.assign(storage, values); callback && callback(); },
          remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete storage[key]); callback && callback(); },
        },
        onChanged: {
          addListener(listener) { listeners.push(listener); },
          removeListener(listener) { const index = listeners.indexOf(listener); if (index >= 0) listeners.splice(index, 1); },
        },
      },
    };
    globalThis.confirm = () => true;
    URL.createObjectURL = () => "blob:guidance";
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {};
  }, { seedValue: initialStorage });
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

test("con una sola captura recomienda crear la comparación", async ({ page }) => {
  await installMocks(page, seed({ reports: 1 }));
  await page.goto(`${dashboardUrl}?profile=guidance_demo#overview`);
  await expect(page.locator("#guidance-panel")).toBeVisible();
  await expect(page.locator("#guidance-primary")).toHaveText("Hacé una segunda captura");
  await expect(page.locator("#guidance-progress-value")).toHaveText("1/3");
});

test("una captura pendiente siempre queda por encima de acciones secundarias", async ({ page }) => {
  await installMocks(page, seed({ reports: 2, pending: true }));
  await page.goto(`${dashboardUrl}?profile=guidance_demo#overview`);
  await expect(page.locator("#guidance-primary")).toHaveText("Terminá de revisar la captura pendiente");
  await expect(page.locator("#guidance-reason")).toContainText("conclusiones falsas");
});

test("con historial sano lleva a Antes y ahora", async ({ page }) => {
  await installMocks(page, seed({ reports: 2 }));
  await page.goto(`${dashboardUrl}?profile=guidance_demo#overview`);
  await expect(page.locator("#guidance-primary")).toContainText("Revisá 1 cambio reciente");
  await page.locator("#guidance-primary").click();
  await expect(page.locator("#relationships")).toBeVisible();
  await expect(page.locator('[data-view="relationships"]')).toHaveAttribute("aria-selected", "true");
});
