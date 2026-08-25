"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Guidance = require("./product-guidance.js");

test("guía a un usuario nuevo hacia la primera captura", () => {
  const model = Guidance.buildGuidance({ hasProfile: false, reportCount: 0 });
  assert.equal(model.primary.id, Guidance.ACTIONS.START_CAPTURE);
  assert.deepEqual(model.stage, { current: 0, total: 3, label: "Crear una línea base" });
});

test("prioriza revisar una captura pendiente sobre agregar más tareas", () => {
  const model = Guidance.buildGuidance({
    hasProfile: true,
    reportCount: 3,
    pendingCapture: true,
    backupDue: true,
    latestChangesCount: 8,
  });
  assert.equal(model.primary.id, Guidance.ACTIONS.REVIEW_PENDING);
  assert.ok(model.actions.some((item) => item.id === Guidance.ACTIONS.BACKUP));
});

test("explica ausencias ambiguas antes de declararlas unfollow", () => {
  const model = Guidance.buildGuidance({ hasProfile: true, reportCount: 2, pendingAbsenceCount: 3 });
  assert.equal(model.primary.id, Guidance.ACTIONS.CAPTURE_AGAIN);
  assert.match(model.primary.reason, /bloqueo|suspensión|username/i);
});

test("cuando todo está sano devuelve una tarea de comparación", () => {
  const model = Guidance.buildGuidance({ hasProfile: true, reportCount: 4 });
  assert.equal(model.primary.id, Guidance.ACTIONS.COMPARE);
  assert.equal(model.stage.current, 3);
});
