"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const docs = path.join(root, "docs");
const port = Number(process.env.FT_CAPTURE_PORT || 4187);
const previewUrl = `http://127.0.0.1:${port}/dashboard.html?profile=demo_profile`;
const usageProfile = "ellisbah1";
const usageUrl = `https://www.instagram.com/${usageProfile}/`;

const dashboardViews = [
  ["overview", "screen-overview.png"],
  ["relationships", "screen-relationships.png"],
  ["people", "screen-people.png"],
  ["activity", "screen-activity.png"],
  ["admin", "screen-admin.png"],
];

const installViews = [
  ["extract", "install-02-extract.png"],
  ["load", "install-03-load.png"],
  ["pin", "install-04-pin.png"],
];

async function waitForPreview(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // El servidor todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`El preview no respondió en ${url}`);
}

async function captureDashboard(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  for (const [view, filename] of dashboardViews) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${previewUrl}#${view}`, { waitUntil: "domcontentloaded" });
    await page.locator(`#${view}`).waitFor({ state: "visible" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 1600, height: Math.min(Math.max(documentHeight, 1000), 3000) });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(docs, filename) });
  }
  await page.close();
}

async function captureInstallationGuide(browser) {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 1 });
  const guideUrl = pathToFileURL(path.join(docs, "install-guide.html")).href;
  for (const [view, filename] of installViews) {
    await page.goto(`${guideUrl}#${view}`, { waitUntil: "load" });
    await page.locator(`#${view}`).screenshot({ path: path.join(docs, filename) });
  }
  await page.close();
}

async function captureGithubDownload(browser) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  await page.goto("https://github.com/viceKDK/Follow-Tracker", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.getByRole("link", { name: "Download ZIP", exact: true }).waitFor({ state: "visible" });
  await page.mouse.move(1300, 820);
  await page.screenshot({ path: path.join(docs, "install-01-download-zip.png") });
  await page.close();
}

async function capturePopup(browser) {
  const page = await browser.newPage({ viewport: { width: 430, height: 760 }, deviceScaleFactor: 1 });
  await page.addInitScript((demoUrl) => {
    const storage = {};
    globalThis.chrome = {
      runtime: {
        lastError: null,
        getURL: (file) => new URL(file, location.href).href,
        sendMessage: (_message, callback) => callback?.({ ok: true }),
      },
      tabs: {
        query: (_query, callback) => {
          const tabs = [{ id: 1, url: demoUrl }];
          callback?.(tabs);
          return Promise.resolve(tabs);
        },
        create: () => {},
      },
      storage: {
        local: {
          get: (keys, callback) => {
            const requested = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            callback(Object.fromEntries(requested.filter((key) => key in storage).map((key) => [key, storage[key]])));
          },
        },
      },
    };
  }, usageUrl);
  await page.goto(pathToFileURL(path.join(root, "extension", "popup.html")).href, { waitUntil: "load" });
  await page.locator("#profile-name").filter({ hasText: `@${usageProfile}` }).waitFor();
  await page.locator(".popup-shell").screenshot({ path: path.join(docs, "usage-01-popup.png") });
  await page.close();
}

async function installUsageMocks(page) {
  await page.addInitScript(() => {
    const storage = {};
    const listeners = [];
    globalThis.__ftUsage = { storage, listeners };
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: (_message, callback) => callback?.({ ok: true }),
        onMessage: { addListener: (listener) => listeners.push(listener) },
      },
      storage: {
        local: {
          get: (keys, callback) => {
            if (keys == null) return callback({ ...storage });
            const requested = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
            callback(Object.fromEntries(requested.filter((key) => key in storage).map((key) => [key, storage[key]])));
          },
          set: (values, callback) => { Object.assign(storage, values); callback?.(); },
          remove: (keys, callback) => {
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete storage[key]);
            callback?.();
          },
        },
      },
    };
    globalThis.__ftShowOverlay = () => new Promise((resolve) => {
      let answered = false;
      const respond = (response) => {
        if (answered) return;
        answered = true;
        resolve(response);
      };
      listeners.forEach((listener) => listener({ type: "SHOW_OVERLAY" }, {}, respond));
      setTimeout(() => respond({ ok: false }), 100);
    });
  });
}

async function mockUsageInstagram(page) {
  const followers = Array.from({ length: 252 }, (_, index) => ({
    pk: `f${index + 1}`,
    username: `demo_follower_${String(index + 1).padStart(3, "0")}`,
    full_name: "Cuenta demo",
  }));
  const following = Array.from({ length: 440 }, (_, index) => ({
    pk: `g${index + 1}`,
    username: `demo_following_${String(index + 1).padStart(3, "0")}`,
    full_name: "Cuenta demo",
  }));
  await page.route("**/api/v1/users/web_profile_info/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { user: { id: "123", username: usageProfile, is_private: false, followed_by_viewer: true, edge_followed_by: { count: followers.length }, edge_follow: { count: following.length } } } }),
    });
  });
  await page.route("**/api/v1/friendships/123/followers/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ users: followers }) });
  });
  await page.route("**/api/v1/friendships/123/following/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ users: following }) });
  });
}

async function dismissInstagramLoginPrompt(page) {
  const close = page.getByRole("button", { name: /^(Close|Cerrar)$/i }).first();
  if (!await close.isVisible()) return;
  await close.click();
  await close.waitFor({ state: "hidden", timeout: 5000 });
}

async function captureUsageFlow(browser) {
  await capturePopup(browser);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    bypassCSP: true,
  });
  const page = await context.newPage();
  await installUsageMocks(page);
  await mockUsageInstagram(page);
  await page.goto(usageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator(`h2:has-text("${usageProfile}"), header`).first().waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2500);
  await dismissInstagramLoginPrompt(page);
  const extensionFiles = [
    "follower-identity.js", "follower-imports.js", "follower-relations.js", "core-facade.js",
    "trust-core.js", "trust-domain-adapter.js", "platform-storage.js", "capture-store.js",
    "instagram-api.js", "instagram-ui.js", "analysis-overlay.js", "analysis-controller.js", "content-entry.js",
  ];
  for (const file of extensionFiles) await page.addScriptTag({ path: path.join(root, "extension", file) });
  await page.evaluate(() => globalThis.__ftShowOverlay());
  await page.locator("#ft3-start").click();
  await page.locator("#ft3-status").filter({ hasText: /Iniciando|Conectando|Recolectando/ }).waitFor();
  await page.screenshot({ path: path.join(docs, "usage-02-analysis-running.png") });
  await page.locator("#ft3-review").waitFor({ state: "visible", timeout: 15000 });
  await dismissInstagramLoginPrompt(page);
  await page.screenshot({ path: path.join(docs, "usage-03-review.png") });
  await page.locator('[data-review="save"]').click();
  await page.locator("#ft3-status").filter({ hasText: "Reporte guardado" }).waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(docs, "usage-04-saved.png") });
  await context.close();
}

async function main() {
  fs.mkdirSync(docs, { recursive: true });
  const preview = spawn(process.execPath, [path.join(root, "scripts", "preview-dashboard.js")], {
    cwd: root,
    env: { ...process.env, FT_PREVIEW_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let browser;
  try {
    await waitForPreview(previewUrl);
    browser = await chromium.launch({ headless: true });
    await captureDashboard(browser);
    await captureInstallationGuide(browser);
    await captureUsageFlow(browser);
    await captureGithubDownload(browser);
    console.log("Capturas del README regeneradas correctamente.");
  } finally {
    await browser?.close();
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
