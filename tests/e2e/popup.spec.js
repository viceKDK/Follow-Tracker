"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const root = path.resolve(__dirname, "..", "..");
const extension = path.join(root, "extension");
const History = require(path.join(extension, "history.js"));
let server;
let popupUrl;

function snapshot(profile, reportId, followers, following, updatedAt) {
  return { schemaVersion: 3, profile, reportId, runId: reportId, followers, following, updatedAt };
}

function savedHistory() {
  const a = snapshot("ana", "a1", ["beto"], ["carla"], "2026-10-01T09:00:00Z");
  const b = snapshot("ana", "a2", ["beto", "diana"], ["carla"], "2026-10-12T09:00:00Z");
  const c = snapshot("martin", "m1", ["ana"], ["ana"], "2026-10-04T09:00:00Z");
  return {
    ft_history_ana: b,
    ft_timeline_ana: History.appendSnapshot(History.appendSnapshot(null, null, a), a, b),
    ft_history_martin: c,
    ft_timeline_martin: History.appendSnapshot(null, null, c),
    ft_capture_meta_ana: { reports: { a2: { status: "trusted", score: 100 } } },
    ft_capture_meta_martin: { reports: { m1: { status: "trusted", score: 100 } } },
  };
}

function serve(req, res) {
  const raw = new URL(req.url, "http://127.0.0.1");
  const relative = raw.pathname.replace(/^\/extension\//, "").replace(/^\//, "") || "popup.html";
  const candidate = path.resolve(extension, relative);
  if (!candidate.startsWith(`${extension}${path.sep}`)) return res.writeHead(403).end("Forbidden");
  fs.stat(candidate, (error, stat) => {
    if (error || !stat.isFile()) return res.writeHead(404).end("Not found");
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" }[path.extname(candidate)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    fs.createReadStream(candidate).pipe(res);
  });
}

async function installPopupMocks(page, { tabUrl = "https://example.com/", storage = {}, fastKeys = false } = {}) {
  await page.addInitScript(({ currentTabUrl, initial, enableFastKeys }) => {
    const data = JSON.parse(JSON.stringify(initial));
    const opened = [];
    const messages = [];
    const reads = [];
    globalThis.__popupTest = { opened, messages, reads, data };
    globalThis.close = () => {};
    globalThis.chrome = {
      tabs: {
        query: async () => [{ id: 88, url: currentTabUrl }],
        create: ({ url }) => { opened.push(url); },
      },
      runtime: {
        lastError: null,
        getURL: (url) => `chrome-extension://test/${url}`,
        sendMessage: (message, callback) => {
          messages.push(message.type);
          callback && callback({ ok: true });
        },
      },
      storage: {
        local: {
          set: (values, callback) => { Object.assign(data, values); if (callback) callback(); },
          get: (keys, callback) => {
            reads.push(keys);
            if (keys == null) return callback({ ...data });
            const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            return callback(names.reduce((result, key) => {
              if (Object.prototype.hasOwnProperty.call(data, key)) result[key] = data[key];
              return result;
            }, {}));
          },
        },
      },
    };
    if (enableFastKeys) globalThis.chrome.storage.local.getKeys = async () => Object.keys(data);
  }, { currentTabUrl: tabUrl, initial: storage, enableFastKeys: fastKeys });
}

test.beforeAll(async () => {
  server = http.createServer(serve);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  popupUrl = `http://127.0.0.1:${server.address().port}/extension/popup.html`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("fuera de Instagram permite elegir datos guardados y abrir cada resultado", async ({ page }) => {
  await installPopupMocks(page, { storage: savedHistory() });
  await page.goto(popupUrl);
  await expect(page.locator("#saved-profile-picker")).toBeVisible();
  await expect(page.locator("#saved-profile-select")).toHaveValue("ana");
  await expect(page.locator("#followers-count")).toHaveText("2");
  await expect(page.locator("#reports-count")).toHaveText("2");
  await expect(page.locator("#capture-progress-value")).toHaveText("3/3");
  await expect(page.locator("#analyze-button")).toContainText("Abrir @ana para analizar");

  await page.locator("#recent-button").click();
  await page.locator("#changes-button").click();
  await page.locator("#activity-button").click();
  await page.locator("#dashboard-button").click();
  await expect.poll(() => page.evaluate(() => globalThis.__popupTest.opened.length)).toBe(4);
  const destinations = await page.evaluate(() => globalThis.__popupTest.opened);
  expect(destinations.map((url) => new URL(url).hash)).toEqual(["#recent", "#relationships", "#activity", "#overview"]);
  expect(destinations.every((url) => url.includes("profile=ana"))).toBe(true);

  await page.locator("#saved-profile-select").selectOption("martin");
  await expect(page.locator("#followers-count")).toHaveText("1");
  await expect(page.locator("#reports-count")).toHaveText("1");
  await page.locator("#analyze-button").click();
  await expect.poll(() => page.evaluate(() => globalThis.__popupTest.opened.length)).toBe(5);
  expect((await page.evaluate(() => globalThis.__popupTest.opened.at(-1)))).toBe("https://www.instagram.com/martin/");
  expect(await page.evaluate(() => globalThis.__popupTest.messages)).toEqual([]);
});

test("recuerda el último perfil seleccionado y prioriza la pestaña activa", async ({ page }) => {
  const storage = { ...savedHistory(), ft_popup_last_profile: "martin" };
  await installPopupMocks(page, { storage });
  await page.goto(popupUrl);
  await expect(page.locator("#saved-profile-select")).toHaveValue("martin");
  await page.locator("#saved-profile-select").selectOption("ana");
  await expect(page.locator("#reports-count")).toHaveText("2");
  const remembered = await page.evaluate(() => globalThis.__popupTest.data.ft_popup_last_profile);
  expect(remembered).toBe("ana");
});

test("con storage.getKeys no carga todo el historial al abrir el popup", async ({ page }) => {
  await installPopupMocks(page, { storage: savedHistory(), fastKeys: true });
  await page.goto(popupUrl);
  await expect(page.locator("#saved-profile-select")).toHaveValue("ana");
  await expect(page.locator("#followers-count")).toHaveText("2");
  const reads = await page.evaluate(() => globalThis.__popupTest.reads);
  expect(reads).not.toContain(null);
  expect(reads.some((keys) => Array.isArray(keys) && keys.includes("ft_history_ana") && keys.includes("ft_timeline_ana"))).toBe(true);
  expect(reads.some((keys) => Array.isArray(keys) && keys.includes("ft_history_martin"))).toBe(false);
});

test("en el perfil correcto inicia revisión antes de capturar", async ({ page }) => {
  await installPopupMocks(page, { tabUrl: "https://www.instagram.com/Ana/", storage: {} });
  await page.goto(popupUrl);
  await expect(page.locator("#analyze-button")).toContainText("Hacer primera captura");
  await expect(page.locator("#capture-progress-value")).toHaveText("0/3");
  await page.locator("#analyze-button").click();
  await expect.poll(() => page.evaluate(() => globalThis.__popupTest.messages.length)).toBe(3);
  expect(await page.evaluate(() => globalThis.__popupTest.messages)).toEqual([
    "ENSURE_OVERLAY", "SHOW_OVERLAY_TAB", "START_FROM_POPUP",
  ]);
});

test("si hay una revisión pendiente no inicia una segunda captura", async ({ page }) => {
  const storage = savedHistory();
  storage.ft_pending_capture_ana = { profile: "ana", id: "pending-a3" };
  await installPopupMocks(page, { tabUrl: "https://www.instagram.com/ana/", storage });
  await page.goto(popupUrl);
  await expect(page.locator("#pending-summary")).toBeVisible();
  await expect(page.locator("#analyze-button")).toContainText("Continuar revisión");
  await expect(page.locator("#capture-progress-value")).toHaveText("2/3");
  await page.locator("#analyze-button").click();
  await expect.poll(() => page.evaluate(() => globalThis.__popupTest.messages.length)).toBe(2);
  expect(await page.evaluate(() => globalThis.__popupTest.messages)).toEqual([
    "ENSURE_OVERLAY", "SHOW_OVERLAY_TAB",
  ]);
});

test("sin perfiles guardados ni pestaña de Instagram mantiene un inicio guiado", async ({ page }) => {
  await installPopupMocks(page);
  await page.goto(popupUrl);
  await expect(page.locator("#saved-profile-picker")).toBeHidden();
  await expect(page.locator("#mini-stats")).toBeHidden();
  await expect(page.locator("#capture-progress-value")).toHaveText("0/3");
  await expect(page.locator("#analyze-button")).toContainText("Abrir Instagram para empezar");
  await page.locator("#analyze-button").click();
  expect((await page.evaluate(() => globalThis.__popupTest.opened.at(-1)))).toBe("https://www.instagram.com/");
  expect(await page.evaluate(() => globalThis.__popupTest.messages)).toEqual([]);
});
