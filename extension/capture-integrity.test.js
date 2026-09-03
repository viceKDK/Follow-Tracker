"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Trust = require("./trust-domain-adapter.js");
const CaptureStore = require("./capture-store.js");
const InstagramUi = require("./instagram-ui.js");

function installStorage(seed) {
  const data = { ...(seed || {}) };
  global.chrome = {
    runtime: { lastError: null },
    storage: { local: {
      get(keys, callback) {
        if (keys == null) { callback({ ...data }); return; }
        const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
        callback(names.reduce((output, key) => {
          if (Object.prototype.hasOwnProperty.call(data, key)) output[key] = data[key];
          return output;
        }, {}));
      },
      set(values, callback) { Object.assign(data, values || {}); callback && callback(); },
      remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]); callback && callback(); },
    } },
  };
  return data;
}

function capture(profile, runId, followers, options) {
  const settings = options || {};
  return CaptureStore.stageCapture({
    profile,
    source: "api",
    followers: followers.map((username) => ({ username })),
    following: [],
    expectedFollowers: settings.expectedFollowers,
    expectedFollowing: 0,
    capturedAt: settings.capturedAt,
    runId,
    captureMetrics: {
      followers: { paginationCompleted: settings.paginationCompleted, terminationReason: settings.terminationReason || "" },
      following: { paginationCompleted: true, terminationReason: "end_of_pagination" },
    },
  });
}


test("un contador abreviado de Instagram no se trata como total exacto", () => {
  function trigger(text, title = "") {
    return {
      textContent: text,
      hasAttribute(name) { return name === "title" && Boolean(title); },
      getAttribute(name) { return name === "title" ? title : ""; },
      querySelector() { return null; },
    };
  }
  assert.deepEqual(InstagramUi.expectedInfoFromTrigger(trigger("1.2K followers")), { value: 1200, exact: false });
  assert.deepEqual(InstagramUi.expectedInfoFromTrigger(trigger("1.234 seguidores", "1.234")), { value: 1234, exact: true });
});

test("dos capturas parciales no avanzan ni confirman un unfollow", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  const data = installStorage({
    [keys.history]: { profile, followers: ["ana", "beto", "carla"], following: [], updatedAt: "2026-08-20T10:00:00Z", runId: "r1" },
    ft_settings: { confirmRemovalsAfter: 2 },
  });

  const first = await capture(profile, "r2", ["ana"], {
    expectedFollowers: 3, paginationCompleted: false, terminationReason: "stalled", capturedAt: "2026-08-21T10:00:00Z",
  });
  assert.equal(first.completeness.canConfirmRemovals, false);
  assert.deepEqual(first.review.changes.lostFollowers, []);
  assert.deepEqual(first.snapshot.followers, ["ana", "beto", "carla"]);
  assert.equal(first.review.deferredAbsences.followers.length, 2);
  assert.deepEqual(first.absenceState.followers, {});
  await CaptureStore.commitStage(first, "save_suspicious");

  const second = await capture(profile, "r3", ["ana"], {
    expectedFollowers: 3, paginationCompleted: false, terminationReason: "stalled", capturedAt: "2026-08-22T10:00:00Z",
  });
  assert.deepEqual(second.review.changes.lostFollowers, []);
  assert.deepEqual(second.absenceState.followers, {});
  assert.deepEqual(data[keys.history].followers, ["ana", "beto", "carla"]);
});

test("sólo dos capturas completas consecutivas confirman las ausencias", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  const data = installStorage({
    [keys.history]: { profile, followers: ["ana", "beto", "carla"], following: [], updatedAt: "2026-08-20T10:00:00Z", runId: "r1" },
    ft_settings: { confirmRemovalsAfter: 2 },
  });
  const first = await capture(profile, "r2", ["ana"], {
    expectedFollowers: 1, paginationCompleted: true, capturedAt: "2026-08-21T10:00:00Z",
  });
  assert.equal(first.review.pendingAbsences.followers.length, 2);
  assert.deepEqual(first.review.changes.lostFollowers, []);
  await CaptureStore.commitStage(first, "save");

  const second = await capture(profile, "r3", ["ana"], {
    expectedFollowers: 1, paginationCompleted: true, capturedAt: "2026-08-22T10:00:00Z",
  });
  assert.deepEqual(second.review.changes.lostFollowers, ["beto", "carla"]);
  await CaptureStore.commitStage(second, "save");
  assert.deepEqual(data[keys.history].followers, ["ana"]);
});

test("un posible cambio de nombre sin ID sigue en revisión sin crear altas ni bajas posteriores", async () => {
  const profile = "demo";
  const keys = Trust.storageKeys(profile);
  const data = installStorage({
    [keys.history]: {
      profile,
      followers: ["nombre_viejo"],
      following: ["nombre_viejo"],
      users: [{ key: "username:nombre_viejo", canonicalUsername: "nombre_viejo", currentUsername: "nombre_viejo", fullName: "Persona Única" }],
      updatedAt: "2026-08-20T10:00:00Z",
      runId: "r1",
    },
    ft_settings: { confirmRemovalsAfter: 1 },
  });
  const input = {
    profile,
    source: "instagram_export",
    followers: [{ username: "nombre_nuevo", fullName: "Persona Única" }],
    following: [{ username: "nombre_nuevo", fullName: "Persona Única" }],
    expectedFollowers: 1,
    expectedFollowing: 1,
    captureMetrics: { followers: { paginationCompleted: true }, following: { paginationCompleted: true } },
  };
  const first = await CaptureStore.stageCapture({ ...input, capturedAt: "2026-08-21T10:00:00Z", runId: "r2" });
  assert.deepEqual(first.snapshot.followers, ["nombre_viejo"]);
  assert.deepEqual(first.review.changes, { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] });
  assert.equal(first.review.renameCandidates[0].requiresReview, true);
  assert.deepEqual(first.review.renameCandidates[0].suppressedIn, ["followers", "following"]);
  await CaptureStore.commitStage(first, "save");

  const second = await CaptureStore.stageCapture({ ...input, capturedAt: "2026-08-22T10:00:00Z", runId: "r3" });
  assert.deepEqual(second.snapshot.followers, ["nombre_viejo"]);
  assert.deepEqual(second.review.changes, { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] });
  assert.deepEqual(second.review.renameCandidates[0].suppressedIn, ["followers", "following"]);
  await CaptureStore.commitStage(second, "save");
  assert.deepEqual(data[keys.history].followers, ["nombre_viejo"]);
});
