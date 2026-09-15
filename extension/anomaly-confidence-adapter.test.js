"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Trust = require("./anomaly-confidence-adapter.js");

function users(prefix, count) {
  return Array.from({ length: count }, (_value, index) => `${prefix}_${index}`);
}

test("separa magnitud de caída de la confianza de que la anomalía sea real", () => {
  const previousFollowers = users("persona", 100);
  const currentFollowers = previousFollowers.slice(0, 50);
  const review = Trust.buildCaptureReview({
    source: "ui",
    previousSnapshot: { followers: previousFollowers, following: ["ana"] },
    followers: currentFollowers,
    following: ["ana"],
    expectedFollowers: 50,
    expectedFollowing: 1,
    captureMetrics: {
      followers: { capturedCount: 50, expectedCount: 50, paginationCompleted: true, selectorConfidence: 0.6, selectorStrategy: "accessible-label/phase-dialog" },
      following: { capturedCount: 1, expectedCount: 1, paginationCompleted: true, selectorConfidence: 0.8, selectorStrategy: "exact-route/phase-dialog" },
    },
    completeness: {
      status: "complete",
      confidence: 1,
      phases: {
        followers: { status: "complete", confidence: 1, paginationCompleted: true },
        following: { status: "complete", confidence: 1, paginationCompleted: true },
      },
    },
  });

  const drop = review.anomalies.find((entry) => entry.kind === "relationship_drop" && entry.phase === "followers");
  const selector = review.anomalies.find((entry) => entry.kind === "selector_drift");
  assert.ok(drop);
  assert.equal(drop.confidence, 0.6);
  assert.equal(drop.evidence.dropRatio, 0.5);
  assert.ok(selector);
  assert.equal(review.selectorConfidence, 0.6);
  assert.equal(review.captureMetrics.followers.selectorConfidence, 0.6);
  assert.equal(review.captureMetrics.followers.selectorStrategy, "accessible-label/phase-dialog");
  assert.equal(review.status, "review");
  assert.ok(review.anomalyConfidence > 0);
});

test("una paginación explícitamente incompleta produce evidencia fuerte de captura parcial", () => {
  const review = Trust.buildCaptureReview({
    source: "api",
    previousSnapshot: { followers: ["ana", "beto"], following: [] },
    followers: ["ana"],
    following: [],
    expectedFollowers: 2,
    expectedFollowing: 0,
    captureMetrics: {
      followers: { capturedCount: 1, expectedCount: 2, paginationCompleted: false, terminationReason: "repeated_cursor" },
      following: { capturedCount: 0, expectedCount: 0, paginationCompleted: true, terminationReason: "end_of_pagination" },
    },
    completeness: {
      phases: {
        followers: { paginationCompleted: false },
        following: { paginationCompleted: true },
      },
    },
  });

  const incomplete = review.anomalies.find((entry) => entry.kind === "capture_incomplete" && entry.phase === "followers");
  assert.ok(incomplete);
  assert.equal(incomplete.confidence, 0.98);
  assert.equal(review.canConfirmRemovals, false);
});