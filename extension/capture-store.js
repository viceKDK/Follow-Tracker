(function (root, factory) {
  const core = root && root.FollowTrackerCore ? root.FollowTrackerCore : (typeof module === "object" && module.exports ? require("./core.js") : null);
  const trust = root && root.FollowTrackerTrust ? root.FollowTrackerTrust : (typeof module === "object" && module.exports ? require("./trust-domain-adapter.js") : null);
  const storage = root && root.FollowTrackerStorage ? root.FollowTrackerStorage : (typeof module === "object" && module.exports ? require("./platform-storage.js") : null);
  const api = factory(core, trust, storage);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerCaptureStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, Trust, Storage) {
  "use strict";
  if (!Core || !Trust || !Storage) throw new Error("Follow Tracker Capture Store no pudo cargar sus dependencias.");
  const storageGet = Storage.get;
  const storageSet = Storage.set;
  const storageRemove = Storage.remove;

  function makeStageId(profile, capturedAt) {
    const stamp = String(capturedAt || new Date().toISOString()).replace(/[^0-9]/g, "").slice(0, 17);
    return `pending-${Trust.safeProfile(profile)}-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function relevantIdentityRecords(registry, resolvedUsers) {
    const keys = new Set((resolvedUsers || []).map((user) => user.identityKey).filter(Boolean));
    return [...keys].map((key) => registry.records[key]).filter(Boolean).map((record) => ({ ...record }));
  }

  function rawMetrics(rows, normalized) {
    const input = Array.isArray(rows) ? rows : [];
    const valid = input.map((row) => Trust.normalizeUser(row)).filter(Boolean).length;
    return { inputRecords: input.length, validRecords: valid, invalidRecords: input.length - valid,
      missingUsernameRecords: input.length - valid, duplicateRecords: Math.max(0, valid - normalized.length), capturedCount: normalized.length };
  }

  function activeRenameCandidates(previousSnapshot, detectedValue, currentFollowerUsernames, currentFollowingUsernames) {
    const current = new Set([...(currentFollowerUsernames || []), ...(currentFollowingUsernames || [])]);
    const carried = previousSnapshot && previousSnapshot.captureMeta && Array.isArray(previousSnapshot.captureMeta.renameCandidates)
      ? previousSnapshot.captureMeta.renameCandidates
      : [];
    const candidates = [...(detectedValue || []), ...carried]
      .filter((candidate) => candidate && candidate.requiresReview === true)
      .filter((candidate) => current.has(Trust.normalizeUsername(candidate.to)) && !current.has(Trust.normalizeUsername(candidate.from)));
    const byPair = new Map();
    candidates.forEach((candidate) => {
      const from = Trust.normalizeUsername(candidate.from);
      const to = Trust.normalizeUsername(candidate.to);
      if (!from || !to || from === to) return;
      const key = `${from}->${to}`;
      const currentValue = byPair.get(key);
      if (!currentValue || Number(candidate.confidence) > Number(currentValue.confidence)) {
        byPair.set(key, { ...candidate, from, to, canonicalUsername: Trust.normalizeUsername(candidate.canonicalUsername || from) });
      }
    });
    return [...byPair.values()];
  }

  function reconcileRenameCandidates(previousSnapshot, followerUsernames, followingUsernames, candidatesValue) {
    const previousFollowers = new Set(previousSnapshot && previousSnapshot.followers || []);
    const previousFollowing = new Set(previousSnapshot && previousSnapshot.following || []);
    const followers = new Set(followerUsernames || []);
    const following = new Set(followingUsernames || []);
    const candidates = (candidatesValue || []).map((candidate) => ({ ...candidate, suppressedIn: [] }));
    candidates.forEach((candidate) => {
      if (candidate.requiresReview !== true || Number(candidate.confidence) < 0.5) return;
      if (previousFollowers.has(candidate.from) && followers.has(candidate.to) && !followers.has(candidate.from)) {
        followers.delete(candidate.to); followers.add(candidate.from); candidate.suppressedIn.push("followers");
      }
      if (previousFollowing.has(candidate.from) && following.has(candidate.to) && !following.has(candidate.from)) {
        following.delete(candidate.to); following.add(candidate.from); candidate.suppressedIn.push("following");
      }
    });
    return { followers: [...followers].sort(), following: [...following].sort(), candidates };
  }

  function normalizeCaptureInput(input) {
    const value = input && typeof input === "object" ? input : {};
    const profile = Trust.safeProfile(value.profile);
    const capturedAt = String(value.capturedAt || new Date().toISOString());
    const runId = String(value.runId || Core.makeRunId(new Date(capturedAt)));
    const source = String(value.source || "unknown");
    const followers = Trust.uniqueUsers(value.followers || [], source);
    const following = Trust.uniqueUsers(value.following || [], source);
    const suppliedMetrics = value.captureMetrics || value.metrics || {};
    const captureMetrics = Trust.normalizeCaptureMetrics({
      followers: { ...rawMetrics(value.followers, followers), ...(suppliedMetrics.followers || {}) },
      following: { ...rawMetrics(value.following, following), ...(suppliedMetrics.following || {}) },
    }, { collectedFollowers: followers.length, collectedFollowing: following.length,
      expectedFollowers: value.expectedFollowers, expectedFollowing: value.expectedFollowing });
    return { ...value, profile, capturedAt, runId, source, followers, following, captureMetrics,
      completeness: value.completeness && typeof value.completeness === "object" ? { ...value.completeness } : null,
      warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [] };
  }

  function confirmedChanges(previousSnapshot, absence) {
    const followerChanges = Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], absence.followers);
    const followingChanges = Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], absence.following);
    return { newFollowers: followerChanges.added, lostFollowers: followerChanges.removed,
      newFollowing: followingChanges.added, lostFollowing: followingChanges.removed };
  }

  async function stageCapture(input) {
    const value = normalizeCaptureInput(input);
    const keys = Trust.storageKeys(value.profile);
    const stored = await storageGet([keys.history, keys.identities, keys.absences, keys.captureMeta, "ft_settings"]);
    const settings = Trust.normalizeSettings({ ...(stored.ft_settings || {}), ...(value.settings || {}) });
    const previousSnapshot = stored[keys.history] || null;
    const canonical = Trust.canonicalizeRelationshipLists(stored[keys.identities], value.followers, value.following, {
      profile: value.profile, source: value.source, observedAt: value.capturedAt,
    });
    const resolvedUsers = [...canonical.followers, ...canonical.following];
    const currentIdentityRecords = relevantIdentityRecords(canonical.registry, resolvedUsers);
    const detectedRenameCandidates = Trust.detectRenameCandidates(previousSnapshot && previousSnapshot.users || [], currentIdentityRecords);
    const renameCandidates = activeRenameCandidates(previousSnapshot, detectedRenameCandidates,
      canonical.followerUsernames, canonical.followingUsernames);
    const reconciled = reconcileRenameCandidates(previousSnapshot, canonical.followerUsernames, canonical.followingUsernames, renameCandidates);
    const previousCandidateRecords = (previousSnapshot && previousSnapshot.users || []).filter((record) =>
      reconciled.candidates.some((candidate) => candidate.suppressedIn.length &&
        [record.currentUsername, record.canonicalUsername, record.username].map(Trust.normalizeUsername).includes(candidate.from))
    );
    const identityRecords = [...new Map([...currentIdentityRecords, ...previousCandidateRecords].map((record) =>
      [record.key || record.identityKey || `username:${Trust.normalizeUsername(record.currentUsername || record.username || record.canonicalUsername)}`, { ...record }]
    )).values()];
    const assessment = Trust.assessCaptureCompleteness({
      previousSnapshot,
      followers: reconciled.followers,
      following: reconciled.following,
      expectedFollowers: value.expectedFollowers,
      expectedFollowing: value.expectedFollowing,
      source: value.source,
      warnings: value.warnings,
      captureMetrics: value.captureMetrics,
      completeness: value.completeness,
      settings,
    });
    const absence = Trust.applyAbsencePolicy(previousSnapshot, reconciled.followers, reconciled.following,
      stored[keys.absences], { profile: value.profile, capturedAt: value.capturedAt,
        confirmRemovalsAfter: settings.confirmRemovalsAfter, canConfirmRemovals: assessment.canConfirmRemovals });
    const review = Trust.buildCaptureReview({
      previousSnapshot,
      followers: reconciled.followers,
      following: reconciled.following,
      expectedFollowers: value.expectedFollowers,
      expectedFollowing: value.expectedFollowing,
      source: value.source,
      profileId: value.profileId,
      capturedAt: value.capturedAt,
      durationMs: value.durationMs,
      retries: value.retries,
      warnings: value.warnings,
      renames: canonical.renames,
      renameCandidates: reconciled.candidates,
      pendingAbsences: absence.pending,
      deferredAbsences: absence.deferred,
      confirmedAbsences: absence.confirmed,
      captureMetrics: value.captureMetrics,
      completeness: value.completeness,
      assessment,
      settings,
    });
    review.changes = confirmedChanges(previousSnapshot, absence);
    review.observedChanges = {
      newFollowers: Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], reconciled.followers).added,
      missingFollowers: Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], reconciled.followers).removed,
      newFollowing: Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], reconciled.following).added,
      missingFollowing: Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], reconciled.following).removed,
    };
    review.rawObservedChanges = {
      newFollowers: Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], canonical.followerUsernames).added,
      missingFollowers: Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], canonical.followerUsernames).removed,
      newFollowing: Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], canonical.followingUsernames).added,
      missingFollowing: Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], canonical.followingUsernames).removed,
    };
    const stage = {
      schemaVersion: 2,
      id: makeStageId(value.profile, value.capturedAt),
      profile: value.profile,
      profileId: String(value.profileId || ""),
      source: value.source,
      createdAt: new Date().toISOString(),
      capturedAt: value.capturedAt,
      runId: value.runId,
      expectedFollowers: review.expectedFollowers,
      expectedFollowing: review.expectedFollowing,
      collectedFollowers: canonical.followerUsernames.length,
      collectedFollowing: canonical.followingUsernames.length,
      completeness: assessment,
      captureMetrics: assessment.metrics,
      importSummary: value.importSummary || null,
      review,
      settings,
      snapshot: {
        schemaVersion: 3,
        storageSchemaVersion: 2,
        profile: value.profile,
        profileId: String(value.profileId || ""),
        followers: absence.followers,
        following: absence.following,
        users: identityRecords,
        updatedAt: value.capturedAt,
        runId: value.runId,
        reportId: value.runId,
        captureMeta: review,
      },
      identityRegistry: canonical.registry,
      absenceState: absence.state,
      raw: { followers: value.followers, following: value.following },
    };
    await storageSet({ [keys.pending]: stage });
    return stage;
  }

  function captureMetaMap(value) {
    const input = value && typeof value === "object" ? value : {};
    return { schemaVersion: 2, storageSchemaVersion: 2, profile: Trust.safeProfile(input.profile),
      reports: input.reports && typeof input.reports === "object" ? { ...input.reports } : {},
      updatedAt: String(input.updatedAt || new Date(0).toISOString()) };
  }

  async function commitStage(stageValue, decision) {
    const stage = stageValue && typeof stageValue === "object" ? stageValue : null;
    if (!stage || !stage.profile || !stage.snapshot) throw new Error("La captura pendiente no es válida.");
    const normalizedDecision = String(decision || "save");
    if (stage.review && stage.review.status === "rejected" && normalizedDecision !== "save_suspicious") {
      throw new Error("La captura fue rechazada por calidad. Usá guardar como sospechosa o descartala.");
    }
    const keys = Trust.storageKeys(stage.profile);
    const stored = await storageGet([keys.captureMeta, keys.profileMeta]);
    const metadata = captureMetaMap({ ...(stored[keys.captureMeta] || {}), profile: stage.profile });
    const captureMeta = Trust.captureMetaForCommit(stage.review, normalizedDecision);
    metadata.reports[stage.runId] = { ...captureMeta, label: String(captureMeta.label || ""), note: String(captureMeta.note || "") };
    metadata.updatedAt = new Date().toISOString();
    const snapshot = { ...stage.snapshot, storageSchemaVersion: 2, captureMeta,
      updatedAt: stage.capturedAt, runId: stage.runId, reportId: stage.runId };
    const profileMeta = { schemaVersion: 2, storageSchemaVersion: 2, profile: stage.profile,
      label: String(stored[keys.profileMeta] && stored[keys.profileMeta].label || ""),
      archived: stored[keys.profileMeta] && stored[keys.profileMeta].archived === true,
      profileId: String(stage.profileId || stored[keys.profileMeta] && stored[keys.profileMeta].profileId || ""),
      lastCaptureSource: stage.source, lastCaptureAt: stage.capturedAt, updatedAt: new Date().toISOString() };
    await storageSet({ [keys.history]: snapshot, [keys.captureMeta]: metadata, [keys.identities]: stage.identityRegistry,
      [keys.absences]: stage.absenceState, [keys.profileMeta]: profileMeta });
    await storageRemove(keys.pending);
    return { snapshot, captureMeta, metadata, profileMeta };
  }

  async function discardStage(stageOrProfile) {
    const profile = typeof stageOrProfile === "string" ? stageOrProfile : stageOrProfile && stageOrProfile.profile;
    if (profile) await storageRemove(Trust.storageKeys(profile).pending);
  }

  async function loadPending(profile) {
    const key = Trust.storageKeys(profile).pending;
    const result = await storageGet([key]);
    return result[key] || null;
  }

  async function importOfficialExport(profile, parts, options) {
    const merged = Trust.mergeInstagramExportParts(Array.isArray(parts) ? parts : []);
    if (!merged.hasFollowers || !merged.hasFollowing) throw new Error("Seleccioná al menos un archivo de seguidores y uno de seguidos.");
    const settings = options && typeof options === "object" ? options : {};
    const phaseCompleteness = merged.completeness && merged.completeness.phases || {};
    return stageCapture({
      profile,
      source: "instagram_export",
      followers: merged.followers,
      following: merged.following,
      expectedFollowers: phaseCompleteness.followers && phaseCompleteness.followers.expectedCount,
      expectedFollowing: phaseCompleteness.following && phaseCompleteness.following.expectedCount,
      captureMetrics: merged.metrics,
      completeness: merged.completeness,
      importSummary: { schemaVersion: merged.schemaVersion, formats: merged.formats, parts: merged.parts.map((part) => ({
        name: part.name, phase: part.phase, format: part.format, metrics: part.metrics, completeness: part.completeness,
      })) },
      warnings: merged.warnings,
      capturedAt: settings.capturedAt || new Date().toISOString(),
      runId: settings.runId || Core.makeRunId(),
      settings: settings.settings,
    });
  }

  return { activeRenameCandidates, captureMetaMap, commitStage, confirmedChanges, discardStage, importOfficialExport, loadPending,
    normalizeCaptureInput, reconcileRenameCandidates, stageCapture, storageGet, storageRemove, storageSet };
});
