(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerProductGuidance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ACTIONS = Object.freeze({
    START_CAPTURE: "start_capture",
    REVIEW_PENDING: "review_pending",
    CAPTURE_AGAIN: "capture_again",
    REVIEW_QUALITY: "review_quality",
    REVIEW_CHANGES: "review_changes",
    BACKUP: "backup",
    COMPARE: "compare",
    WATCHLIST: "watchlist",
    ACTIVITY: "activity",
  });

  function action(id, priority, title, description, reason, tone, meta) {
    return {
      id,
      priority,
      title,
      description,
      reason,
      tone: tone || "neutral",
      meta: meta || {},
    };
  }

  function progress(context) {
    if (!context.hasProfile || context.reportCount === 0) {
      return { current: 0, total: 3, label: "Crear una línea base" };
    }
    if (context.reportCount === 1) {
      return { current: 1, total: 3, label: "Conseguir una segunda captura" };
    }
    if (context.pendingCapture || context.pendingAbsenceCount || context.needsReview) {
      return { current: 2, total: 3, label: "Confirmar que los datos sean confiables" };
    }
    return { current: 3, total: 3, label: "Historial listo para investigar" };
  }

  function buildGuidance(input) {
    const context = {
      hasProfile: Boolean(input && input.hasProfile),
      reportCount: Math.max(0, Number(input && input.reportCount) || 0),
      pendingCapture: Boolean(input && input.pendingCapture),
      pendingAbsenceCount: Math.max(0, Number(input && input.pendingAbsenceCount) || 0),
      needsReview: Boolean(input && input.needsReview),
      suspiciousReportCount: Math.max(0, Number(input && input.suspiciousReportCount) || 0),
      latestChangesCount: Math.max(0, Number(input && input.latestChangesCount) || 0),
      backupDue: Boolean(input && input.backupDue),
      reportsSinceBackup: Math.max(0, Number(input && input.reportsSinceBackup) || 0),
      watchlistCount: Math.max(0, Number(input && input.watchlistCount) || 0),
    };

    const actions = [];

    if (!context.hasProfile || context.reportCount === 0) {
      actions.push(action(
        ACTIONS.START_CAPTURE,
        100,
        "Creá tu primera captura",
        "Esta captura será la referencia para reconocer cambios más adelante.",
        "Sin línea base todavía no existe un antes y un ahora.",
        "primary"
      ));
    } else if (context.pendingCapture) {
      actions.push(action(
        ACTIONS.REVIEW_PENDING,
        110,
        "Terminá de revisar la captura pendiente",
        "Los datos ya se recopilaron, pero todavía no modificaron el historial.",
        "Revisar antes de guardar evita convertir respuestas incompletas de Instagram en conclusiones falsas.",
        "warning"
      ));
    } else if (context.reportCount === 1) {
      actions.push(action(
        ACTIONS.CAPTURE_AGAIN,
        95,
        "Hacé una segunda captura",
        "Con dos fechas Follow Tracker puede mostrar quién cambió y cómo.",
        "Una única captura describe el presente; la segunda crea la comparación.",
        "primary"
      ));
    }

    if (context.pendingAbsenceCount > 0) {
      actions.push(action(
        ACTIONS.CAPTURE_AGAIN,
        105,
        `Confirmá ${context.pendingAbsenceCount} ausencia${context.pendingAbsenceCount === 1 ? "" : "s"} pendiente${context.pendingAbsenceCount === 1 ? "" : "s"}`,
        "Repetí el análisis para confirmar la baja o cancelar la alerta si la cuenta reaparece.",
        "Una desaparición aislada también puede deberse a bloqueo, suspensión, cambio de username o una respuesta incompleta.",
        "warning",
        { count: context.pendingAbsenceCount }
      ));
    }

    if (context.needsReview || context.suspiciousReportCount > 0) {
      actions.push(action(
        ACTIONS.REVIEW_QUALITY,
        100,
        "Revisá la calidad del historial",
        `${Math.max(1, context.suspiciousReportCount)} reporte${Math.max(1, context.suspiciousReportCount) === 1 ? "" : "s"} necesita${Math.max(1, context.suspiciousReportCount) === 1 ? "" : "n"} atención.`,
        "La evidencia de cobertura y cronología debe revisarse antes de confiar en una baja masiva.",
        "danger"
      ));
    }

    if (context.reportCount >= 2 && context.latestChangesCount > 0) {
      actions.push(action(
        ACTIONS.REVIEW_CHANGES,
        80,
        `Revisá ${context.latestChangesCount} cambio${context.latestChangesCount === 1 ? "" : "s"} reciente${context.latestChangesCount === 1 ? "" : "s"}`,
        "Abrí Antes y ahora para ver cada relación, no solamente los totales.",
        "La lista por persona responde quién cambió y evita interpretar mal una variación de cantidad.",
        "info",
        { count: context.latestChangesCount }
      ));
    }

    if (context.backupDue && context.reportCount > 0) {
      actions.push(action(
        ACTIONS.BACKUP,
        70,
        "Guardá un backup del historial",
        context.reportsSinceBackup
          ? `Hay ${context.reportsSinceBackup} reporte${context.reportsSinceBackup === 1 ? "" : "s"} nuevo${context.reportsSinceBackup === 1 ? "" : "s"} desde el último backup.`
          : "Todavía no existe un backup reciente de este perfil.",
        "El historial vive en el navegador; el backup permite recuperarlo después de una reinstalación.",
        "neutral"
      ));
    }

    if (context.watchlistCount > 0) {
      actions.push(action(
        ACTIONS.WATCHLIST,
        45,
        `Consultá tus ${context.watchlistCount} persona${context.watchlistCount === 1 ? "" : "s"} fijada${context.watchlistCount === 1 ? "" : "s"}`,
        "Mostrá únicamente las relaciones que decidiste seguir de cerca.",
        "La vista focalizada reduce ruido cuando el perfil tiene miles de relaciones.",
        "neutral"
      ));
    }

    if (!actions.length && context.reportCount >= 2) {
      actions.push(action(
        ACTIONS.COMPARE,
        60,
        "Compará el último reporte con el anterior",
        "El historial está consistente y listo para investigar.",
        "La comparación persona por persona es la tarea principal del producto.",
        "primary"
      ));
      actions.push(action(
        ACTIONS.ACTIVITY,
        40,
        "Explorá la actividad histórica",
        "Filtrá los cambios por usuario, fecha, tipo o reporte.",
        "Sirve para responder cuándo fue detectado un cambio concreto.",
        "neutral"
      ));
    }

    const sorted = actions
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 3);

    return {
      stage: progress(context),
      primary: sorted[0] || null,
      secondary: sorted.slice(1),
      actions: sorted,
      context,
    };
  }

  return { ACTIONS, buildGuidance };
});
