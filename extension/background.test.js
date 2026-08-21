"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const extensionDir = __dirname;

function createBackgroundHarness() {
  const listeners = {
    installed: [],
    messages: [],
    storage: [],
    removed: [],
  };
  const data = {};
  const createdTabs = [];
  const sentMessages = [];

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
          const list = Array.isArray(keys) ? keys : Object.keys(keys || {});
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
      create(options) { createdTabs.push(options); },
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        if (message.type === "PING" || message.type === "SHOW_OVERLAY") callback({ ok: true });
        // START_ANALYSIS se deja abierto para comprobar que el popup no espera
        // a que termine una ejecucion que puede durar varios minutos.
      },
      onRemoved: { addListener(listener) { listeners.removed.push(listener); } },
    },
    scripting: {
      executeScript() { return Promise.resolve(); },
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
  return { context, listeners, data, createdTabs, sentMessages };
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
    }, 40);
  });
}

test("abre el dashboard cuando se suprime el Excel heredado", async () => {
  const harness = createBackgroundHarness();
  await dispatchMessage(
    harness,
    { source: "content", type: "legacy-report-suppressed", profile: "demo_profile" },
    { tab: { id: 7, url: "https://www.instagram.com/demo_profile/" } }
  );
  assert.equal(harness.createdTabs.length, 1);
  assert.equal(
    harness.createdTabs[0].url,
    "chrome-extension://follow-tracker/dashboard.html?profile=demo_profile"
  );
});

test("el popup recibe confirmacion sin esperar a que termine el analisis", async () => {
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

test("convierte cambios de la captura actual en una linea temporal", () => {
  const harness = createBackgroundHarness();
  const first = {
    schemaVersion: 2,
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
