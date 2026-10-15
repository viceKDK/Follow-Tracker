(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerPopupCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BLOCKED = new Set([
    "explore", "accounts", "reels", "direct", "stories", "challenge",
    "about", "developers", "legal", "api", "p", "tv",
  ]);

  function cleanProfile(value) {
    const name = String(value || "").trim().toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(name) ? name : "";
  }

  function profileFromUrl(raw) {
    try {
      const url = new URL(raw || "");
      if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) return "";
      const segments = url.pathname.split("/").filter(Boolean);
      if (!segments.length || BLOCKED.has(segments[0].toLowerCase())) return "";
      return cleanProfile(segments[0]);
    } catch (_error) { return ""; }
  }

  function savedProfiles(storage) {
    const items = storage && typeof storage === "object" ? storage : {};
    const profiles = new Map();
    Object.entries(items).forEach(([key, snapshot]) => {
      if (!key.startsWith("ft_history_") || !snapshot || typeof snapshot !== "object") return;
      const profile = cleanProfile(snapshot.profile || key.slice("ft_history_".length));
      if (!profile) return;
      const date = Number(new Date(snapshot.updatedAt || 0)) || 0;
      profiles.set(profile, Math.max(profiles.get(profile) || 0, date));
    });
    return [...profiles.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }

  // Modern Chrome exposes storage.getKeys(), avoiding a full read of large histories
  // simply to populate the profile picker. Legacy browsers use savedProfiles().
  function savedProfilesFromKeys(keys, metadata) {
    const names = new Map();
    for (const key of Array.isArray(keys) ? keys : []) {
      if (typeof key !== "string" || !key.startsWith("ft_history_")) continue;
      const profile = cleanProfile(key.slice("ft_history_".length));
      if (!profile) continue;
      const meta = metadata && metadata[`ft_profile_meta_${profile}`];
      const date = Number(new Date(meta && (meta.lastCaptureAt || meta.updatedAt) || 0)) || 0;
      names.set(profile, Math.max(names.get(profile) || 0, date));
    }
    return [...names.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }

  function journey(reportCount, pending, qualityStatus) {
    const count = Math.max(0, Number(reportCount) || 0);
    if (!count) return { step: 0, label: pending ? "Revisá tu primera captura" : "Creá tu primera captura" };
    if (pending) return { step: Math.min(count, 2), label: "Tenés una captura pendiente de revisión" };
    if (count === 1) return { step: 1, label: "Repetí el análisis para ver cambios" };
    if (qualityStatus !== "trusted") {
      return { step: 2, label: "Revisá la calidad de tu historial" };
    }
    return { step: 3, label: "Historial listo para explorar" };
  }

  return { cleanProfile, profileFromUrl, savedProfiles, savedProfilesFromKeys, journey };
});
