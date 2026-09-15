(function (root, factory) {
  const domain = root && root.FollowTrackerFollowerDomain ? root.FollowTrackerFollowerDomain
    : (typeof module === "object" && module.exports ? require("./follower-identity.js") : null);
  const api = factory(domain);
  if (typeof module === "object" && module.exports) module.exports = Object.assign(domain, api);
  if (root && domain) Object.assign(domain, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Domain) {
  "use strict";
  if (!Domain) throw new Error("Follow Tracker Follower Identity no fue cargado.");
  const { SNAPSHOT_SCHEMA_VERSION, safeProfile, isoOrNow, normalizeUser, uniqueUsers, uniqueUsernames } = Domain;
  const IMPORT_SCHEMA_VERSION = 3;
  const BLOCKED_PATHS = new Set(["accounts", "about", "api", "challenge", "direct", "explore", "legal", "p", "reel", "reels", "stories", "tv"]);
  const NON_RELATIONSHIP_EXPORTS = /(?:recently_unfollowed|follow_requests|pending_follow|close_friends|blocked|restricted|removed_suggestions)/i;

  function optionalNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function metrics(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      inputRecords: Math.max(0, Number(input.inputRecords) || 0),
      validRecords: Math.max(0, Number(input.validRecords) || 0),
      invalidRecords: Math.max(0, Number(input.invalidRecords) || 0),
      duplicateRecords: Math.max(0, Number(input.duplicateRecords) || 0),
      missingUsernameRecords: Math.max(0, Number(input.missingUsernameRecords) || 0),
    };
  }

  function addUser(value, source, output, stats) {
    stats.inputRecords += 1;
    const user = normalizeUser(value, source);
    if (!user) {
      stats.invalidRecords += 1;
      stats.missingUsernameRecords += 1;
      return;
    }
    stats.validRecords += 1;
    output.push(user);
  }

  function extractImportUsers(value, output, statsValue, visitedValue) {
    const stats = statsValue || metrics();
    const visited = visitedValue || new WeakSet();
    if (!value) return stats;
    if (Array.isArray(value)) {
      value.forEach((entry) => extractImportUsers(entry, output, stats, visited));
      return stats;
    }
    if (typeof value !== "object" || visited.has(value)) return stats;
    visited.add(value);
    if (Array.isArray(value.string_list_data)) {
      value.string_list_data.forEach((entry) => addUser({
        username: entry && (entry.value || entry.username || userFromHref(entry.href) || entry.href),
        fullName: value.title || value.full_name || value.fullName || "",
        id: entry && (entry.id || entry.pk || entry.pk_id || entry.instagram_user_id),
        href: entry && entry.href,
      }, "instagram_export_json", output, stats));
    }
    if (value.username || value.user_name || value.handle) addUser(value, "instagram_export_json", output, stats);
    Object.entries(value).forEach(([key, entry]) => {
      if (key !== "string_list_data") extractImportUsers(entry, output, stats, visited);
    });
    return stats;
  }

  function normalizeImportPath(name) {
    return String(name || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  }

  function baseImportName(name) {
    const path = normalizeImportPath(name);
    return path.split("/").filter(Boolean).pop() || path;
  }

  function phaseFromImportName(name, payload) {
    const path = normalizeImportPath(name);
    const base = baseImportName(path);
    if (NON_RELATIONSHIP_EXPORTS.test(path)) return "unknown";
    if (/^followers?(?:_\d+)?\.(?:json|html?|csv)$/i.test(base)
      || /(?:^|\/)followers_and_following\/followers?(?:_\d+)?\.(?:json|html?|csv)$/i.test(path)) return "followers";
    if (/^(?:following|following_accounts)(?:_\d+)?\.(?:json|html?|csv)$/i.test(base)
      || /(?:^|\/)followers_and_following\/(?:following|following_accounts)(?:_\d+)?\.(?:json|html?|csv)$/i.test(path)) return "following";
    if (payload && typeof payload === "object") {
      if (payload.relationships_followers || payload.followers) return "followers";
      if (payload.relationships_following || payload.following || payload.following_accounts) return "following";
    }
    const text = typeof payload === "string" ? payload.slice(0, 4000).toLowerCase() : "";
    if (/\bfollowers\b|\bseguidores\b/.test(text)) return "followers";
    if (/\bfollowing\b|\bseguidos\b/.test(text)) return "following";
    return "unknown";
  }

  function decodeHtml(value) {
    return String(value || "").replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(x?[0-9a-f]+);/gi, (_all, code) => String.fromCodePoint(parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10)))
      .replace(/\s+/g, " ").trim();
  }

  function userFromHref(href) {
    let path = String(href || "").trim();
    if (/^https?:/i.test(path)) {
      try {
        const url = new URL(path);
        if (!/^(?:www\.)?instagram\.com$/i.test(url.hostname)) return "";
        path = url.pathname;
      } catch (_error) { return ""; }
    }
    const parts = path.split(/[/?#]/).filter(Boolean);
    const first = parts[0] === "_u" ? parts[1] || "" : parts[0] || "";
    return BLOCKED_PATHS.has(first.toLowerCase()) ? "" : first;
  }

  function parseCsvLine(line, delimiterValue) {
    const delimiter = delimiterValue || ",";
    const cells = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { cells.push(value); value = ""; }
      else value += char;
    }
    cells.push(value);
    return cells.map((cell) => cell.trim());
  }

  function delimiterForCsv(header) {
    const commas = (String(header || "").match(/,/g) || []).length;
    const semicolons = (String(header || "").match(/;/g) || []).length;
    return semicolons > commas ? ";" : ",";
  }

  function completenessFor(part) {
    const expected = optionalNumber(part.expectedCount);
    const captured = part.users.length;
    const ratio = expected == null ? null : expected === 0 ? (captured === 0 ? 1 : null) : captured / expected;
    const explicit = part.completeness && typeof part.completeness === "object" ? part.completeness : {};
    let status = String(explicit.status || "");
    if (!status) {
      if (part.phase === "unknown") status = "unknown";
      else if (explicit.paginationCompleted === false || (ratio != null && ratio < 0.8)) status = "partial";
      else if (explicit.paginationCompleted === true && (ratio == null || ratio >= 0.95)) status = "complete";
      else status = "probably_complete";
    }
    const confidence = Number.isFinite(Number(explicit.confidence))
      ? Math.min(1, Math.max(0, Number(explicit.confidence)))
      : status === "complete" ? 1 : status === "probably_complete" ? 0.95 : status === "partial" ? 0.4 : 0.25;
    return { status, confidence, expectedCount: expected, capturedCount: captured, coverage: ratio,
      paginationCompleted: typeof explicit.paginationCompleted === "boolean" ? explicit.paginationCompleted : null };
  }

  function finishPart(part, rawStats) {
    const users = uniqueUsers(part.users || [], part.format || "instagram_export");
    const stats = metrics(rawStats);
    stats.duplicateRecords = Math.max(stats.duplicateRecords, stats.validRecords - users.length);
    const warnings = [...new Set((part.warnings || []).map(String).filter(Boolean))];
    const sourcePath = normalizeImportPath(part.sourcePath || part.relativePath || part.path || part.name);
    const output = { schemaVersion: IMPORT_SCHEMA_VERSION, phase: part.phase, name: String(part.name || baseImportName(sourcePath) || "archivo"),
      sourcePath, format: part.format, formatVersion: String(part.formatVersion || ""), users, warnings, metrics: stats,
      expectedCount: optionalNumber(part.expectedCount), completeness: null };
    output.completeness = completenessFor({ ...output, completeness: part.completeness });
    output.warning = warnings[0] || "";
    return output;
  }

  function partPath(part) {
    return part && (part.relativePath || part.webkitRelativePath || part.path || part.name) || "archivo";
  }

  const normalizers = [
    { id: "canonical", canHandle: (part) => part && Array.isArray(part.users) && part.payload === undefined && part.content === undefined,
      normalize(part) { const stats = metrics(part.metrics); if (!stats.inputRecords) { stats.inputRecords = part.users.length; stats.validRecords = part.users.length; }
        return finishPart({ ...part, sourcePath: partPath(part), phase: ["followers", "following"].includes(part.phase) ? part.phase : "unknown", format: part.format || "canonical",
          warnings: [part.warning, ...(part.warnings || [])].filter(Boolean) }, stats); } },
    { id: "instagram-json", canHandle: (part) => part && (typeof part.payload === "object" || typeof part.content === "object" || /\.json$/i.test(partPath(part))),
      normalize(part) { let payload = part.payload !== undefined ? part.payload : part.content; const warnings = [];
        if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch (_error) { warnings.push(`${part.name || "archivo"}: JSON inválido.`); payload = null; } }
        const sourcePath = partPath(part); const phase = phaseFromImportName(sourcePath, payload); let source = payload;
        if (phase === "followers" && payload) source = payload.relationships_followers || payload.followers || payload;
        if (phase === "following" && payload) source = payload.relationships_following || payload.following_accounts || payload.following || payload;
        const users = []; const stats = extractImportUsers(source, users);
        if (phase === "unknown") warnings.push(`No se pudo clasificar ${part.name || baseImportName(sourcePath) || "un archivo"}.`);
        return finishPart({ ...part, sourcePath, phase, format: "instagram-json", users, warnings }, stats); } },
    { id: "instagram-html", canHandle: (part) => part && (/\.html?$/i.test(partPath(part)) || /^\s*</.test(String(part.payload ?? part.content ?? ""))),
      normalize(part) { const html = String(part.payload ?? part.content ?? ""); const sourcePath = partPath(part); const phase = phaseFromImportName(sourcePath, html); const users = []; const stats = metrics();
        const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let match;
        while ((match = pattern.exec(html))) { const username = userFromHref(match[1]); if (username) addUser({ username, fullName: decodeHtml(match[2]) }, "instagram_export_html", users, stats); }
        const warnings = phase === "unknown" ? [`No se pudo clasificar ${part.name || baseImportName(sourcePath) || "un archivo"}.`] : [];
        if (!users.length) warnings.push(`${part.name || baseImportName(sourcePath) || "El HTML"} no contiene perfiles reconocibles.`);
        return finishPart({ ...part, sourcePath, phase, format: "instagram-html", users, warnings }, stats); } },
    { id: "csv", canHandle: (part) => part && /\.csv$/i.test(partPath(part)),
      normalize(part) { const text = String(part.payload ?? part.content ?? ""); const lines = text.split(/\r?\n/).filter((line) => line.trim());
        const header = lines.shift() || ""; const delimiter = delimiterForCsv(header); const headers = parseCsvLine(header, delimiter).map((value) => value.toLowerCase());
        const usernameIndex = headers.findIndex((value) => ["username", "user_name", "handle"].includes(value));
        const nameIndex = headers.findIndex((value) => ["full_name", "fullname", "name"].includes(value));
        const idIndex = headers.findIndex((value) => ["id", "pk", "instagram_user_id"].includes(value));
        const users = []; const stats = metrics(); const warnings = [];
        lines.forEach((line) => { const cells = parseCsvLine(line, delimiter); addUser({ username: cells[usernameIndex >= 0 ? usernameIndex : 0],
          fullName: nameIndex >= 0 ? cells[nameIndex] : "", id: idIndex >= 0 ? cells[idIndex] : "" }, "csv", users, stats); });
        const sourcePath = partPath(part); const phase = phaseFromImportName(sourcePath, text); if (usernameIndex < 0) warnings.push("El CSV no declara una columna username; se usó la primera columna.");
        if (phase === "unknown") warnings.push(`No se pudo clasificar ${part.name || baseImportName(sourcePath) || "un archivo"}.`);
        return finishPart({ ...part, sourcePath, phase, format: "csv", users, warnings }, stats); } },
  ];

  function normalizeImportPart(part) {
    if (!part || typeof part !== "object") return finishPart({ phase: "unknown", name: "archivo", sourcePath: "archivo", format: "unknown", users: [], warnings: ["Archivo inválido."] }, metrics());
    const normalizer = normalizers.find((entry) => entry.canHandle(part));
    return normalizer ? normalizer.normalize(part) : finishPart({ ...part, sourcePath: partPath(part), phase: "unknown", format: "unknown", users: [], warnings: [`Formato no soportado: ${part.name || "archivo"}.`] }, metrics());
  }

  function parseInstagramExportPart(name, payload) { return normalizeImportPart({ name, sourcePath: name, payload }); }

  function mergeInstagramExportParts(parts) {
    const normalized = (Array.isArray(parts) ? parts : []).map(normalizeImportPart);
    const followersParts = normalized.filter((part) => part.phase === "followers");
    const followingParts = normalized.filter((part) => part.phase === "following");
    const followers = uniqueUsers(followersParts.flatMap((part) => part.users), "instagram_export");
    const following = uniqueUsers(followingParts.flatMap((part) => part.users), "instagram_export");
    const warnings = normalized.flatMap((part) => part.warnings);
    [followersParts, followingParts].forEach((phaseParts) => {
      const numbered = phaseParts.map((part) => Number((baseImportName(part.sourcePath || part.name).match(/_(\d+)\.(?:json|html?|csv)$/i) || [])[1])).filter(Number.isFinite).sort((a, b) => a - b);
      if (numbered.length && (numbered[0] !== 1 || numbered.some((value, index) => index && value !== numbered[index - 1] + 1))) warnings.push("Falta una parte numerada de la exportación.");
    });
    const hasFollowers = followersParts.length > 0;
    const hasFollowing = followingParts.length > 0;
    const phaseCompleteness = {
      followers: completenessFor({ phase: hasFollowers ? "followers" : "unknown", users: followers,
        completeness: followersParts.length ? { status: followersParts.some((part) => part.completeness.status === "partial") ? "partial" : "probably_complete",
          confidence: Math.min(...followersParts.map((part) => part.completeness.confidence)) } : null }),
      following: completenessFor({ phase: hasFollowing ? "following" : "unknown", users: following,
        completeness: followingParts.length ? { status: followingParts.some((part) => part.completeness.status === "partial") ? "partial" : "probably_complete",
          confidence: Math.min(...followingParts.map((part) => part.completeness.confidence)) } : null }),
    };
    let status = !hasFollowers || !hasFollowing || warnings.some((value) => /falta una parte/i.test(value)) ? "partial" : "probably_complete";
    if (!hasFollowers && !hasFollowing) status = "unknown";
    const confidence = status === "probably_complete" ? Math.min(phaseCompleteness.followers.confidence, phaseCompleteness.following.confidence) : status === "partial" ? 0.4 : 0.2;
    const totalMetrics = normalized.reduce((total, part) => { Object.keys(total).forEach((key) => { total[key] += part.metrics[key]; }); return total; }, metrics());
    return { schemaVersion: IMPORT_SCHEMA_VERSION, followers, following, warnings: [...new Set(warnings)], hasFollowers, hasFollowing,
      complete: hasFollowers && hasFollowing && status !== "partial", formats: [...new Set(normalized.map((part) => part.format))], parts: normalized,
      metrics: { ...totalMetrics, followers: followersParts.reduce((total, part) => { Object.keys(total).forEach((key) => { total[key] += part.metrics[key]; }); return total; }, metrics()),
        following: followingParts.reduce((total, part) => { Object.keys(total).forEach((key) => { total[key] += part.metrics[key]; }); return total; }, metrics()) },
      completeness: { status, confidence, capturedFollowers: followers.length, capturedFollowing: following.length, phases: phaseCompleteness } };
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    const normalized = { ...snapshot, schemaVersion: SNAPSHOT_SCHEMA_VERSION, profile: safeProfile(snapshot.profile || "perfil"),
      profileId: String(snapshot.profileId || ""), followers: uniqueUsernames(snapshot.followers || []), following: uniqueUsernames(snapshot.following || []),
      updatedAt: isoOrNow(snapshot.updatedAt), runId: String(snapshot.runId || "").trim(), reportId: String(snapshot.reportId || "").trim() };
    if (Array.isArray(snapshot.users)) {
      normalized.users = uniqueUsers(snapshot.users.map((user) => ({
        ...user,
        username: user && (user.currentUsername || user.username || user.canonicalUsername),
      })));
    }
    return normalized;
  }
  function createSnapshot(input) { const value = input && typeof input === "object" ? input : {}; return normalizeSnapshot({ ...value,
    updatedAt: value.updatedAt || value.capturedAt || new Date().toISOString(), runId: value.runId || "", reportId: value.reportId || value.runId || "" }); }
  function diffLists(previousRows, currentRows) { const previous = uniqueUsernames(previousRows || []); const current = uniqueUsernames(currentRows || []);
    const before = new Set(previous); const after = new Set(current); return { added: current.filter((value) => !before.has(value)), removed: previous.filter((value) => !after.has(value)),
      unchanged: current.filter((value) => before.has(value)), beforeCount: previous.length, afterCount: current.length, delta: current.length - previous.length }; }

  return { IMPORT_SCHEMA_VERSION, IMPORT_NORMALIZERS: normalizers, baseImportName, extractImportUsers, normalizeImportPath, phaseFromImportName, parseInstagramExportPart,
    normalizeImportPart, mergeInstagramExportParts, normalizeSnapshot, createSnapshot, diffLists };
});