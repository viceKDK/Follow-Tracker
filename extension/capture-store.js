(function (root, factory) {
  const core = root && root.FollowTrackerCore
    ? root.FollowTrackerCore
    : (typeof module === "object" && module.exports ? require("./core.js") : null);
  const trust = root && root.FollowTrackerTrust
    ? root.FollowTrackerTrust
    : (typeof module === "object" && module.exports ? require("./trust-core.js") : null);
  const api = factory(core, trust);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerCaptureStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core, Trust) {
  "use strict";

  if (!Core || !Trust) throw new Error("Follow Tracker Capture Store no pudo cargar sus dependencias.");

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(items || {});
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(Array.isArray(keys) ? keys : [keys], () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function makeStageId(profile, capturedAt) {
    const stamp = String(capturedAt || new Date().toISOString()).replace(/[^0-9]/g, "").slice(0, 17);
    const random = Math.random().toString(36).slice(2, 8);
    return `pending-${Trust.safeProfile(profile)}-${stamp}-${random}`;
  }

  function relevantIdentityRecords(registry, resolvedUsers) {
    const keys = new Set((resolvedUsers || []).map((user) => user.identityKey).filter(Boolean));
    return [...keys]
      .map((key) => registry.records[key])
      .filter(Boolean)
      .map((record) => ({ ...record }));
  }

  function normalizeCaptureInput(input) {
    const value = input && typeof input === "object" ? input : {};
    const profile = Trust.safeProfile(value.profile);
    const capturedAt = String(value.capturedAt || new Date().toISOString());
    const runId = String(value.runId || Core.makeRunId(new Date(capturedAt)));
    return {
      ...value,
      profile,
      capturedAt,
      runId,
      source: String(value.source || "unknown"),
      followers: Trust.uniqueUsers(value.followers || [], value.source),
      following: Trust.uniqueUsers(value.following || [], value.source),
      warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    };
  }

  function confirmedChanges(previousSnapshot, absence) {
    const previousFollowers = previousSnapshot && Array.isArray(previousSnapshot.followers)
      ? previousSnapshot.followers
      : [];
    const previousFollowing = previousSnapshot && Array.isArray(previousSnapshot.following)
      ? previousSnapshot.following
      : [];
    const followerChanges = Core.compareSnapshots(previousFollowers, absence.followers);
    const followingChanges = Core.compareSnapshots(previousFollowing, absence.following);
    return {
      newFollowers: followerChanges.added,
      lostFollowers: followerChanges.removed,
      newFollowing: followingChanges.added,
      lostFollowing: followingChanges.removed,
    };
  }

  async function stageCapture(input) {
    const value = normalizeCaptureInput(input);
    const keys = Trust.storageKeys(value.profile);
    const stored = await storageGet([
      keys.history,
      keys.identities,
      keys.absences,
      keys.captureMeta,
      "ft_settings",
    ]);
    const settings = Trust.normalizeSettings({
      ...(stored.ft_settings || {}),
      ...(value.settings || {}),
    });
    const previousSnapshot = stored[keys.history] || null;
    const canonical = Trust.canonicalizeRelationshipLists(
      stored[keys.identities],
      value.followers,
      value.following,
      {
        profile: value.profile,
        source: value.source,
        observedAt: value.capturedAt,
      }
    );
    const absence = Trust.applyAbsencePolicy(
      previousSnapshot,
      canonical.followerUsernames,
      canonical.followingUsernames,
      stored[keys.absences],
      {
        profile: value.profile,
        capturedAt: value.capturedAt,
        confirmRemovalsAfter: settings.confirmRemovalsAfter,
      }
    );
    const review = Trust.buildCaptureReview({
      previousSnapshot,
      followers: canonical.followerUsernames,
      following: canonical.followingUsernames,
      expectedFollowers: value.expectedFollowers,
      expectedFollowing: value.expectedFollowing,
      source: value.source,
      profileId: value.profileId,
      capturedAt: value.capturedAt,
      durationMs: value.durationMs,
      retries: value.retries,
      warnings: value.warnings,
      renames: canonical.renames,
      pendingAbsences: absence.pending,
      confirmedAbsences: absence.confirmed,
      settings,
    });
    review.changes = confirmedChanges(previousSnapshot, absence);
    review.observedChanges = {
      newFollowers: Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], canonical.followerUsernames).added,
      missingFollowers: Core.compareSnapshots(previousSnapshot && previousSnapshot.followers || [], canonical.followerUsernames).removed,
      newFollowing: Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], canonical.followingUsernames).added,
      missingFollowing: Core.compareSnapshots(previousSnapshot && previousSnapshot.following || [], canonical.followingUsernames).removed,
    };
    const resolvedUsers = [...canonical.followers, ...canonical.following];
    const stage = {
      schemaVersion: 1,
      id: makeStageId(value.profile, value.capturedAt),
      profile: value.profile,
      profileId: String(value.profileId || ""),
      source: value.source,
      createdAt: new Date().toISOString(),
      capturedAt: value.capturedAt,
      runId: value.runId,
      expectedFollowers: Number.isFinite(Number(value.expectedFollowers)) ? Number(value.expectedFollowers) : null,
      expectedFollowing: Number.isFinite(Number(value.expectedFollowing)) ? Number(value.expectedFollowing) : null,
      collectedFollowers: canonical.followerUsernames.length,
      collectedFollowing: canonical.followingUsernames.length,
      review,
      settings,
      snapshot: {
        schemaVersion: 3,
        profile: value.profile,
        profileId: String(value.profileId || ""),
        followers: absence.followers,
        following: absence.following,
        users: relevantIdentityRecords(canonical.registry, resolvedUsers),
        updatedAt: value.capturedAt,
        runId: value.runId,
        reportId: value.runId,
        captureMeta: review,
      },
      identityRegistry: canonical.registry,
      absenceState: absence.state,
      raw: {
        followers: value.followers,
        following: value.following,
      },
    };
    await storageSet({ [keys.pending]: stage });
    return stage;
  }

  function captureMetaMap(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      schemaVersion: 1,
      profile: Trust.safeProfile(input.profile),
      reports: input.reports && typeof input.reports === "object" ? { ...input.reports } : {},
      updatedAt: String(input.updatedAt || new Date(0).toISOString()),
    };
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
    const metadata = captureMetaMap({
      ...(stored[keys.captureMeta] || {}),
      profile: stage.profile,
    });
    const captureMeta = Trust.captureMetaForCommit(stage.review, normalizedDecision);
    metadata.reports[stage.runId] = {
      ...captureMeta,
      label: String(captureMeta.label || ""),
      note: String(captureMeta.note || ""),
    };
    metadata.updatedAt = new Date().toISOString();
    const snapshot = {
      ...stage.snapshot,
      captureMeta,
      updatedAt: stage.capturedAt,
      runId: stage.runId,
      reportId: stage.runId,
    };
    const profileMeta = {
      schemaVersion: 1,
      profile: stage.profile,
      label: String(stored[keys.profileMeta] && stored[keys.profileMeta].label || ""),
      archived: stored[keys.profileMeta] && stored[keys.profileMeta].archived === true,
      profileId: String(stage.profileId || stored[keys.profileMeta] && stored[keys.profileMeta].profileId || ""),
      lastCaptureSource: stage.source,
      lastCaptureAt: stage.capturedAt,
      updatedAt: new Date().toISOString(),
    };
    await storageSet({
      [keys.history]: snapshot,
      [keys.captureMeta]: metadata,
      [keys.identities]: stage.identityRegistry,
      [keys.absences]: stage.absenceState,
      [keys.profileMeta]: profileMeta,
    });
    await storageRemove(keys.pending);
    return { snapshot, captureMeta, metadata, profileMeta };
  }

  async function discardStage(stageOrProfile) {
    const profile = typeof stageOrProfile === "string"
      ? stageOrProfile
      : stageOrProfile && stageOrProfile.profile;
    if (!profile) return;
    await storageRemove(Trust.storageKeys(profile).pending);
  }

  async function loadPending(profile) {
    const key = Trust.storageKeys(profile).pending;
    const result = await storageGet([key]);
    return result[key] || null;
  }

  async function importOfficialExport(profile, parts, options) {
    const list = Array.isArray(parts) ? parts : [];
    const hasFollowers = list.some((part) => part && part.phase === "followers");
    const hasFollowing = list.some((part) => part && part.phase === "following");
    if (!hasFollowers || !hasFollowing) {
      throw new Error("Seleccioná al menos un archivo de seguidores y uno de seguidos.");
    }
    const merged = Trust.mergeInstagramExportParts(list);
    if (!merged.complete) throw new Error("Los archivos no contienen listas reconocibles.");
    return stageCapture({
      profile,
      source: "instagram_export",
      followers: merged.followers,
      following: merged.following,
      expectedFollowers: merged.followers.length,
      expectedFollowing: merged.following.length,
      warnings: merged.warnings,
      capturedAt: options && options.capturedAt || new Date().toISOString(),
      runId: options && options.runId || Core.makeRunId(),
      settings: options && options.settings,
    });
  }

  return {
    captureMetaMap,
    commitStage,
    confirmedChanges,
    discardStage,
    importOfficialExport,
    loadPending,
    normalizeCaptureInput,
    stageCapture,
    storageGet,
    storageRemove,
    storageSet,
  };
});
