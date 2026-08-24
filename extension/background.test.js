"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const extensionDir = __dirname;

function createBackgroundHarness(options = {}) {
  const listeners = {
    installed: [],
    startup: [],
    messages: [],
    storage: [],
    removed: [],
  };
  const data = {};
  const createdTabs = [];
  const sentMessages = [];
  const executedScripts = [];

  const context = vm.createContext({
    console,
    URL,
    Map,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  });

  context.chrome = {
    runtime: {
      lastError: null,
      getURL(file) { return `chrome-extension://follow-tracker/${file}`; },
      onInstalled: { addListener(listener) { listeners.installed.push(listener); } },
      onStartup: { addListener(listener) { listeners.startup.push(listener); } },
      onMessage: { addListener(listener) { listeners.messages.push(listener); } },
    },
    action: {
      setBadgeBackgroundColor() {},
      setBadgeText() {},
    },
    storage: {
      local: {
        get(keys, callback) {
          if (keys == null) { callback({ ...data }); return; }
          const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
          const result = {};
          list.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(data, key)) result[key] = data[key];
          });
          callback(result);
        },
        set(values, callback) {
          Object.assign(data, values);
          if (callback) callback();
        },
        remove(keys, callback) {
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]);
          if (callback) callback();
        },
      },
      onChanged: { addListener(listener) { listeners.storage.push(listener); } },
    },
    tabs: {
      create(tabOptions) { createdTabs.push(tabOptions); },
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        if (message.type === "PING") {
          callback(options.pingFails ? { ok: false } : { ok: true });
          return;
        }
        if (message.type === "SHOW_OVERLAY") callback({ ok: true });
      },
      onRemoved: { addListener(listener) { listeners.removed.push(listener); } },
    },
    scripting: {
      executeScript(request) {
        executedScripts.push(request);
        return Promise.resolve();
      },
    },
  };

  context.importScripts = (...files) => {
    files.forEach((file) => {
      const source = fs.readFileSync(path.join(extensionDir, file), "utf8");
      vm.runInContext(source, context, { filename: file });
    });
  };

  const background = fs.readFileSync(path.join(extensionDir, "background.js"), "utf8");
  vm.runInContext(background, context, { filename: "background.js" });
  return { context, listeners, data, createdTabs, sentMessages, executedScripts };
}

function dispatchMessage(harness, message, sender) {
  return new Promise((resolve) => {
    let answered = false;
    const sendResponse = (response) => {
      if (!answered) {
        answered = true;
        resolve(response);
      }
    };
    harness.listeners.messages.forEach((listener) => listener(message, sender || {}, sendResponse));
    setTimeout(() => {
      if (!answered) resolve(undefined);
    }, 60);
  });
}

test("abre el dashboard después de guardar una captura revisada", async () => {
  const harness = createBackgroundHarness();
  await dispatchMessage(
    harness,
    { source: "content", type: "capture-saved", profile: "demo_profile", reportId: "r2" },
    { tab: { id: 7, url: "https://www.instagram.com/demo_profile/" } }
  );
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(harness.createdTabs.length, 1);
  assert.equal(
    harness.createdTabs[0].url,
    "chrome-extension://follow-tracker/dashboard.html?profile=demo_profile#overview"
  );
});

test("el popup recibe confirmación sin esperar la revisión final", async () => {
  const harness = createBackgroundHarness();
  const response = await dispatchMessage(
    harness,
    { type: "START_FROM_POPUP", tabId: 22 },
    { tab: { id: 22, url: "https://www.instagram.com/demo_profile/" } }
  );
  assert.equal(response && response.ok, true);
  assert.equal(response && response.started, true);
  assert.deepEqual(
    harness.sentMessages.map((entry) => entry.message.type),
    ["PING", "SHOW_OVERLAY", "START_ANALYSIS"]
  );
});

test("inyecta únicamente los módulos nuevos cuando el content runtime no responde", async () => {
  const harness = createBackgroundHarness({ pingFails: true });
  await dispatchMessage(harness, { type: "ENSURE_OVERLAY", tabId: 33 }, { tab: { id: 33 } });
  assert.equal(harness.executedScripts.length, 1);
  const files = harness.executedScripts[0].files;
  assert.deepEqual(Array.from(files), [
    "core.js",
    "trust-core.js",
    "capture-store.js",
    "instagram-api.js",
    "instagram-ui.js",
    "analysis-overlay.js",
    "analysis-controller.js",
    "content-entry.js",
  ]);
  assert.equal(files.includes("content.js"), false);
  assert.equal(files.includes("export-policy.js"), false);
});

test("convierte cambios de la captura aceptada en una línea temporal", () => {
  const harness = createBackgroundHarness();
  const first = {
    schemaVersion: 3,
    profile: "demo_profile",
    followers: ["ana", "beto"],
    following: ["ana"],
    updatedAt: "2026-08-20T10:00:00.000Z",
    runId: "run-1",
  };
  const second = {
    ...first,
    followers: ["ana", "carla"],
    updatedAt: "2026-08-21T10:00:00.000Z",
    runId: "run-2",
  };

  harness.data.ft_timeline_demo_profile = harness.context.FollowTrackerHistory.appendSnapshot(null, null, first);
  harness.listeners.storage[0](
    { ft_history_demo_profile: { oldValue: first, newValue: second } },
    "local"
  );

  const timeline = harness.data.ft_timeline_demo_profile;
  assert.equal(timeline.reports.length, 2);
  assert.deepEqual(Array.from(timeline.reports[1].changes.lostFollowers), ["beto"]);
  assert.deepEqual(Array.from(timeline.reports[1].changes.newFollowers), ["carla"]);
});

test("la migración crea una configuración segura por defecto", () => {
  const harness = createBackgroundHarness();
  harness.listeners.installed[0]();
  assert.equal(harness.data.ft_settings.confirmRemovalsAfter, 2);
  assert.equal(harness.data.ft_settings.autoAcceptTrusted, false);
});
