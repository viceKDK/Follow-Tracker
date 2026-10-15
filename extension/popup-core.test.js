"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Popup = require("./popup-core.js");

test("detecta solo rutas de perfiles de Instagram con HTTPS", () => {
  assert.equal(Popup.profileFromUrl("https://www.instagram.com/Ana.Demo/"), "ana.demo");
  assert.equal(Popup.profileFromUrl("https://instagram.com/carla/reels/"), "carla");
  for (const url of [
    "https://www.instagram.com/",
    "https://www.instagram.com/accounts/login/",
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/p/123/",
    "https://instagram.com.evil.example/ana/",
    "http://www.instagram.com/ana/",
    "https://www.instagram.com/usuario-con-guion/",
    "not-a-url",
  ]) assert.equal(Popup.profileFromUrl(url), "", url);
});

test("descubre perfiles con historial y ordena por fecha sin aceptar claves inválidas", () => {
  const profiles = Popup.savedProfiles({
    ft_history_ana: { profile: "ANA", updatedAt: "2026-10-02T10:00:00Z" },
    ft_history_beto: { profile: "beto", updatedAt: "2026-10-12T10:00:00Z" },
    ft_history_carla: { profile: "carla" },
    ft_history_bad: null,
    ft_history_fake: { profile: "invalid-name" },
    ft_pending_capture_tania: { profile: "tania" },
    unrelated: { profile: "random" },
  });
  assert.deepEqual(profiles, ["beto", "ana", "carla"]);
});

test("puede descubrir perfiles por claves sin cargar snapshots pesados", () => {
  const keys = ["ft_history_beto", "ft_history_ana", "ft_timeline_beto", "ft_history_invalid-name"];
  const metadata = {
    ft_profile_meta_beto: { lastCaptureAt: "2026-10-12T10:00:00Z" },
    ft_profile_meta_ana: { lastCaptureAt: "2026-10-10T10:00:00Z" },
  };
  assert.deepEqual(Popup.savedProfilesFromKeys(keys, metadata), ["beto", "ana"]);
  assert.deepEqual(Popup.savedProfilesFromKeys(keys), ["ana", "beto"]);
});

test("la guía nunca marca como finalizada una captura pendiente o dudosa", () => {
  assert.deepEqual(Popup.journey(0, false), { step: 0, label: "Creá tu primera captura" });
  assert.equal(Popup.journey(1, false).step, 1);
  assert.equal(Popup.journey(2, true, "trusted").step, 2);
  assert.equal(Popup.journey(3, false, "suspicious").step, 2);
  assert.equal(Popup.journey(2, false).step, 2);
  assert.equal(Popup.journey(2, false, "trusted").step, 3);
  assert.equal(Popup.journey(1, true).step, 1);
  assert.equal(Popup.journey(0, true).step, 0);
});
