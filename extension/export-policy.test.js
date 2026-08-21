"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Policy = require("./export-policy.js");

test("bloquea solamente el reporte Excel heredado", () => {
  assert.equal(Policy.shouldSuppressDownload("perfil_seguimiento_run-1.xls"), true);
  assert.equal(Policy.shouldSuppressDownload("perfil.xlsx"), true);
});

test("mantiene las descargas CSV automaticas de cada captura", () => {
  assert.equal(Policy.shouldSuppressDownload("perfil_followers_run-1_123.csv"), false);
  assert.equal(Policy.shouldSuppressDownload("perfil_following_run-1_124.csv"), false);
});

test("permite backups y exportaciones solicitadas desde el dashboard", () => {
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_perfil.json"), false);
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_actividad_perfil.csv"), false);
  assert.equal(Policy.shouldSuppressDownload("follow-tracker_relaciones_perfil.csv"), false);
});
