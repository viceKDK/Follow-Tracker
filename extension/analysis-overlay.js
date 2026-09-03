(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerAnalysisOverlay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function percentage(value) {
    return value == null || !Number.isFinite(value)
      ? "sin contador"
      : `${Math.min(100, Math.round(value * 1000) / 10).toLocaleString("es-UY")}%`;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("es-UY");
  }

  function injectStyles() {
    if (document.querySelector("#ft-v3-overlay-style")) return;
    const style = document.createElement("style");
    style.id = "ft-v3-overlay-style";
    style.textContent = `
      #ft-v3-overlay{position:fixed;top:18px;right:18px;z-index:2147483647;width:min(390px,calc(100vw - 28px));max-height:calc(100vh - 36px);overflow:auto;border:1px solid rgba(19,33,55,.14);border-radius:16px;background:#fff;color:#17213b;font:13px/1.45 Inter,Segoe UI,Arial,sans-serif;box-shadow:0 22px 60px rgba(16,24,40,.24)}
      #ft-v3-overlay *{box-sizing:border-box}
      #ft-v3-overlay button{font:inherit}
      #ft-v3-overlay .ft3-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;background:#283e86;color:#fff}
      #ft-v3-overlay .ft3-brand{display:grid;gap:1px}.ft3-brand strong{font-size:14px}.ft3-brand small{opacity:.82}
      #ft-v3-overlay .ft3-head-actions{display:flex;gap:6px}.ft3-icon{border:0;border-radius:8px;background:rgba(255,255,255,.16);color:#fff;min-width:30px;height:30px;cursor:pointer}.ft3-icon:hover{background:rgba(255,255,255,.25)}
      #ft-v3-overlay .ft3-body{padding:14px}
      #ft-v3-overlay .ft3-profile{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding-bottom:12px;border-bottom:1px solid #edf0f5}.ft3-profile span{display:block;color:#667085;font-size:11px;font-weight:800;text-transform:uppercase}.ft3-profile strong{display:block;margin-top:2px;font-size:15px}.ft3-state{padding:5px 8px;border-radius:999px;background:#eef3ff;color:#2f5bc5;font-size:11px;font-weight:800;text-transform:uppercase}.ft3-state.success{background:#eaf8f2;color:#126b53}.ft3-state.warning{background:#fff8e8;color:#8a5a0b}.ft3-state.error{background:#fff0f3;color:#9f2e43}
      #ft-v3-overlay .ft3-counts{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0}.ft3-count{padding:10px;border:1px solid #e4e8ef;border-radius:11px;background:#f8fafc}.ft3-count span{display:block;color:#667085;font-size:11px}.ft3-count strong{display:block;margin-top:3px;font-size:15px}.ft3-count small{display:block;margin-top:2px;color:#667085}
      #ft-v3-overlay .ft3-status{padding:9px 10px;border-radius:10px;background:#eef3ff;color:#2f5bc5;font-weight:700}.ft3-status.warning{background:#fff8e8;color:#8a5a0b}.ft3-status.error{background:#fff0f3;color:#9f2e43}.ft3-status.success{background:#eaf8f2;color:#126b53}
      #ft-v3-overlay .ft3-progress{height:6px;margin:9px 0 4px;border-radius:999px;background:#edf0f5;overflow:hidden}.ft3-progress span{display:block;height:100%;width:0;background:#2f6df6;transition:width .2s ease}
      #ft-v3-overlay .ft3-actions{display:flex;gap:8px;margin-top:11px}.ft3-btn{flex:1;border:0;border-radius:10px;padding:9px 10px;cursor:pointer;font-weight:800}.ft3-btn:disabled{cursor:default;opacity:.48}.ft3-primary{background:#2f6df6;color:#fff}.ft3-secondary{background:#eef1f6;color:#344054}.ft3-danger{background:#a43449;color:#fff}.ft3-ghost{border:1px solid #d8dee9;background:#fff;color:#475467}
      #ft-v3-overlay .ft3-log{margin-top:11px;max-height:130px;overflow:auto;border:1px solid #e4e8ef;border-radius:10px;background:#fafbfc;padding:8px}.ft3-log div{padding:3px 1px;color:#475467;border-bottom:1px solid #f0f2f6}.ft3-log div:last-child{border-bottom:0}
      #ft-v3-overlay .ft3-review{margin-top:12px;padding:12px;border:1px solid #d9e1ee;border-radius:13px;background:#f9fbff}.ft3-review[hidden]{display:none}.ft3-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.ft3-review h3{margin:0;font-size:15px}.ft3-review p{margin:4px 0;color:#667085}.ft3-score{min-width:62px;padding:8px;border-radius:10px;background:#eaf8f2;color:#126b53;text-align:center;font-weight:900}.ft3-score.review{background:#fff8e8;color:#8a5a0b}.ft3-score.rejected{background:#fff0f3;color:#9f2e43}
      #ft-v3-overlay .ft3-review-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.ft3-review-grid article{padding:8px;border-radius:9px;background:#fff;border:1px solid #e5e9f0}.ft3-review-grid span{display:block;color:#667085;font-size:11px}.ft3-review-grid strong{display:block;margin-top:2px}.ft3-review-list{display:grid;gap:5px;margin:8px 0}.ft3-review-list div{padding:7px 8px;border-radius:8px;background:#fff8e8;color:#7b520d;font-size:12px}.ft3-review-list div.ok{background:#eaf8f2;color:#126b53}.ft3-review-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.ft3-review-actions .wide{grid-column:1/-1}
      @media(max-width:520px){#ft-v3-overlay{top:8px;right:8px;width:calc(100vw - 16px);max-height:calc(100vh - 16px)}#ft-v3-overlay .ft3-review-actions{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){#ft-v3-overlay .ft3-progress span{transition:none}}
    `;
    document.head.append(style);
  }

  function create(options) {
    const handlers = options && typeof options === "object" ? options : {};
    let element = null;
    let logs = [];
    let reviewResolver = null;

    function ensure() {
      if (element && document.body.contains(element)) return element;
      injectStyles();
      document.querySelector("#ft-v3-overlay")?.remove();
      element = document.createElement("aside");
      element.id = "ft-v3-overlay";
      element.setAttribute("aria-label", "Follow Tracker");
      element.innerHTML = `
        <div class="ft3-head">
          <div class="ft3-brand"><strong>Follow Tracker</strong><small>Captura con revisión de calidad</small></div>
          <div class="ft3-head-actions"><button id="ft3-dashboard" class="ft3-icon" type="button" title="Abrir dashboard">⇆</button><button id="ft3-min" class="ft3-icon" type="button" title="Ocultar">−</button><button id="ft3-close" class="ft3-icon" type="button" title="Cerrar">×</button></div>
        </div>
        <div class="ft3-body">
          <div class="ft3-profile"><div><span>Perfil</span><strong id="ft3-profile">—</strong></div><div id="ft3-state" class="ft3-state">Listo</div></div>
          <div class="ft3-counts">
            <div class="ft3-count"><span>Seguidores</span><strong id="ft3-followers">—</strong><small id="ft3-followers-sub">Sin iniciar</small></div>
            <div class="ft3-count"><span>Seguidos</span><strong id="ft3-following">—</strong><small id="ft3-following-sub">Sin iniciar</small></div>
          </div>
          <div id="ft3-status" class="ft3-status">Listo para analizar.</div>
          <div class="ft3-progress"><span id="ft3-progress-bar"></span></div>
          <div class="ft3-actions"><button id="ft3-start" class="ft3-btn ft3-primary" type="button">Analizar</button><button id="ft3-cancel" class="ft3-btn ft3-secondary" type="button" disabled>Cancelar</button></div>
          <section id="ft3-review" class="ft3-review" hidden></section>
          <div id="ft3-log" class="ft3-log"></div>
        </div>`;
      element.querySelector("#ft3-close").addEventListener("click", () => {
        if (reviewResolver) reviewResolver("discard");
        element.remove();
        element = null;
      });
      element.querySelector("#ft3-min").addEventListener("click", () => { element.style.display = "none"; });
      element.querySelector("#ft3-dashboard").addEventListener("click", () => handlers.onDashboard && handlers.onDashboard());
      element.querySelector("#ft3-start").addEventListener("click", () => handlers.onStart && handlers.onStart());
      element.querySelector("#ft3-cancel").addEventListener("click", () => handlers.onCancel && handlers.onCancel());
      document.body.append(element);
      renderLogs();
      return element;
    }

    function show(profile) {
      const target = ensure();
      target.style.display = "block";
      target.querySelector("#ft3-profile").textContent = profile ? `@${profile}` : "—";
      return target;
    }

    function setState(label, tone) {
      const target = ensure().querySelector("#ft3-state");
      target.textContent = label || "Listo";
      target.className = `ft3-state ${tone || ""}`.trim();
    }

    function setStatus(message, tone) {
      const target = ensure().querySelector("#ft3-status");
      target.textContent = message || "";
      target.className = `ft3-status ${tone || ""}`.trim();
    }

    function setBusy(busy) {
      const target = ensure();
      target.querySelector("#ft3-start").disabled = Boolean(busy);
      target.querySelector("#ft3-start").textContent = busy ? "Analizando…" : "Analizar";
      target.querySelector("#ft3-cancel").disabled = !busy;
      target.querySelector("#ft3-cancel").className = `ft3-btn ${busy ? "ft3-danger" : "ft3-secondary"}`;
    }

    function setProgress(phase, count, expected) {
      const isFollowers = phase === "followers";
      const countTarget = ensure().querySelector(isFollowers ? "#ft3-followers" : "#ft3-following");
      const subTarget = ensure().querySelector(isFollowers ? "#ft3-followers-sub" : "#ft3-following-sub");
      countTarget.textContent = Number.isFinite(expected)
        ? `${formatNumber(count)} / ${formatNumber(expected)}`
        : formatNumber(count);
      const ratio = Number.isFinite(expected) && expected > 0 ? Math.min(1, count / expected) : null;
      subTarget.textContent = ratio == null ? "Recolectando" : percentage(ratio);
      const bar = ensure().querySelector("#ft3-progress-bar");
      bar.style.width = `${ratio == null ? Math.min(92, Math.max(8, count % 100)) : Math.round(ratio * 100)}%`;
    }

    function resetCounts() {
      const target = ensure();
      target.querySelector("#ft3-followers").textContent = "—";
      target.querySelector("#ft3-following").textContent = "—";
      target.querySelector("#ft3-followers-sub").textContent = "Sin iniciar";
      target.querySelector("#ft3-following-sub").textContent = "Sin iniciar";
      target.querySelector("#ft3-progress-bar").style.width = "0";
      target.querySelector("#ft3-review").hidden = true;
    }

    function renderLogs() {
      if (!element) return;
      const target = element.querySelector("#ft3-log");
      target.innerHTML = logs.length
        ? logs.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
        : "<div>El análisis todavía no comenzó.</div>";
      target.scrollTop = target.scrollHeight;
    }

    function log(message) {
      logs.push(String(message || ""));
      if (logs.length > 30) logs = logs.slice(-30);
      renderLogs();
    }

    function requestReview(stage) {
      const review = stage && stage.review || {};
      const target = ensure().querySelector("#ft3-review");
      const reasons = review.reasons && review.reasons.length
        ? review.reasons.map((reason) => `<div>${escapeHtml(reason)}</div>`).join("")
        : '<div class="ok">No se detectaron problemas importantes.</div>';
      const changes = review.changes || {};
      const pending = (review.pendingAbsences && review.pendingAbsences.followers || []).length
        + (review.pendingAbsences && review.pendingAbsences.following || []).length;
      target.innerHTML = `
        <div class="ft3-review-head"><div><h3>Revisá antes de guardar</h3><p>Fuente: ${escapeHtml(review.source || stage.source || "desconocida")}</p></div><div class="ft3-score ${escapeHtml(review.status || "trusted")}">${formatNumber(review.score)}/100</div></div>
        <div class="ft3-review-grid">
          <article><span>Seguidores</span><strong>${formatNumber(review.collectedFollowers)}</strong><small>${percentage(review.followersCoverage)}</small></article>
          <article><span>Seguidos</span><strong>${formatNumber(review.collectedFollowing)}</strong><small>${percentage(review.followingCoverage)}</small></article>
          <article><span>Nuevos seguidores</span><strong>${formatNumber((changes.newFollowers || []).length)}</strong></article>
          <article><span>Bajas confirmadas</span><strong>${formatNumber((changes.lostFollowers || []).length)}</strong><small>${pending ? `${pending} pendiente(s)` : "sin pendientes"}</small></article>
        </div>
        <div class="ft3-review-list">${reasons}</div>
        <div class="ft3-review-actions">
          <button data-review="save" class="ft3-btn ft3-primary wide" type="button"${review.status === "rejected" ? " disabled" : ""}>Guardar reporte</button>
          <button data-review="save_suspicious" class="ft3-btn ft3-secondary" type="button">Guardar como sospechoso</button>
          <button data-review="discard" class="ft3-btn ft3-ghost" type="button">Descartar</button>
        </div>`;
      target.hidden = false;
      setState(review.status === "trusted" ? "Confiable" : review.status === "rejected" ? "Rechazada" : "Revisar", review.status === "trusted" ? "success" : review.status === "rejected" ? "error" : "warning");
      setStatus("La captura todavía no modificó tu historial.", review.status === "trusted" ? "success" : "warning");
      setBusy(false);
      return new Promise((resolve) => {
        reviewResolver = resolve;
        target.querySelectorAll("[data-review]").forEach((button) => {
          button.addEventListener("click", () => {
            const decision = button.dataset.review;
            target.querySelectorAll("button").forEach((item) => { item.disabled = true; });
            reviewResolver = null;
            resolve(decision);
          }, { once: true });
        });
      });
    }

    function complete(message, tone) {
      setBusy(false);
      setState(tone === "warning" ? "Descartada" : "Guardada", tone === "warning" ? "warning" : "success");
      setStatus(message, tone === "warning" ? "warning" : "success");
      ensure().querySelector("#ft3-progress-bar").style.width = "100%";
    }

    function fail(message) {
      setBusy(false);
      setState("Error", "error");
      setStatus(message, "error");
    }

    return {
      complete,
      ensure,
      fail,
      log,
      requestReview,
      resetCounts,
      setBusy,
      setProgress,
      setState,
      setStatus,
      show,
    };
  }

  return { create, escapeHtml, formatNumber, percentage };
});
