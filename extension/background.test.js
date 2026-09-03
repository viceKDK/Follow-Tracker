"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const extensionDir = __dirname;

function createHarness(options = {}) {
  const listeners = { installed: [], startup: [], messages: [], storage: [], removed: [] };
  const data = { ...(options.seed || {}) };
  const createdTabs = [];
  const sentMessages = [];
  const context = vm.createContext({ console, URL, Map, Date, Promise, setTimeout, clearTimeout, TextEncoder });

  context.chrome = {
    runtime: {
      lastError: null,
      getManifest() { return { version: "3.0.0" }; },
      getURL(file) { return `chrome-extension://follow-tracker/${file}`; },
      onInstalled: { addListener(listener) { listeners.installed.push(listener); } },
      onStartup: { addListener(listener) { listeners.startup.push(listener); } },
      onMessage: { addListener(listener) { listeners.messages.push(listener); } },
    },
    action: { setBadgeBackgroundColor() {}, setBadgeText() {} },
    storage: {
      local: {
        get(keys, callback) {
          if (keys == null) return callback({ ...data });
          const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
          callback(names.reduce((output, key) => {
            if (Object.prototype.hasOwnProperty.call(data, key)) output[key] = data[key];
            return output;
          }, {}));
        },
        set(values, callback) { Object.assign(data, values); callback && callback(); },
        remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]); callback && callback(); },
      },
      onChanged: { addListener(listener) { listeners.storage.push(listener); } },
    },
    tabs: {
      create(optionsValue) { createdTabs.push(optionsValue); },
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        if (message.type === "PING") return callback(options.pingFails ? { ok: false } : { ok: true, runtimeVersion: 3 });
        if (["SHOW_OVERLAY", "START_ANALYSIS", "CANCEL_ANALYSIS"].includes(message.type)) callback({ ok: true });
      },
      onRemoved: { addListener(listener) { listeners.removed.push(listener); } },
    },
  };

  context.importScripts = (...files) => files.forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(extensionDir, file), "utf8"), context, { filename: file });
  });
  vm.runInContext(fs.readFileSync(path.join(extensionDir, "background.js"), "utf8"), context, { filename: "background.js" });
  return { context, listeners, data, createdTabs, sentMessages };
}

function dispatch(harness, message, sender) {
  return new Promise((resolve) => {
    let answered = false;
    const respond = (value) => { if (!answered) { answered = true; resolve(value); } };
    harness.listeners.messages.forEach((listener) => listener(message, sender || {}, respond));
    setTimeout(() => respond(undefined), 80);
  });
}

test("abre el dashboard después de guardar una captura revisada", async () => {
  const harness = createHarness();
  await dispatch(harness, { source: "content", type: "capture-saved", profile: "demo_profile" }, { tab: { id: 7, url: "https://www.instagram.com/demo_profile/" } });
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(harness.createdTabs[0].url, "chrome-extension://follow-tracker/dashboard.html?profile=demo_profile#overview");
});

test("el popup recibe confirmación sin esperar el análisis completo", async () => {
  const harness = createHarness();
  const response = await dispatch(harness, { type: "START_FROM_POPUP", tabId: 22 }, { tab: { id: 22 } });
  assert.equal(response.ok, true);
  assert.equal(response.started, true);
  assert.deepEqual(harness.sentMessages.map((entry) => entry.message.type), ["PING", "SHOW_OVERLAY", "START_ANALYSIS"]);
});

test("no inyecta código dinámicamente y pide recargar cuando falta el content script", async () => {
  const harness = createHarness({ pingFails: true });
  const response = await dispatch(harness, { type: "ENSURE_OVERLAY", tabId: 33 }, { tab: { id: 33 } });
  assert.equal(response.ok, false);
  assert.equal(response.code, "reload_required");
  assert.match(response.error, /recarg/i);
  assert.deepEqual(harness.sentMessages.map((entry) => entry.message.type), ["PING"]);
  assert.equal(Object.prototype.hasOwnProperty.call(harness.context.chrome, "scripting"), false);
});

test("convierte snapshots aceptados en un timeline cronológico con calidad", () => {
  const first = { profile: "demo", followers: ["ana", "beto"], following: ["ana"], updatedAt: "2026-08-20T10:00:00Z", runId: "r1" };
  const second = { profile: "demo", followers: ["ana", "carla"], following: ["ana"], updatedAt: "2026-08-21T10:00:00Z", runId: "r2" };
  const harness = createHarness({ seed: { ft_timeline_demo: harnessTimeline(first) } });
  harness.listeners.storage[0]({ ft_history_demo: { oldValue: first, newValue: second } }, "local");
  const timeline = harness.data.ft_timeline_demo;
  assert.deepEqual(Array.from(timeline.reports[1].changes.lostFollowers), ["beto"]);
  assert.deepEqual(Array.from(timeline.reports[1].changes.newFollowers), ["carla"]);
  assert.equal(Boolean(timeline.reports[1].quality), true);
});

function harnessTimeline(snapshot) {
  const History = require("./history.js");
  return History.appendSnapshot(null, null, snapshot);
}

test("la migración crea versión, configuración segura y backup al instalar", async () => {
  const harness = createHarness();
  await harness.listeners.installed[0]();
  assert.equal(harness.data.ft_settings.confirmRemovalsAfter, 2);
  assert.equal(harness.data.ft_settings.autoAcceptTrusted, false);
  assert.equal(harness.data.ft_settings.minRemovalConfidence, 0.95);
  assert.equal(harness.data.ft_storage_meta.schemaVersion, 2);
  assert.ok(harness.data.ft_storage_migration_backup.checksum);
  assert.equal(harness.listeners.startup.length, 1);
});
