(function (root, factory) {
  const trust = root && root.FollowTrackerTrust
    ? root.FollowTrackerTrust
    : (typeof module === "object" && module.exports ? require("./identity-registry-adapter.js") : null);
  const api = factory(trust);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerAnomalyConfidence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Trust) {
  "use strict";
  if (!Trust) throw new Error("Follow Tracker Anomaly Confidence Adapter no pudo cargar Trust.");

  const ANOMALY_SCHEMA_VERSION = 1;
  const baseBuildCaptureReview = Trust.buildCaptureReview.bind(Trust);
  const baseNormalizeCaptureMetrics = Trust.normalizeCaptureMetrics.bind(Trust);

  function clamp(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  function normalizeCaptureMetrics(value, fallback) {
    const input = value && typeof value === "object" ? value : {};
    const normalized = baseNormalizeCaptureMetrics(input, fallback);
    ["followers", "following"].forEach((phase) => {
      const source = input[phase] && typeof input[phase] === "object" ? input[phase] : {};
      const confidence = Number(source.selectorConfidence);
      if (Number.isFinite(confidence)) normalized[phase].selectorConfidence = clamp(confidence);
      if (source.selectorStrategy) normalized[phase].selectorStrategy = String(source.selectorStrategy);
    });
    return normalized;
  }

  function selectorConfidence(input) {
    const metrics = input && input.captureMetrics || {};
    const values = [metrics.followers, metrics.following]
      .map((bucket) => Number(bucket && bucket.selectorConfidence))
      .filter(Number.isFinite)
      .map(clamp);
    return values.length ? Math.min(...values) : 1;
  }

  function anomaly(kind, confidence, severity, evidence, phase) {
    return {
      kind,
      confidence: clamp(confidence),
      severity: clamp(severity),
      phase: phase || "capture",
      evidence: evidence && typeof evidence === "object" ? evidence : {},
    };
  }

  function buildAnomalies(input, review) {
    const value = input && typeof input === "object" ? input : {};
    const settings = Trust.normalizeSettings(value.settings);
    const completeness = review.completeness || { confidence: 0.25, status: "unknown", phases: {} };
    const anomalies = [];
    const phases = completeness.phases || {};

    ["followers", "following"].forEach((phase) => {
      const phaseReview = phases[phase] || {};
      const ratio = phase === "followers" ? review.followersCoverage : review.followingCoverage;
      if (["partial", "unknown"].includes(phaseReview.status)) {
        const explicitStop = phaseReview.paginationCompleted === false;
        anomalies.push(anomaly("capture_incomplete", explicitStop ? 0.98 : 1 - clamp(phaseReview.confidence),
          phaseReview.status === "partial" ? 0.8 : 0.55,
          { status: phaseReview.status, coverage: ratio, terminationReason: phaseReview.terminationReason || "" }, phase));
      }
      if (ratio != null && ratio < settings.minTrustedCoverage) {
        const gap = clamp((settings.minTrustedCoverage - ratio) / Math.max(0.01, settings.minTrustedCoverage));
        anomalies.push(anomaly("coverage_gap", 0.9 + gap * 0.1, Math.max(0.35, gap),
          { coverage: ratio, threshold: settings.minTrustedCoverage }, phase));
      }
    });

    const reliability = clamp(completeness.confidence) * selectorConfidence(value);
    [
      ["followers", review.followerDropRatio],
      ["following", review.followingDropRatio],
    ].forEach(([phase, ratio]) => {
      if (ratio > settings.maxTrustedDropRatio) {
        const magnitude = clamp((ratio - settings.maxTrustedDropRatio) / Math.max(0.01, 1 - settings.maxTrustedDropRatio));
        anomalies.push(anomaly("relationship_drop", reliability, Math.max(0.45, magnitude),
          { dropRatio: ratio, threshold: settings.maxTrustedDropRatio, captureReliability: reliability }, phase));
      }
    });

    const invalid = (review.captureMetrics && review.captureMetrics.followers && review.captureMetrics.followers.invalidRecords || 0)
      + (review.captureMetrics && review.captureMetrics.following && review.captureMetrics.following.invalidRecords || 0);
    if (invalid) anomalies.push(anomaly("invalid_records", 1, Math.min(1, 0.25 + invalid / 20), { count: invalid }));

    const selector = selectorConfidence(value);
    if (String(value.source || review.source) === "ui" && selector < 0.9) {
      anomalies.push(anomaly("selector_drift", 1 - selector, Math.max(0.3, 1 - selector), { selectorConfidence: selector }));
    }

    (review.renameCandidates || []).forEach((candidate) => {
      if (candidate && candidate.requiresReview) {
        anomalies.push(anomaly("username_rename_candidate", Number(candidate.confidence) || 0.5, 0.35,
          { from: candidate.from, to: candidate.to, reason: candidate.reason || "heuristic" }));
      }
    });

    return anomalies.sort((a, b) => (b.severity * b.confidence) - (a.severity * a.confidence));
  }

  function buildCaptureReview(input) {
    const review = baseBuildCaptureReview(input);
    const anomalies = buildAnomalies(input, review);
    const selector = selectorConfidence(input);
    const captureMetrics = normalizeCaptureMetrics(input && input.captureMetrics || review.captureMetrics, {
      collectedFollowers: review.collectedFollowers,
      collectedFollowing: review.collectedFollowing,
      expectedFollowers: review.expectedFollowers,
      expectedFollowing: review.expectedFollowing,
    });
    let score = Number(review.score) || 0;
    let status = review.status;
    const reasons = [...(review.reasons || [])];

    if (String(review.source) === "ui" && selector < 0.8) {
      score -= Math.round((0.8 - selector) * 30);
      if (status === "trusted") status = "review";
      reasons.push(`Los selectores visuales tienen confianza ${Math.round(selector * 100)}%; conviene revisar esta captura.`);
    }

    const anomalyConfidence = anomalies.length
      ? Math.max(...anomalies.map((entry) => clamp(entry.confidence * entry.severity)))
      : 0;
    return {
      ...review,
      schemaVersion: Math.max(Number(review.schemaVersion) || 0, 3),
      status,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons: [...new Set(reasons)],
      captureMetrics,
      anomalySchemaVersion: ANOMALY_SCHEMA_VERSION,
      anomalyConfidence,
      selectorConfidence: selector,
      anomalies,
    };
  }

  Object.assign(Trust, { ANOMALY_SCHEMA_VERSION, buildAnomalies, buildCaptureReview, normalizeCaptureMetrics, selectorConfidence });
  return Trust;
});