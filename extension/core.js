(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function safeProfile(value) {
    return String(value || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "perfil";
  }

  function isInstagramHostname(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
    return host === "instagram.com" || host === "www.instagram.com";
  }

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

  function buildCsvFilename(profile, phase, runId, timestamp) {
    if (phase !== "followers" && phase !== "following") {
      throw new Error(`Fase CSV no valida: ${phase}`);
    }
    const safeRun = String(runId || makeRunId()).replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    const ts = Number.isFinite(timestamp) ? Math.floor(timestamp) : Date.now();
    return `ig_auto_${safeProfile(profile)}_${phase}_${safeRun}_${ts}.csv`;
  }

  function uniqueUsernames(rows) {
    const byLowercase = new Map();
    (rows || []).forEach((row) => {
      const raw = typeof row === "string" ? row : row && row.username;
      const username = typeof raw === "string" ? raw.trim() : "";
      if (username) byLowercase.set(username.toLowerCase(), username);
    });
    return Array.from(byLowercase.values()).sort((a, b) => a.localeCompare(b));
  }

  function compareSnapshots(previousRows, currentRows) {
    const previous = uniqueUsernames(previousRows);
    const current = uniqueUsernames(currentRows);
    const previousSet = new Set(previous.map((u) => u.toLowerCase()));
    const currentSet = new Set(current.map((u) => u.toLowerCase()));
    return {
      added: current.filter((u) => !previousSet.has(u.toLowerCase())),
      removed: previous.filter((u) => !currentSet.has(u.toLowerCase())),
    };
  }

  function mergeRows() {
    const byUsername = new Map();
    Array.from(arguments).forEach((rows) => {
      (rows || []).forEach((row) => {
        if (!row || !row.username) return;
        const username = String(row.username).trim().toLowerCase();
        if (!username) return;
        byUsername.set(username, {
          username,
          fullName: String(row.fullName || "Sin Nombre").trim() || "Sin Nombre",
        });
      });
    });
    return Array.from(byUsername.values()).sort((a, b) => a.username.localeCompare(b.username));
  }

  function completeness(actual, expected, ratio) {
    const count = Number(actual) || 0;
    if (!Number.isFinite(expected) || expected < 0) {
      // Sin contador, una lista vacia puede ser un fallo de extraccion. Solo
      // aceptamos cero cuando Instagram informo explicitamente expected === 0.
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
    const followers = new Set(uniqueUsernames(followersRows).map((u) => u.toLowerCase()));
    const following = new Set(uniqueUsernames(followingRows).map((u) => u.toLowerCase()));
    return {
      nos: [...followers].filter((u) => following.has(u)).sort(),
      noLoSigo: [...followers].filter((u) => !following.has(u)).sort(),
      noMeSigue: [...following].filter((u) => !followers.has(u)).sort(),
    };
  }

  function isApiResultTooLow(actual, expected) {
    if (!Number.isFinite(expected) || expected <= 0) return false;
    const threshold = Math.min(expected, Math.max(5, Math.floor(expected * 0.3)));
    return actual < threshold;
  }

  function escapeCsvValue(value) {
    let text = String(value == null ? "" : value);
    // Evita que Excel interprete nombres como formulas al abrir el CSV.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  return {
    buildCsvFilename,
    buildRelationshipComparison,
    compareSnapshots,
    completeness,
    escapeCsvValue,
    makeRunId,
    mergeRows,
    safeProfile,
    uniqueUsernames,
    isInstagramHostname,
    isApiResultTooLow,
  };
});
