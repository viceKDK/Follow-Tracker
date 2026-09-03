(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain
    ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-relations.js") : null);
  const trust = root && root.FollowTrackerTrust
    ? root.FollowTrackerTrust
    : (typeof module === "object" && module.exports ? require("./trust-core.js") : null);
  const api = factory(domain, trust);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerTrustDomainAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain, Trust) {
  "use strict";

  if (!Domain || !Trust) throw new Error("Follow Tracker Trust Domain Adapter no pudo cargar sus dependencias.");

  const delegated = {
    compareStrings(previousValues, currentValues) {
      const diff = Domain.diffLists(previousValues, currentValues);
      return { added: diff.added, removed: diff.removed };
    },
    mergeInstagramExportParts: Domain.mergeInstagramExportParts,
    normalizeInstagramId: Domain.normalizeInstagramId,
    normalizeUser: Domain.normalizeUser,
    normalizeUsername: Domain.normalizeUsername,
    parseInstagramExportPart: Domain.parseInstagramExportPart,
    safeProfile: Domain.safeProfile,
    uniqueUsers: Domain.uniqueUsers,
    userIdentityKey: Domain.userIdentityKey,
  };

  Object.assign(Trust, delegated);

  const INTEGRITY_SCHEMA_VERSION = 2;
  const DEFAULT_SETTINGS = Object.freeze({
    ...(Trust.DEFAULT_SETTINGS || {}),
    minTrustedCoverage: 0.95,
    minHardCoverage: 0.8,
    minRemovalConfidence: 0.95,
    maxTrustedDropRatio: 0.15,
    confirmRemovalsAfter: 2,
    autoAcceptTrusted: false,
    backupReminderDays: 30,
    backupReminderReports: 5,
  });

  function optionalNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function iso(value, fallback) {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toISOString()
      : String(fallback || new Date().toISOString());
  }

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      ...DEFAULT_SETTINGS,
      ...input,
      minTrustedCoverage: Math.min(1, Math.max(0.5, Number(input.minTrustedCoverage) || DEFAULT_SETTINGS.minTrustedCoverage)),
      minHardCoverage: Math.min(1, Math.max(0.1, Number(input.minHardCoverage) || DEFAULT_SETTINGS.minHardCoverage)),
      minRemovalConfidence: Math.min(1, Math.max(0.5, Number(input.minRemovalConfidence) || DEFAULT_SETTINGS.minRemovalConfidence)),
      maxTrustedDropRatio: Math.min(1, Math.max(0.01, Number(input.maxTrustedDropRatio) || DEFAULT_SETTINGS.maxTrustedDropRatio)),
      confirmRemovalsAfter: Math.min(5, Math.max(1, Number(input.confirmRemovalsAfter) || DEFAULT_SETTINGS.confirmRemovalsAfter)),
      autoAcceptTrusted: input.autoAcceptTrusted === true,
      backupReminderDays: Math.max(1, Number(input.backupReminderDays) || DEFAULT_SETTINGS.backupReminderDays),
      backupReminderReports: Math.max(1, Number(input.backupReminderReports) || DEFAULT_SETTINGS.backupReminderReports),
    };
  }

  function metricBucket(value, captured, expected) {
    const input = value && typeof value === "object" ? value : {};
    const capturedCount = Math.max(0, Number(input.capturedCount) || Number(captured) || 0);
    return {
      inputRecords: Math.max(0, Number(input.inputRecords) || Number(input.rawCount) || capturedCount),
      validRecords: Math.max(0, Number(input.validRecords) || capturedCount),
      invalidRecords: Math.max(0, Number(input.invalidRecords) || 0),
      duplicateRecords: Math.max(0, Number(input.duplicateRecords) || 0),
      missingUsernameRecords: Math.max(0, Number(input.missingUsernameRecords) || 0),
      expectedCount: optionalNumber(input.expectedCount) != null ? optionalNumber(input.expectedCount) : optionalNumber(expected),
      capturedCount,
      pages: Math.max(0, Number(input.pages) || 0),
      paginationCompleted: typeof input.paginationCompleted === "boolean" ? input.paginationCompleted : null,
      terminationReason: String(input.terminationReason || ""),
    };
  }

  function normalizeCaptureMetrics(value, fallback) {
    const input = value && typeof value === "object" ? value : {};
    const defaults = fallback && typeof fallback === "object" ? fallback : {};
    return {
      schemaVersion: INTEGRITY_SCHEMA_VERSION,
      followers: metricBucket(input.followers, defaults.collectedFollowers, defaults.expectedFollowers),
      following: metricBucket(input.following, defaults.collectedFollowing, defaults.expectedFollowing),
    };
  }

  function phaseAssessment(bucket, explicit, settings) {
    const imported = explicit && typeof explicit === "object" ? explicit : {};
    const ratio = Trust.coverage(bucket.capturedCount, bucket.expectedCount);
    let status = ["complete", "probably_complete", "partial", "unknown"].includes(imported.status)
      ? imported.status
      : "";
    let confidence = optionalNumber(imported.confidence);

    if (bucket.paginationCompleted === false) status = "partial";
    if (!status) {
      if (bucket.paginationCompleted === true) {
        status = ratio == null || ratio >= settings.minTrustedCoverage ? "complete" : "partial";
      } else if (ratio != null) {
        status = ratio >= settings.minTrustedCoverage ? "probably_complete" : "partial";
      } else {
        status = "unknown";
      }
    }

    if (confidence == null) {
      if (status === "complete") confidence = ratio == null ? 0.98 : Math.min(1, ratio);
      else if (status === "probably_complete") confidence = ratio == null ? 0.95 : Math.min(0.99, ratio);
      else if (status === "partial") confidence = ratio == null ? 0.35 : Math.min(0.79, ratio);
      else confidence = 0.25;
    }
    confidence = Math.min(1, Math.max(0, confidence));
    return {
      status,
      confidence,
      expectedCount: bucket.expectedCount,
      capturedCount: bucket.capturedCount,
      coverage: ratio,
      paginationCompleted: bucket.paginationCompleted,
      terminationReason: bucket.terminationReason,
      canConfirmRemovals: ["complete", "probably_complete"].includes(status)
        && confidence >= settings.minRemovalConfidence,
    };
  }

  function assessCaptureCompleteness(input) {
    const value = input && typeof input === "object" ? input : {};
    const settings = normalizeSettings(value.settings);
    const followers = Array.isArray(value.followers) ? value.followers.length : 0;
    const following = Array.isArray(value.following) ? value.following.length : 0;
    const metrics = normalizeCaptureMetrics(value.captureMetrics, {
      collectedFollowers: followers,
      collectedFollowing: following,
      expectedFollowers: value.expectedFollowers,
      expectedFollowing: value.expectedFollowing,
    });
    const explicit = value.completeness && typeof value.completeness === "object" ? value.completeness : {};
    const explicitPhases = explicit.phases && typeof explicit.phases === "object" ? explicit.phases : {};
    const followerAssessment = phaseAssessment(metrics.followers, explicitPhases.followers || explicit.followers, settings);
    const followingAssessment = phaseAssessment(metrics.following, explicitPhases.following || explicit.following, settings);
    const phases = { followers: followerAssessment, following: followingAssessment };
    let status = ["complete", "probably_complete", "partial", "unknown"].includes(explicit.status)
      ? explicit.status
      : "";
    if (!status) {
      const statuses = Object.values(phases).map((phase) => phase.status);
      if (statuses.includes("partial")) status = "partial";
      else if (statuses.includes("unknown")) status = "unknown";
      else if (statuses.every((phase) => phase === "complete")) status = "complete";
      else status = "probably_complete";
    }
    const explicitConfidence = optionalNumber(explicit.confidence);
    const confidence = Math.min(1, Math.max(0, explicitConfidence == null
      ? Math.min(followerAssessment.confidence, followingAssessment.confidence)
      : explicitConfidence));
    const canConfirmRemovals = !["partial", "unknown"].includes(status)
      && confidence >= settings.minRemovalConfidence
      && followerAssessment.canConfirmRemovals
      && followingAssessment.canConfirmRemovals;
    return {
      schemaVersion: INTEGRITY_SCHEMA_VERSION,
      status,
      confidence,
      canConfirmRemovals,
      phases,
      metrics,
    };
  }

  function applyAbsenceBucket(previousValues, currentValues, bucket, capturedAt, confirmAfter, canProgress) {
    const previous = [...new Set((previousValues || []).map(Trust.normalizeUsername).filter(Boolean))];
    const current = new Set((currentValues || []).map(Trust.normalizeUsername).filter(Boolean));
    const nextBucket = { ...(bucket || {}) };
    const pending = [];
    const confirmed = [];
    const deferred = [];

    [...current].forEach((username) => { delete nextBucket[username]; });
    previous.forEach((username) => {
      if (current.has(username)) return;
      const prior = nextBucket[username] || { count: 0, firstMissingAt: capturedAt, lastMissingAt: capturedAt };
      if (!canProgress) {
        current.add(username);
        if (prior.count > 0) nextBucket[username] = prior;
        deferred.push({ username, count: prior.count, confirmAfter, reason: "capture_incomplete" });
        return;
      }
      const entry = {
        count: prior.count + 1,
        firstMissingAt: prior.firstMissingAt || capturedAt,
        lastMissingAt: capturedAt,
      };
      if (entry.count < confirmAfter) {
        current.add(username);
        nextBucket[username] = entry;
        pending.push({ username, count: entry.count, confirmAfter });
      } else {
        delete nextBucket[username];
        confirmed.push({ username, count: entry.count });
      }
    });
    return { values: [...current].sort(), bucket: nextBucket, pending, confirmed, deferred };
  }

  function applyAbsencePolicy(previousSnapshot, followerUsernames, followingUsernames, absenceValue, options) {
    const settings = normalizeSettings(options);
    const capturedAt = iso(settings.capturedAt);
    const state = Trust.normalizeAbsenceState(absenceValue, settings.profile || previousSnapshot && previousSnapshot.profile);
    const canProgress = settings.canConfirmRemovals !== false;
    const followers = applyAbsenceBucket(previousSnapshot && previousSnapshot.followers, followerUsernames,
      state.followers, capturedAt, settings.confirmRemovalsAfter, canProgress);
    const following = applyAbsenceBucket(previousSnapshot && previousSnapshot.following, followingUsernames,
      state.following, capturedAt, settings.confirmRemovalsAfter, canProgress);
    return {
      followers: followers.values,
      following: following.values,
      state: { ...state, schemaVersion: INTEGRITY_SCHEMA_VERSION, followers: followers.bucket,
        following: following.bucket, updatedAt: capturedAt },
      pending: { followers: followers.pending, following: following.pending },
      confirmed: { followers: followers.confirmed, following: following.confirmed },
      deferred: { followers: followers.deferred, following: following.deferred },
    };
  }

  function comparableIdentityUser(value) {
    if (!value || typeof value !== "object") return null;
    const username = Trust.normalizeUsername(value.currentUsername || value.username || value.canonicalUsername);
    if (!username) return null;
    return {
      username,
      canonicalUsername: Trust.normalizeUsername(value.canonicalUsername || username),
      instagramUserId: Trust.normalizeInstagramId(value),
      fullName: String(value.fullName || value.full_name || "").trim().toLowerCase().replace(/\s+/g, " "),
    };
  }

  function detectRenameCandidates(previousRows, currentRows) {
    const previous = (previousRows || []).map(comparableIdentityUser).filter(Boolean);
    const current = (currentRows || []).map(comparableIdentityUser).filter(Boolean);
    const currentNames = new Set(current.map((user) => user.username));
    const previousNames = new Set(previous.map((user) => user.username));
    const missing = previous.filter((user) => !currentNames.has(user.username));
    const added = current.filter((user) => !previousNames.has(user.username));
    const groupByName = (rows) => rows.reduce((map, user) => {
      if (!user.fullName || user.fullName.length < 3) return map;
      const values = map.get(user.fullName) || [];
      values.push(user);
      map.set(user.fullName, values);
      return map;
    }, new Map());
    const beforeByName = groupByName(missing);
    const afterByName = groupByName(added);
    const candidates = [];
    beforeByName.forEach((beforeValues, name) => {
      const afterValues = afterByName.get(name) || [];
      if (beforeValues.length !== 1 || afterValues.length !== 1) return;
      const before = beforeValues[0];
      const after = afterValues[0];
      if (before.instagramUserId && after.instagramUserId && before.instagramUserId !== after.instagramUserId) return;
      candidates.push({
        from: before.username,
        to: after.username,
        canonicalUsername: before.canonicalUsername,
        confidence: 0.55,
        reason: "unique_full_name",
        requiresReview: true,
      });
    });
    return candidates.sort((a, b) => a.from.localeCompare(b.from));
  }

  function buildCaptureReview(input) {
    const value = input && typeof input === "object" ? input : {};
    const settings = normalizeSettings(value.settings);
    const previous = value.previousSnapshot && typeof value.previousSnapshot === "object" ? value.previousSnapshot : null;
    const followers = [...new Set((value.followers || []).map(Trust.normalizeUsername).filter(Boolean))].sort();
    const following = [...new Set((value.following || []).map(Trust.normalizeUsername).filter(Boolean))].sort();
    const assessment = value.assessment || assessCaptureCompleteness({ ...value, followers, following, settings });
    const expectedFollowers = assessment.metrics.followers.expectedCount;
    const expectedFollowing = assessment.metrics.following.expectedCount;
    const followersCoverage = Trust.coverage(followers.length, expectedFollowers);
    const followingCoverage = Trust.coverage(following.length, expectedFollowing);
    const followerChanges = Trust.compareStrings(previous && previous.followers, followers);
    const followingChanges = Trust.compareStrings(previous && previous.following, following);
    const previousFollowers = previous && Array.isArray(previous.followers) ? previous.followers.length : 0;
    const previousFollowing = previous && Array.isArray(previous.following) ? previous.following.length : 0;
    const followerDropRatio = previousFollowers ? Math.max(0, previousFollowers - followers.length) / previousFollowers : 0;
    const followingDropRatio = previousFollowing ? Math.max(0, previousFollowing - following.length) / previousFollowing : 0;
    const warnings = [...new Set((value.warnings || []).map(String).filter(Boolean))];
    const reasons = [];
    let score = Math.round(assessment.confidence * 100);
    let status = ["complete", "probably_complete"].includes(assessment.status) ? "trusted" : "review";
    const hardCoverageFailure = [followersCoverage, followingCoverage]
      .some((ratio) => ratio != null && ratio < settings.minHardCoverage);
    const unexpectedEmpty = (expectedFollowers > 0 && followers.length === 0)
      || (expectedFollowing > 0 && following.length === 0);
    const suspiciousDrop = followerDropRatio > settings.maxTrustedDropRatio
      || followingDropRatio > settings.maxTrustedDropRatio;

    if (unexpectedEmpty || hardCoverageFailure) {
      status = "rejected";
      reasons.push("Instagram entregó una captura demasiado incompleta para usarla como reporte.");
      score -= 30;
    } else if (assessment.status === "partial") {
      status = "review";
      reasons.push("La captura es parcial y no puede confirmar bajas.");
      score -= 20;
    } else if (assessment.status === "unknown") {
      status = "review";
      reasons.push("No hay evidencia suficiente para saber si la captura terminó completa.");
      score -= 15;
    }
    if (suspiciousDrop) {
      if (status !== "rejected") status = "review";
      reasons.push("La caída respecto al reporte anterior es inusualmente grande.");
      score -= 20;
    }
    if (warnings.length) {
      if (status === "trusted") status = "review";
      reasons.push("La captura terminó con advertencias del recolector.");
      score -= Math.min(16, warnings.length * 4);
    }

    const pendingAbsences = value.pendingAbsences || { followers: [], following: [] };
    const deferredAbsences = value.deferredAbsences || { followers: [], following: [] };
    const pendingCount = (pendingAbsences.followers || []).length + (pendingAbsences.following || []).length;
    const deferredCount = (deferredAbsences.followers || []).length + (deferredAbsences.following || []).length;
    if (pendingCount) {
      reasons.push(`${pendingCount} baja(s) quedaron pendientes de otra captura completa.`);
      score -= Math.min(10, pendingCount);
      if (status === "trusted") status = "review";
    }
    if (deferredCount) {
      reasons.push(`${deferredCount} ausencia(s) no avanzaron porque la captura es incompleta.`);
      if (status === "trusted") status = "review";
    }

    const duplicateCount = assessment.metrics.followers.duplicateRecords + assessment.metrics.following.duplicateRecords;
    const invalidCount = assessment.metrics.followers.invalidRecords + assessment.metrics.following.invalidRecords;
    if (duplicateCount) reasons.push(`${duplicateCount} registro(s) duplicado(s) fueron normalizados.`);
    if (invalidCount) {
      reasons.push(`${invalidCount} registro(s) inválido(s) fueron descartados.`);
      score -= Math.min(10, invalidCount);
      if (status === "trusted") status = "review";
    }

    const renames = Array.isArray(value.renames) ? value.renames : [];
    const renameCandidates = Array.isArray(value.renameCandidates) ? value.renameCandidates : [];
    const suppressedRenameCount = renameCandidates
      .filter((candidate) => Array.isArray(candidate.suppressedIn) && candidate.suppressedIn.length).length;
    if (renames.length) reasons.push(`${renames.length} cambio(s) de username fueron resueltos por identificador estable, sin inventar altas ni bajas.`);
    if (suppressedRenameCount) {
      reasons.push(`${suppressedRenameCount} posible(s) cambio(s) de username quedaron para revisión y fueron excluidos de altas y bajas.`);
      if (status === "trusted") status = "review";
    }

    return {
      schemaVersion: INTEGRITY_SCHEMA_VERSION,
      status,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons,
      source: String(value.source || "unknown"),
      profileId: Trust.normalizeInstagramId(value.profileId),
      expectedFollowers,
      collectedFollowers: followers.length,
      followersCoverage,
      expectedFollowing,
      collectedFollowing: following.length,
      followingCoverage,
      previousFollowers,
      previousFollowing,
      followerDropRatio,
      followingDropRatio,
      completeness: assessment,
      canConfirmRemovals: assessment.canConfirmRemovals,
      captureMetrics: assessment.metrics,
      changes: {
        newFollowers: followerChanges.added,
        lostFollowers: followerChanges.removed,
        newFollowing: followingChanges.added,
        lostFollowing: followingChanges.removed,
      },
      pendingAbsences,
      deferredAbsences,
      confirmedAbsences: value.confirmedAbsences || { followers: [], following: [] },
      renames,
      renameCandidates,
      durationMs: Math.max(0, Number(value.durationMs) || 0),
      retries: Math.max(0, Number(value.retries) || 0),
      warnings,
      capturedAt: iso(value.capturedAt),
      acceptedAt: null,
      reviewDecision: null,
    };
  }

  Object.assign(Trust, {
    DEFAULT_SETTINGS,
    INTEGRITY_SCHEMA_VERSION,
    applyAbsencePolicy,
    assessCaptureCompleteness,
    buildCaptureReview,
    detectRenameCandidates,
    normalizeCaptureMetrics,
    normalizeSettings,
  });

  return Trust;
});
