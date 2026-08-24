"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Policy = require("./export-policy.js");

test("bloquea reportes Excel heredados", () => {
  assert.equal(Policy.shouldSuppressDownload("perfil_seguimiento_run-1.xls"), true);
  assert.equal(Policy.shouldSuppressDownload("perfil.xlsx"), true);
});

test("bloquea CSV automaticos de cada captura", () => {
  assert.equal(Policy.shouldSuppressDownload("ig_auto_perfil_followers_run-1_123.csv"), true);
  assert.equal(Policy.shouldSuppressDownload("ig_auto_perfil_following_run-1_124.csv"), true);
  assert.equal(Policy.isAutomaticCaptureExport("ig_auto_perfil_followers_run-1_123.csv"), true);
});

test("permite backups y exportaciones solicitadas desde el dashboard", () => {
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_perfil.json"), false);
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_actividad_perfil.csv"), false);
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_relaciones_perfil.csv"), false);
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_lista_perfil_r1_a_r2.csv"), false);
});

test("no bloquea archivos sin nombre o CSV ajenos", () => {
  assert.equal(Policy.shouldSuppressDownload(""), false);
  assert.equal(Policy.shouldSuppressDownload("mis-datos.csv"), false);
});
