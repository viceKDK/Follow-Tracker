(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerProductCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EVENT_TYPES = Object.freeze([
    "followed_you",
    "unfollowed_you",
    "you_followed",
    "you_unfollowed",
  ]);

  const EVENT_SEARCH_ALIASES = Object.freeze({
    followed_you: "te sigue ahora empezó a seguirte empezo a seguirte nuevo seguidor",
    unfollowed_you: "te dejó de seguir te dejo de seguir unfollow baja",
    you_followed: "lo seguís ahora lo sigues ahora empezaste a seguir",
    you_unfollowed: "lo dejaste de seguir dejaste de seguir",
  });

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeUsername(value) {
    const raw = typeof value === "string" ? value : value && value.username;
    return String(raw || "").trim().replace(/^@+/, "").toLowerCase();
  }

  function normalizedProfile(value) {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  function validDateMs(value) {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function filterDateMs(value, endOfDay) {
    const text = String(value || "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return validDateMs(value);
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    );
    const parsed = date.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function duplicateUsernames(values) {
    const seen = new Set();
    const duplicates = new Set();
    asArray(values).forEach((value) => {
      const username = normalizeUsername(value);
      if (!username) return;
      if (seen.has(username)) duplicates.add(username);
      seen.add(username);
    });
    return [...duplicates].sort();
  }

  function clampPageSize(value, fallback = 100, max = 500) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.max(parsed, 10), max);
  }

  function paginate(values, requestedPage = 1, requestedPageSize = 100) {
    const rows = asArray(values);
    const pageSize = clampPageSize(requestedPageSize);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const page = Math.min(Math.max(Number.parseInt(requestedPage, 10) || 1, 1), pages);
    const offset = (page - 1) * pageSize;
    const items = rows.slice(offset, offset + pageSize);
    return {
      items,
      total: rows.length,
      page,
      pages,
      pageSize,
      start: rows.length ? offset + 1 : 0,
      end: rows.length ? offset + items.length : 0,
      hasPrevious: page > 1,
      hasNext: page < pages,
    };
  }

  function filterEvents(events, filters) {
    const options = filters && typeof filters === "object" ? filters : {};
    const query = String(options.query || "").trim().replace(/^@+/, "").toLowerCase();
    const type = String(options.type || "all");
    const reportId = String(options.reportId || "all");
    const from = filterDateMs(options.from, false);
    const toInclusive = filterDateMs(options.to, true);

    return asArray(events)
      .filter((event) => {
        if (!event || typeof event !== "object") return false;
        const username = normalizeUsername(event.username);
        const eventType = String(event.type || "");
        const eventReport = String(event.reportId || "");
        const occurredAt = validDateMs(event.occurredAt);
        if (type !== "all" && eventType !== type) return false;
        if (reportId !== "all" && eventReport !== reportId) return false;
        if (from != null && (occurredAt == null || occurredAt < from)) return false;
        if (toInclusive != null && (occurredAt == null || occurredAt > toInclusive)) return false;
        if (query) {
          const haystack = `${username} ${eventReport} ${eventType} ${EVENT_SEARCH_ALIASES[eventType] || ""}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => (validDateMs(b.occurredAt) || 0) - (validDateMs(a.occurredAt) || 0));
  }

  function countDuplicateIds(values) {
    const seen = new Set();
    let duplicates = 0;
    asArray(values).forEach((value) => {
      const id = String(value && value.id || "").trim();
      if (!id) return;
      if (seen.has(id)) duplicates += 1;
      seen.add(id);
    });
    return duplicates;
  }

  function buildDataHealth(snapshot, timeline) {
    const errors = [];
    const warnings = [];
    const current = snapshot && typeof snapshot === "object" ? snapshot : null;
    const history = timeline && typeof timeline === "object" ? timeline : null;

    if (!current) errors.push("Falta la captura actual del perfil.");
    if (!history) errors.push("Falta la línea temporal del perfil.");

    const followers = current ? asArray(current.followers) : [];
    const following = current ? asArray(current.following) : [];
    const reports = history ? asArray(history.reports) : [];
    const events = history ? asArray(history.events) : [];
    const snapshotProfile = normalizedProfile(current && current.profile);
    const timelineProfile = normalizedProfile(history && history.profile);

    if (current && !Array.isArray(current.followers)) errors.push("La lista de seguidores no es válida.");
    if (current && !Array.isArray(current.following)) errors.push("La lista de seguidos no es válida.");
    if (history && !Array.isArray(history.reports)) errors.push("La lista de reportes no es válida.");
    if (history && !Array.isArray(history.events)) errors.push("La lista de eventos no es válida.");
    if (snapshotProfile && timelineProfile && snapshotProfile !== timelineProfile) {
      errors.push("La captura y la línea temporal pertenecen a perfiles distintos.");
    }
    if (history && reports.length && !history.baseline) {
      errors.push("Hay reportes, pero falta la línea base necesaria para reconstruirlos.");
    }

    const duplicateFollowers = duplicateUsernames(followers);
    const duplicateFollowing = duplicateUsernames(following);
    if (duplicateFollowers.length) warnings.push(`${duplicateFollowers.length} seguidor(es) duplicado(s) en la captura.`);
    if (duplicateFollowing.length) warnings.push(`${duplicateFollowing.length} cuenta(s) seguida(s) duplicada(s) en la captura.`);

    const duplicateReports = countDuplicateIds(reports);
    const duplicateEvents = countDuplicateIds(events);
    if (duplicateReports) warnings.push(`${duplicateReports} reporte(s) con identificador duplicado.`);
    if (duplicateEvents) warnings.push(`${duplicateEvents} evento(s) con identificador duplicado.`);

    const invalidReports = reports.filter((report) => !report || !String(report.id || "").trim() || validDateMs(report.capturedAt) == null).length;
    const invalidEvents = events.filter((event) => !event || !normalizeUsername(event.username) || validDateMs(event.occurredAt) == null).length;
    const unknownEvents = events.filter((event) => event && !EVENT_TYPES.includes(String(event.type || ""))).length;
    if (invalidReports) warnings.push(`${invalidReports} reporte(s) con ID o fecha inválida.`);
    if (invalidEvents) warnings.push(`${invalidEvents} evento(s) con usuario o fecha inválida.`);
    if (unknownEvents) warnings.push(`${unknownEvents} evento(s) tienen un tipo desconocido.`);

    const latestReport = reports
      .filter(Boolean)
      .slice()
      .sort((a, b) => (validDateMs(a.capturedAt) || 0) - (validDateMs(b.capturedAt) || 0))
      .at(-1) || null;

    if (latestReport && current) {
      if (Number(latestReport.followersCount) !== followers.length) {
        warnings.push("El total del último reporte no coincide con la captura actual de seguidores.");
      }
      if (Number(latestReport.followingCount) !== following.length) {
        warnings.push("El total del último reporte no coincide con la captura actual de seguidos.");
      }
      const currentUpdatedAt = validDateMs(current.updatedAt);
      const reportCapturedAt = validDateMs(latestReport.capturedAt);
      if (currentUpdatedAt != null && reportCapturedAt != null && Math.abs(currentUpdatedAt - reportCapturedAt) > 1000) {
        warnings.push("La fecha de la captura actual no coincide con la del último reporte.");
      }
    }

    const score = Math.max(0, 100 - errors.length * 30 - warnings.length * 6);
    const status = errors.length ? "error" : warnings.length ? "warning" : "healthy";

    return {
      status,
      score,
      errors,
      warnings,
      profile: snapshotProfile || timelineProfile || "",
      metrics: {
        followers: followers.length,
        following: following.length,
        reports: reports.length,
        events: events.length,
        lastCapturedAt: latestReport ? latestReport.capturedAt : current && current.updatedAt || null,
      },
    };
  }

  function validateBackupPayload(value) {
    const errors = [];
    const warnings = [];
    const payload = value && typeof value === "object" ? value : null;
    if (!payload) {
      return { ok: false, errors: ["El archivo no contiene un objeto JSON válido."], warnings, snapshot: null, timeline: null, profile: "" };
    }

    const looksLikeSnapshot = Array.isArray(payload.followers) || Array.isArray(payload.following);
    const snapshot = looksLikeSnapshot ? payload : payload.snapshot;
    const timeline = looksLikeSnapshot ? null : payload.timeline || null;
    const snapshotProfile = normalizedProfile(snapshot && snapshot.profile);
    const timelineProfile = normalizedProfile(timeline && timeline.profile);

    if (!snapshot || typeof snapshot !== "object") {
      errors.push("Falta la captura actual (`snapshot`).");
    } else {
      if (!Array.isArray(snapshot.followers)) errors.push("`snapshot.followers` debe ser una lista.");
      if (!Array.isArray(snapshot.following)) errors.push("`snapshot.following` debe ser una lista.");
      if (!snapshotProfile) errors.push("La captura no identifica el perfil.");
      if (snapshot.updatedAt && validDateMs(snapshot.updatedAt) == null) {
        errors.push("`snapshot.updatedAt` no contiene una fecha válida.");
      }
      const duplicateFollowers = duplicateUsernames(snapshot.followers);
      const duplicateFollowing = duplicateUsernames(snapshot.following);
      if (duplicateFollowers.length) warnings.push(`${duplicateFollowers.length} seguidor(es) duplicado(s) serán normalizados.`);
      if (duplicateFollowing.length) warnings.push(`${duplicateFollowing.length} cuenta(s) seguida(s) duplicada(s) serán normalizadas.`);
    }

    if (!timeline) {
      warnings.push("El archivo no incluye línea temporal; se importará como una nueva línea base.");
    } else if (typeof timeline !== "object") {
      errors.push("`timeline` debe ser un objeto.");
    } else {
      const reports = Array.isArray(timeline.reports) ? timeline.reports : null;
      const events = Array.isArray(timeline.events) ? timeline.events : null;
      if (!reports) errors.push("`timeline.reports` debe ser una lista.");
      if (!events) errors.push("`timeline.events` debe ser una lista.");

      if (reports && reports.length && !timeline.baseline) {
        errors.push("La línea temporal tiene reportes, pero no tiene línea base.");
      }

      if (timeline.baseline) {
        if (typeof timeline.baseline !== "object") {
          errors.push("`timeline.baseline` debe ser un objeto.");
        } else {
          if (!String(timeline.baseline.reportId || "").trim()) errors.push("La línea base no identifica su reporte.");
          if (validDateMs(timeline.baseline.capturedAt) == null) errors.push("La línea base no tiene una fecha válida.");
          if (!Array.isArray(timeline.baseline.followers)) errors.push("`timeline.baseline.followers` debe ser una lista.");
          if (!Array.isArray(timeline.baseline.following)) errors.push("`timeline.baseline.following` debe ser una lista.");
          const baselineProfile = normalizedProfile(timeline.baseline.profile);
          if (baselineProfile && timelineProfile && baselineProfile !== timelineProfile) {
            errors.push("La línea base pertenece a un perfil distinto al de la línea temporal.");
          }
        }
      }

      if (reports) {
        const invalidReportObjects = reports.filter((report) => !report || typeof report !== "object").length;
        const invalidReportIds = reports.filter((report) => report && typeof report === "object" && !String(report.id || report.runId || "").trim()).length;
        const invalidReportDates = reports.filter((report) => report && typeof report === "object" && validDateMs(report.capturedAt) == null).length;
        const duplicateReports = countDuplicateIds(reports.map((report) => report && ({ id: report.id || report.runId })));
        if (invalidReportObjects) errors.push(`${invalidReportObjects} reporte(s) no son objetos válidos.`);
        if (invalidReportIds) errors.push(`${invalidReportIds} reporte(s) no tienen identificador.`);
        if (invalidReportDates) errors.push(`${invalidReportDates} reporte(s) no tienen fecha válida.`);
        if (duplicateReports) warnings.push(`${duplicateReports} reporte(s) duplicado(s) serán normalizados.`);
      }

      if (events) {
        const invalidEventObjects = events.filter((event) => !event || typeof event !== "object").length;
        const invalidEventUsers = events.filter((event) => event && typeof event === "object" && !normalizeUsername(event.username)).length;
        const invalidEventTypes = events.filter((event) => event && typeof event === "object" && !String(event.type || "").trim()).length;
        const invalidEventDates = events.filter((event) => event && typeof event === "object" && validDateMs(event.occurredAt) == null).length;
        const unknownEventTypes = events.filter((event) => event && typeof event === "object" && String(event.type || "").trim() && !EVENT_TYPES.includes(String(event.type))).length;
        const duplicateEvents = countDuplicateIds(events);
        if (invalidEventObjects) errors.push(`${invalidEventObjects} evento(s) no son objetos válidos.`);
        if (invalidEventUsers) errors.push(`${invalidEventUsers} evento(s) no identifican usuario.`);
        if (invalidEventTypes) errors.push(`${invalidEventTypes} evento(s) no identifican tipo.`);
        if (invalidEventDates) errors.push(`${invalidEventDates} evento(s) no tienen fecha válida.`);
        if (unknownEventTypes) warnings.push(`${unknownEventTypes} evento(s) usan un tipo desconocido.`);
        if (duplicateEvents) warnings.push(`${duplicateEvents} evento(s) duplicado(s) serán normalizados.`);
      }
    }

    if (snapshotProfile && timelineProfile && snapshotProfile !== timelineProfile) {
      errors.push("La captura y la línea temporal pertenecen a perfiles distintos.");
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      snapshot: snapshot || null,
      timeline,
      profile: snapshotProfile || timelineProfile,
    };
  }

  function csvCell(value) {
    let text = String(value == null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  return {
    EVENT_TYPES,
    buildDataHealth,
    clampPageSize,
    csvCell,
    duplicateUsernames,
    filterEvents,
    normalizeUsername,
    paginate,
    validateBackupPayload,
  };
});
