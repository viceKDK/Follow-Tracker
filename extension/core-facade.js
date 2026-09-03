(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain
    ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-relations.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";

  if (!Domain) throw new Error("Follow Tracker Follower Domain no fue cargado.");

  function makeRunId(date, randomValue) {
    const d = date instanceof Date ? date : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp =
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `t${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
    const random = Number.isFinite(randomValue) ? randomValue : Math.random();
    const suffix = Math.floor(Math.max(0, Math.min(0.999999, random)) * 0xffffff)
      .toString(36)
      .padStart(5, "0")
      .slice(-5);
    return `${stamp}-${suffix}`;
  }

  function isInstagramHostname(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    return host === "instagram.com" || host === "www.instagram.com";
  }

  function buildCsvFilename(profile, phase, runId, timestamp) {
    if (phase !== "followers" && phase !== "following") {
      throw new Error(`Fase CSV no valida: ${phase}`);
    }
    const safeRun = String(runId || makeRunId()).replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    const ts = Number.isFinite(timestamp) ? Math.floor(timestamp) : Date.now();
    return `ig_auto_${Domain.safeProfile(profile)}_${phase}_${safeRun}_${ts}.csv`;
  }

  function compareSnapshots(previousRows, currentRows) {
    const diff = Domain.diffLists(previousRows, currentRows);
    return { added: diff.added, removed: diff.removed };
  }

  function mergeRows() {
    const rows = Array.from(arguments).flatMap((value) => Array.isArray(value) ? value : []);
    return Domain.uniqueUsers(rows).map((user) => ({
      username: user.username,
      fullName: user.fullName || "Sin Nombre",
    }));
  }

  function completeness(actual, expected, ratio) {
    const count = Number(actual) || 0;
    if (!Number.isFinite(expected) || expected < 0) {
      return { complete: count > 0, ratio: null, expectedKnown: false };
    }
    if (expected === 0) {
      return { complete: count === 0, ratio: null, expectedKnown: true };
    }
    const actualRatio = count / expected;
    return {
      complete: actualRatio >= (Number.isFinite(ratio) ? ratio : 0.95),
      ratio: actualRatio,
      expectedKnown: true,
    };
  }

  function buildRelationshipComparison(followersRows, followingRows) {
    const categories = Domain.deriveCategories({
      profile: "perfil",
      followers: followersRows || [],
      following: followingRows || [],
      updatedAt: new Date(0).toISOString(),
    });
    return {
      nos: categories.mutual,
      noLoSigo: categories.followersOnly,
      noMeSigue: categories.followingOnly,
    };
  }

  function isApiResultTooLow(actual, expected) {
    if (!Number.isFinite(expected) || expected <= 0) return false;
    const threshold = Math.min(expected, Math.max(5, Math.floor(expected * 0.3)));
    return actual < threshold;
  }

  function escapeCsvValue(value) {
    let text = String(value == null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  return {
    Domain,
    buildCsvFilename,
    buildRelationshipComparison,
    compareSnapshots,
    completeness,
    escapeCsvValue,
    isApiResultTooLow,
    isInstagramHostname,
    makeRunId,
    mergeRows,
    safeProfile: Domain.safeProfile,
    uniqueUsernames: Domain.uniqueUsernames,
  };
});
