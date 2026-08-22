"use strict";

(function () {
  const ux = {
    relSort: ["priority", "asc"], relState: "all", relChange: "all", relDensity: "compact",
    peopleSort: ["lastEvent", "desc"], peopleDensity: "compact",
  };
  const s = (v) => String(v == null ? "" : v);
  const cmp = (a, b) => typeof a === "number" && typeof b === "number" ? a - b : s(a).localeCompare(s(b), "es", { sensitivity: "base", numeric: true });
  const tone = (v) => ["positive", "negative", "info", "warning"].includes(v) ? v : "neutral";
  const bool = (v, past = false) => `<span class="list-boolean ${v ? "yes" : "no"}" title="${v ? (past ? "Sí, estaba en la lista" : "Sí, está en la lista") : (past ? "No, no estaba en la lista" : "No, no está en la lista")}">${v ? "Sí" : "No"}</span>`;
  const sortButton = (label, key, config) => `<button class="table-sort${config[0] === key ? " active" : ""}" data-sort-key="${key}" type="button">${label} <span>${config[0] === key ? (config[1] === "asc" ? "↑" : "↓") : "↕"}</span></button>`;
  const toggleSort = (config, key) => { if (config[0] === key) config[1] = config[1] === "asc" ? "desc" : "asc"; else { config[0] = key; config[1] = key === "lastEvent" ? "desc" : "asc"; } };

  function changeType(item) {
    if (item.fromFollowsYou && !item.toFollowsYou) return "unfollowed-you";
    if (!item.fromFollowsYou && item.toFollowsYou) return "followed-you";
    if (item.fromYouFollow && !item.toYouFollow) return "you-unfollowed";
    if (!item.fromYouFollow && item.toYouFollow) return "you-followed";
    return item.changed ? "changed" : "unchanged";
  }
  function relValue(item, key) {
    return ({ username: item.normalized, fromFollowsYou: +item.fromFollowsYou, fromYouFollow: +item.fromYouFollow, toFollowsYou: +item.toFollowsYou, toYouFollow: +item.toYouFollow, headline: item.headline.toLowerCase(), priority: transitionPriority(item) })[key] ?? item.normalized;
  }
  function relRows() {
    const q = state.relationshipQuery.trim().toLowerCase().replace(/^@/, "");
    const dir = ux.relSort[1] === "desc" ? -1 : 1;
    return state.relationshipTransitions.filter((item) => {
      if (!relationshipMatchesFilter(item) || (q && !item.normalized.includes(q))) return false;
      if (ux.relState !== "all" && item.toState !== ux.relState) return false;
      if (ux.relChange === "changed" && !item.changed) return false;
      if (!["all", "changed"].includes(ux.relChange) && changeType(item) !== ux.relChange) return false;
      return true;
    }).sort((a, b) => cmp(relValue(a, ux.relSort[0]), relValue(b, ux.relSort[0])) * dir || a.normalized.localeCompare(b.normalized));
  }
  function peopleValue(p, key) {
    return ({ username: p.username.toLowerCase(), followsYou: +p.followsYou, youFollow: +p.youFollow, relationship: relationshipLabel(p).toLowerCase(), changes: p.events.length, lastEvent: p.lastEvent ? new Date(p.lastEvent.occurredAt).getTime() : 0 })[key] ?? p.username.toLowerCase();
  }
  function peopleRows() {
    const q = state.query.trim().toLowerCase().replace(/^@/, "");
    const dir = ux.peopleSort[1] === "desc" ? -1 : 1;
    return state.people.filter((p) => matchesFilter(p) && (!q || p.username.toLowerCase().includes(q))).sort((a, b) => cmp(peopleValue(a, ux.peopleSort[0]), peopleValue(b, ux.peopleSort[0])) * dir || a.username.localeCompare(b.username));
  }

  function injectCss() {
    if (document.querySelector('link[href="dashboard-ux.css"]')) return;
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "dashboard-ux.css"; document.head.append(link);
  }
  function ensureControls() {
    const tools = document.querySelector(".relationship-tools");
    if (tools && !document.querySelector("#relationship-advanced")) {
      tools.insertAdjacentHTML("beforeend", `<div id="relationship-advanced" class="advanced-filter-bar">
        <label><span>Estado actual</span><select id="relationship-state-filter"><option value="all">Todos</option><option value="mutual">Se siguen</option><option value="follows_you">Te sigue; no lo seguís</option><option value="you_follow">Lo seguís; no te sigue</option><option value="none">No se siguen</option></select></label>
        <label><span>Cambio</span><select id="relationship-change-filter"><option value="all">Todos</option><option value="changed">Solo cambiaron</option><option value="followed-you">Te sigue ahora</option><option value="unfollowed-you">Te dejó de seguir</option><option value="you-followed">Lo seguís ahora</option><option value="you-unfollowed">Lo dejaste de seguir</option></select></label>
        <label><span>Densidad</span><select id="relationship-density"><option value="compact">Compacta</option><option value="normal">Normal</option></select></label>
        <button id="clear-relationship-filters" class="button button-secondary" type="button">Limpiar filtros</button></div>
        <div id="relationship-active-filters" class="active-filter-chips"></div>
        <div class="relationship-list-actions"><div><strong id="relationship-visible-count">0 filas</strong><small>Tocá una fila para ver el detalle.</small></div><button id="export-comparison-list" class="button button-secondary" type="button">Descargar lista CSV</button></div>`);
      const toolbar = document.querySelector(".comparison-toolbar");
      toolbar && toolbar.insertAdjacentHTML("afterend", `<div class="comparison-presets"><span>Comparación rápida</span><button data-preset="previous">Último vs anterior</button><button data-preset="week">Hace 7 días vs ahora</button><button data-preset="first">Primer reporte vs ahora</button></div>`);
    }
    const peopleTools = document.querySelector("#people .people-tools");
    if (peopleTools && !document.querySelector("#people-table-options")) peopleTools.insertAdjacentHTML("afterend", `<div id="people-table-options" class="people-table-options"><label><span>Densidad</span><select id="people-density"><option value="compact">Compacta</option><option value="normal">Normal</option></select></label><button id="clear-people-filters" class="button button-secondary" type="button">Limpiar filtros</button></div><div id="people-active-filters" class="active-filter-chips"></div>`);
  }
  function chips() {
    const rel = document.querySelector("#relationship-active-filters"); if (rel) { const a = []; if (state.relationshipQuery.trim()) a.push(`Búsqueda: ${state.relationshipQuery.trim()}`); if (state.relationshipFilter !== "all") { const b = document.querySelector(`[data-relationship-filter="${state.relationshipFilter}"]`); if (b) a.push(`Filtro: ${b.childNodes[0].textContent.trim()}`); } if (ux.relState !== "all") a.push(`Estado: ${document.querySelector("#relationship-state-filter").selectedOptions[0].text}`); if (ux.relChange !== "all") a.push(`Cambio: ${document.querySelector("#relationship-change-filter").selectedOptions[0].text}`); rel.innerHTML = a.length ? a.map((x) => `<span>${escapeHtml(x)}</span>`).join("") : '<span class="filter-chip-empty">Sin filtros adicionales</span>'; }
    const ppl = document.querySelector("#people-active-filters"); if (ppl) { const a = []; if (state.query.trim()) a.push(`Búsqueda: ${state.query.trim()}`); if (state.filter !== "all") { const b = document.querySelector(`#people-filters [data-filter="${state.filter}"]`); if (b) a.push(`Filtro: ${b.textContent.trim()}`); } ppl.innerHTML = a.length ? a.map((x) => `<span>${escapeHtml(x)}</span>`).join("") : '<span class="filter-chip-empty">Sin filtros adicionales</span>'; }
  }

  function renderRelTable() {
    ensureControls(); chips();
    document.querySelector("#relationships")?.classList.toggle("density-compact", ux.relDensity === "compact");
    const target = document.querySelector("#relationship-list"); if (!target) return;
    const rows = relRows(); const count = document.querySelector("#relationship-visible-count"); if (count) count.textContent = `${formatNumber(rows.length)} fila${rows.length === 1 ? "" : "s"}`;
    const exp = document.querySelector("#export-comparison-list"); if (exp) exp.disabled = !rows.length;
    if (!rows.length) { target.innerHTML = '<div class="relationship-empty">No hay personas que coincidan con los filtros.</div>'; return; }
    target.innerHTML = `<div class="relationship-table-shell"><table class="relationship-table"><thead><tr>
      <th>${sortButton("Usuario", "username", ux.relSort)}</th><th>${sortButton("Antes · te seguía", "fromFollowsYou", ux.relSort)}</th><th>${sortButton("Antes · lo seguías", "fromYouFollow", ux.relSort)}</th><th>${sortButton("Ahora · te sigue", "toFollowsYou", ux.relSort)}</th><th>${sortButton("Ahora · lo seguís", "toYouFollow", ux.relSort)}</th><th>${sortButton("Qué cambió", "headline", ux.relSort)}</th><th>Perfil</th></tr></thead><tbody>${rows.map((x) => `<tr class="table-tone-${tone(x.tone)} clickable-table-row" data-user="${escapeHtml(x.normalized)}" data-source="comparison" tabindex="0"><th class="table-user-cell" data-label="Usuario"><div class="table-user-content"><span class="relationship-avatar">${escapeHtml(x.normalized.slice(0,2))}</span><span><strong>@${escapeHtml(x.username)}</strong><small>${escapeHtml(relationshipStateLabels.current[x.toState])}</small></span></div></th><td data-label="Antes · te seguía">${bool(x.fromFollowsYou,true)}</td><td data-label="Antes · lo seguías">${bool(x.fromYouFollow,true)}</td><td data-label="Ahora · te sigue">${bool(x.toFollowsYou)}</td><td data-label="Ahora · lo seguís">${bool(x.toYouFollow)}</td><td data-label="Qué cambió"><span class="table-result result-${tone(x.tone)}">${escapeHtml(x.headline)}</span></td><td data-label="Perfil"><a class="profile-link" href="https://www.instagram.com/${encodeURIComponent(x.normalized)}/" target="_blank" rel="noreferrer">Abrir</a></td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderPeopleTable() {
    ensureControls(); chips(); document.querySelector("#people")?.classList.toggle("density-compact", ux.peopleDensity === "compact");
    const rows = peopleRows(); document.querySelector("#people-count").textContent = `${formatNumber(rows.length)} persona${rows.length === 1 ? "" : "s"}`; const target = document.querySelector("#people-list"); if (!target) return;
    if (!rows.length) { target.innerHTML = '<div class="people-empty">No hay usuarios que coincidan con este filtro.</div>'; return; }
    target.innerHTML = `<div class="current-table-shell"><table class="current-table"><thead><tr><th>${sortButton("Usuario","username",ux.peopleSort)}</th><th>${sortButton("Te sigue","followsYou",ux.peopleSort)}</th><th>${sortButton("Lo seguís","youFollow",ux.peopleSort)}</th><th>${sortButton("Relación actual","relationship",ux.peopleSort)}</th><th>${sortButton("Cambios","changes",ux.peopleSort)}</th><th>${sortButton("Último cambio","lastEvent",ux.peopleSort)}</th><th>Perfil</th></tr></thead><tbody>${rows.map((p) => { const last=p.lastEvent, meta=last?(eventMeta[last.type]||{title:"cambio detectado"}):null; return `<tr class="clickable-table-row" data-user="${escapeHtml(p.username)}" data-source="current" tabindex="0"><th class="table-user-cell" data-label="Usuario"><div class="table-user-content"><span class="relationship-avatar">${escapeHtml(p.username.slice(0,2))}</span><span><strong>@${escapeHtml(p.username)}</strong><small>${p.events.length} cambio${p.events.length===1?"":"s"}</small></span></div></th><td data-label="Te sigue">${bool(p.followsYou)}</td><td data-label="Lo seguís">${bool(p.youFollow)}</td><td data-label="Relación actual"><span class="relationship-badge ${escapeHtml(p.relationship)}">${escapeHtml(relationshipLabel(p))}</span></td><td data-label="Cambios">${formatNumber(p.events.length)}</td><td data-label="Último cambio"><span class="last-event">${last?escapeHtml(meta.title):"Sin cambios detectados"}${last?`<small>${escapeHtml(formatDate(last.occurredAt))}</small>`:""}</span></td><td data-label="Perfil"><a class="profile-link" href="https://www.instagram.com/${encodeURIComponent(p.username)}/" target="_blank" rel="noreferrer">Abrir</a></td></tr>`; }).join("")}</tbody></table></div>`;
  }

  function csvCell(v) { let x=s(v); if (/^[=+\-@]/.test(x)) x=`'${x}`; return /[",\r\n]/.test(x) ? `"${x.replace(/"/g,'""')}"` : x; }
  function exportRows() { const rows=relRows(); if (!rows.length||!state.profile) return; const data=[["Usuario","Antes: te seguía","Antes: lo seguías","Ahora: te sigue","Ahora: lo seguís","Estado anterior","Estado actual","Qué cambió"],...rows.map((x)=>[x.username,x.fromFollowsYou?"Sí":"No",x.fromYouFollow?"Sí":"No",x.toFollowsYou?"Sí":"No",x.toYouFollow?"Sí":"No",relationshipStateLabels.previous[x.fromState],relationshipStateLabels.current[x.toState],x.headline])]; downloadText(`follow-tracker_lista_${state.profile}_${state.compareFrom}_a_${state.compareTo}.csv`,`\uFEFF${data.map(r=>r.map(csvCell).join(",")).join("\n")}`,"text/csv;charset=utf-8"); }
  function preset(kind) { const r=state.timeline?[...state.timeline.reports].sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt)):[]; if(r.length<2)return; const last=r.at(-1); let from=r.at(-2); if(kind==="first")from=r[0]; if(kind==="week"){const t=new Date(last.capturedAt).getTime()-604800000;from=r.slice(0,-1).reduce((best,x)=>Math.abs(new Date(x.capturedAt).getTime()-t)<Math.abs(new Date(best.capturedAt).getTime()-t)?x:best,r[0]);} state.compareFrom=from.id;state.compareTo=last.id;renderReportComparison(); }

  function drawer() { if(document.querySelector("#rel-drawer-overlay"))return; document.body.insertAdjacentHTML("beforeend",`<div id="rel-drawer-overlay" class="relationship-drawer-overlay" hidden><aside class="relationship-detail-drawer" role="dialog"><button id="drawer-close" class="drawer-close">×</button><p class="eyebrow">DETALLE DE RELACIÓN</p><h2 id="drawer-user"></h2><div id="drawer-status"></div><div id="drawer-history" class="drawer-history"></div><a id="drawer-link" class="button button-primary" target="_blank" rel="noreferrer">Ver perfil en Instagram</a></aside></div>`); }
  function closeDrawer(){const o=document.querySelector("#rel-drawer-overlay");if(o)o.hidden=true;document.body.classList.remove("drawer-open");}
  function openDrawer(user,source){drawer();const n=s(user).toLowerCase(),c=state.relationshipTransitions.find(x=>x.normalized===n),p=state.people.find(x=>x.username.toLowerCase()===n),o=document.querySelector("#rel-drawer-overlay");document.querySelector("#drawer-user").textContent=`@${c?c.username:p?p.username:n}`;document.querySelector("#drawer-link").href=`https://www.instagram.com/${encodeURIComponent(n)}/`;const st=document.querySelector("#drawer-status");if(c&&source==="comparison")st.innerHTML=`<div class="drawer-change result-${tone(c.tone)}">${escapeHtml(c.headline)}</div><div class="drawer-state-grid"><article><span>Antes</span><strong>${escapeHtml(relationshipStateLabels.previous[c.fromState])}</strong><small>Te seguía: ${c.fromFollowsYou?"Sí":"No"} · Lo seguías: ${c.fromYouFollow?"Sí":"No"}</small></article><article><span>Ahora</span><strong>${escapeHtml(relationshipStateLabels.current[c.toState])}</strong><small>Te sigue: ${c.toFollowsYou?"Sí":"No"} · Lo seguís: ${c.toYouFollow?"Sí":"No"}</small></article></div>`;else if(p)st.innerHTML=`<div class="drawer-state-grid single"><article><span>Estado actual</span><strong>${escapeHtml(relationshipLabel(p))}</strong><small>Te sigue: ${p.followsYou?"Sí":"No"} · Lo seguís: ${p.youFollow?"Sí":"No"}</small></article></div>`;const ev=p?p.events:[];document.querySelector("#drawer-history").innerHTML=`<h3>Historial</h3>${ev.length?ev.map(e=>`<article class="drawer-event"><strong>${escapeHtml(eventLabel(e.type))}</strong><small>${escapeHtml(formatDate(e.occurredAt))} · reporte ${escapeHtml(e.reportId||"sin id")}</small></article>`).join(""):'<p>No hay cambios históricos guardados.</p>'}`;o.hidden=false;document.body.classList.add("drawer-open");}

  injectCss(); ensureControls(); drawer(); renderRelationshipList=renderRelTable; renderPeople=renderPeopleTable;
  if(!location.hash){state.view="relationships";activateView("relationships",false);}
  const oldCompare=renderReportComparison; renderReportComparison=function(){oldCompare();renderRelTable();};

  document.addEventListener("click",(e)=>{const t=e.target;
    const b=t.closest("#export-comparison-list"); if(b){exportRows();return;}
    const p=t.closest("[data-preset]"); if(p){preset(p.dataset.preset);return;}
    if(t.closest("#clear-relationship-filters")){state.relationshipQuery="";state.relationshipFilter="all";ux.relState="all";ux.relChange="all";document.querySelector("#relationship-search").value="";document.querySelector("#relationship-state-filter").value="all";document.querySelector("#relationship-change-filter").value="all";document.querySelectorAll("[data-relationship-filter]").forEach(x=>x.classList.toggle("active",x.dataset.relationshipFilter==="all"));renderRelTable();return;}
    if(t.closest("#clear-people-filters")){state.query="";state.filter="all";document.querySelector("#people-search").value="";document.querySelectorAll("#people-filters .filter").forEach(x=>x.classList.toggle("active",x.dataset.filter==="all"));renderPeopleTable();return;}
    const rs=t.closest(".relationship-table .table-sort");if(rs){toggleSort(ux.relSort,rs.dataset.sortKey);renderRelTable();return;} const ps=t.closest(".current-table .table-sort");if(ps){toggleSort(ux.peopleSort,ps.dataset.sortKey);renderPeopleTable();return;}
    const row=t.closest(".clickable-table-row");if(row&&!t.closest("a,button,input,select")){openDrawer(row.dataset.user,row.dataset.source);return;} if(t.closest("#drawer-close")||t.id==="rel-drawer-overlay")closeDrawer();
  });
  document.addEventListener("change",(e)=>{if(e.target.id==="relationship-state-filter"){ux.relState=e.target.value;renderRelTable();}else if(e.target.id==="relationship-change-filter"){ux.relChange=e.target.value;renderRelTable();}else if(e.target.id==="relationship-density"){ux.relDensity=e.target.value;renderRelTable();}else if(e.target.id==="people-density"){ux.peopleDensity=e.target.value;renderPeopleTable();}});
  document.addEventListener("keydown",(e)=>{if(e.key==="Escape")closeDrawer();const r=e.target.closest?.(".clickable-table-row");if(r&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openDrawer(r.dataset.user,r.dataset.source);}});
  document.addEventListener("input",(e)=>{if(["relationship-search","people-search"].includes(e.target.id))queueMicrotask(chips);});
  setTimeout(()=>{ensureControls();if(!location.hash)activateView("relationships",false);if(state.relationshipTransitions.length)renderRelTable();if(state.people.length)renderPeopleTable();},0);
})();
