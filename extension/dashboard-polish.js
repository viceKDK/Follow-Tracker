"use strict";

(function () {
  const VIEW_META = {
    overview: {
      label: "Resumen",
      kicker: "Panel de control",
      description: "Tu panorama actual y la evolución del perfil.",
      icon: "dashboard",
    },
    relationships: {
      label: "Antes y ahora",
      kicker: "Comparación",
      description: "Revisá qué cambió entre dos reportes.",
      icon: "compare",
    },
    people: {
      label: "Personas",
      kicker: "Relaciones",
      description: "Explorá el estado y el historial de cada cuenta.",
      icon: "users",
    },
    activity: {
      label: "Actividad",
      kicker: "Historial",
      description: "Consultá todos los movimientos detectados.",
      icon: "activity",
    },
    admin: {
      label: "Administrar",
      kicker: "Centro de gestión",
      description: "Importá, organizá y protegé tus datos locales.",
      icon: "settings",
    },
  };

  const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h12"/><path d="m16 4 3 3-3 3"/><path d="M17 17H5"/><path d="m8 20-3-3 3-3"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    arrowUpRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',
    identity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    followers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2"/><path d="M19 8v6M16 11h6"/></svg>',
    following: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2"/><path d="m17 11 2 2 4-4"/></svg>',
    mutual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10l-2-2"/><path d="m17 17H7l2 2"/><path d="m17 7 2 2-2 2"/><path d="m7 17-2-2 2-2"/></svg>',
    inbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H5"/><path d="m10 7-5 5 5 5"/></svg>',
    outbound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/></svg>',
    lost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2"/><path d="M17 11h6"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 9h10M7 13h6"/><path d="m16 16 2 2 3-3"/></svg>',
  };

  const ADMIN_SECTIONS = [
    {
      match: "Crear un reporte",
      id: "admin-import",
      label: "Importación",
      description: "Archivos oficiales",
      icon: "upload",
      tone: "violet",
    },
    {
      match: "Espacio de trabajo",
      id: "admin-profiles",
      label: "Perfiles",
      description: "Organizar historiales",
      icon: "folder",
      tone: "blue",
    },
    {
      match: "Historial del perfil",
      id: "admin-reports",
      label: "Reportes",
      description: "Editar y reconstruir",
      icon: "reports",
      tone: "teal",
    },
    {
      match: "Unir cuentas",
      id: "admin-identities",
      label: "Identidades",
      description: "Cambios de username",
      icon: "identity",
      tone: "amber",
    },
    {
      match: "Reglas de captura",
      id: "admin-trust",
      label: "Confiabilidad",
      description: "Validación de datos",
      icon: "shield",
      tone: "green",
    },
    {
      match: "Acciones sensibles",
      id: "admin-security",
      label: "Seguridad",
      description: "Acciones sensibles",
      icon: "shield",
      tone: "amber",
    },
  ];

  let adminSectionObserver = null;
  let enhancementFrame = 0;

  function icon(name) {
    return ICONS[name] || ICONS.dashboard;
  }

  const STATUS_ASSETS = {
    followers: "icons/metric-followers-v2.png",
    following: "icons/metric-following-v2.png",
    mutual: "icons/metric-mutual-v2.png",
    inbound: "icons/metric-followers-only-v4.png",
    outbound: "icons/metric-following-only-v4.png",
    lost: "icons/metric-unfollowed-v4.png",
  };

  function setText(target, value) {
    if (target && target.textContent !== value) target.textContent = value;
  }

  function injectStyles() {
    if (document.querySelector('link[data-follow-tracker-polish="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "dashboard-polish.css?v=4.5.0";
    link.dataset.followTrackerPolish = "true";
    document.head.append(link);
  }

  function ensureSkipLink() {
    if (document.querySelector(".skip-to-content")) return;
    const link = document.createElement("a");
    link.className = "skip-to-content";
    link.href = "#dashboard-content";
    link.textContent = "Saltar al contenido";
    document.body.prepend(link);
  }

  function enhanceBrand() {
    const brand = document.querySelector(".brand");
    const mark = document.querySelector(".brand-mark");
    if (!brand || !mark || brand.dataset.polished === "true") return;
    brand.dataset.polished = "true";
    mark.setAttribute("aria-hidden", "true");
    brand.insertAdjacentHTML(
      "beforeend",
      '<span class="brand-edition"><i></i>Panel local</span>'
    );
  }

  function enhanceNavigation() {
    const sidebar = document.querySelector(".sidebar");
    const nav = document.querySelector(".main-nav");
    if (!sidebar || !nav) return;

    sidebar.id ||= "app-sidebar";
    if (!document.querySelector(".sidebar-nav-label")) {
      nav.insertAdjacentHTML("beforebegin", '<p class="sidebar-nav-label">Navegación</p>');
    }

    nav.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      const view = button.dataset.view;
      const meta = VIEW_META[view] || {
        label: button.textContent.replace(/^[^\p{L}\p{N}]+/u, "").trim(),
        icon: "dashboard",
      };
      if (button.dataset.polished !== "true") {
        button.dataset.polished = "true";
        button.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon(meta.icon)}</span><span class="nav-label">${meta.label}</span>`;
        button.title = meta.label;
      }
    });

  }

  function currentView() {
    const active = document.querySelector(".nav-item.active[data-view]");
    return active?.dataset.view || location.hash.replace(/^#/, "") || "overview";
  }

  function ensureTopbar() {
    const topbar = document.querySelector(".topbar");
    const profileControl = topbar?.querySelector(".profile-control");
    if (!topbar || !profileControl) return;

    let leading = topbar.querySelector(".topbar-leading");
    if (!leading) {
      leading = document.createElement("div");
      leading.className = "topbar-leading";
      topbar.insertBefore(leading, profileControl);

      const toggle = document.createElement("button");
      toggle.id = "sidebar-toggle";
      toggle.className = "sidebar-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-controls", "app-sidebar");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir navegación");
      toggle.innerHTML = `${icon("menu")}<span class="sr-only">Abrir navegación</span>`;

      const context = document.createElement("div");
      context.className = "view-context";
      context.innerHTML = '<small id="view-context-kicker">Panel de control</small><strong id="view-context-title">Resumen</strong><span id="view-context-description">Tu panorama actual.</span>';

      leading.append(toggle, context, profileControl);
    }

    updateViewContext();
  }

  function updateViewContext(view = currentView()) {
    const meta = VIEW_META[view] || VIEW_META.overview;
    setText(document.querySelector("#view-context-kicker"), meta.kicker);
    setText(document.querySelector("#view-context-title"), meta.label);
    setText(document.querySelector("#view-context-description"), meta.description);
    document.body.dataset.currentView = view;
  }

  function ensureMobileNavigation() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar || document.querySelector("#sidebar-backdrop")) return;
    const backdrop = document.createElement("button");
    backdrop.id = "sidebar-backdrop";
    backdrop.className = "sidebar-backdrop";
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Cerrar navegación");
    document.body.append(backdrop);
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle("sidebar-open", open);
    const toggle = document.querySelector("#sidebar-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar navegación" : "Abrir navegación");
    }
  }

  function decoratePrimaryActions() {
    const actions = [
      ["#analyze-profile", "arrowUpRight"],
      ["#export-toggle", "download"],
    ];
    actions.forEach(([selector, iconName]) => {
      const button = document.querySelector(selector);
      if (!button || button.dataset.iconified === "true") return;
      button.dataset.iconified = "true";
      button.insertAdjacentHTML("afterbegin", `<span class="button-icon" aria-hidden="true">${icon(iconName)}</span>`);
    });

    const emptyVisual = document.querySelector(".empty-visual");
    if (emptyVisual && emptyVisual.dataset.polished !== "true") {
      emptyVisual.dataset.polished = "true";
      emptyVisual.innerHTML = icon("empty");
    }
  }

  function decorateKpis() {
    const cards = [
      [".kpi-blue", "followers"],
      [".kpi-cyan", "following"],
      [".kpi-green", "mutual"],
      [".kpi-amber", "inbound"],
      [".kpi-orange", "outbound"],
      [".kpi-red", "lost"],
    ];
    cards.forEach(([selector, iconName]) => {
      const target = document.querySelector(`${selector} .kpi-icon`);
      if (!target || target.dataset.polished === "true") return;
      target.dataset.polished = "true";
      target.innerHTML = `<img src="${STATUS_ASSETS[iconName]}" alt="" />`;
    });
  }

  function definitionForSection(section, index) {
    const heading = section.querySelector("h2")?.textContent || "";
    return ADMIN_SECTIONS.find((item) => heading.includes(item.match)) || {
      id: `admin-tool-${index + 1}`,
      label: heading || `Herramienta ${index + 1}`,
      description: "Gestión local",
      icon: "settings",
      tone: "blue",
    };
  }

  function buildAdminSummary(admin) {
    if (admin.querySelector("#admin-summary")) return;
    const hero = admin.querySelector(".section-hero");
    if (!hero) return;
    hero.insertAdjacentHTML(
      "afterend",
      `<section id="admin-summary" class="admin-summary" aria-label="Resumen de administración">
        <article><span class="admin-summary-icon">${icon("folder")}</span><div><small>Perfiles guardados</small><strong data-admin-stat="profiles">—</strong></div></article>
        <article><span class="admin-summary-icon">${icon("reports")}</span><div><small>Reportes del perfil</small><strong data-admin-stat="reports">—</strong></div></article>
        <article><span class="admin-summary-icon">${icon("settings")}</span><div><small>Herramientas disponibles</small><strong data-admin-stat="tools">5</strong></div></article>
        <article><span class="admin-summary-icon">${icon("shield")}</span><div><small>Almacenamiento</small><strong>Local</strong></div></article>
      </section>`
    );
  }

  function buildAdminQuickNav(admin, sections) {
    if (admin.querySelector("#admin-quick-nav") || !sections.length) return;
    const anchor = admin.querySelector("#admin-summary") || admin.querySelector(".section-hero");
    if (!anchor) return;
    const items = sections.map(({ definition }) => `
      <button type="button" role="tab" aria-selected="false" data-admin-target="${definition.id}">
        <span class="admin-nav-icon" aria-hidden="true">${icon(definition.icon)}</span>
        <span><strong>${definition.label}</strong><small>${definition.description}</small></span>
      </button>`).join("");
    anchor.insertAdjacentHTML(
      "afterend",
      `<nav id="admin-quick-nav" class="admin-quick-nav" role="tablist" aria-label="Herramientas de administración">${items}</nav>`
    );
  }

  function decorateAdminSection(section, definition) {
    section.id = definition.id;
    section.dataset.adminTone = definition.tone;
    const heading = section.querySelector(".admin-heading");
    if (!heading) return;

    if (!heading.querySelector(".admin-section-icon")) {
      heading.insertAdjacentHTML("afterbegin", `<span class="admin-section-icon" aria-hidden="true">${icon(definition.icon)}</span>`);
    }

    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-label", definition.label);
  }

  function prepareAdminDanger(admin) {
    if (admin.querySelector("#admin-security")) return;
    const danger = document.querySelector("#overview > .danger-zone");
    const layout = admin.querySelector(".admin-layout");
    if (!danger || !layout) return;
    const section = document.createElement("article");
    section.className = "panel admin-section admin-danger-section";
    section.innerHTML = '<div class="admin-heading"><div><p class="panel-kicker">SEGURIDAD</p><h2>Acciones sensibles</h2><p>Estas acciones modifican o eliminan datos locales y siempre requieren confirmación.</p></div></div>';
    section.append(danger);
    layout.insertBefore(section, layout.querySelector("#admin-status"));
  }

  function setAdminPanel(admin, targetId) {
    const sections = [...admin.querySelectorAll(".admin-layout > .admin-section")];
    const selected = sections.some((section) => section.id === targetId) ? targetId : sections[0]?.id;
    sections.forEach((section) => {
      const active = section.id === selected;
      section.classList.toggle("admin-panel-active", active);
      section.hidden = !active;
    });
    admin.querySelectorAll("[data-admin-target]").forEach((button) => {
      const active = button.dataset.adminTarget === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    admin.dataset.activePanel = selected || "";
  }

  function updateAdminSummary(admin, sections) {
    setText(admin.querySelector('[data-admin-stat="profiles"]'), String(admin.querySelectorAll(".profile-manager-card").length));
    setText(admin.querySelector('[data-admin-stat="reports"]'), String(admin.querySelectorAll("#report-manager-content tbody tr").length));
    setText(admin.querySelector('[data-admin-stat="tools"]'), String(sections.length));
  }

  function observeAdminSections(sections) {
    if (!("IntersectionObserver" in window)) return;
    adminSectionObserver?.disconnect();
    adminSectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        document.querySelectorAll("[data-admin-target]").forEach((button) => {
          button.classList.toggle("active", button.dataset.adminTarget === visible.target.id);
        });
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0.05, 0.2, 0.5] }
    );
    sections.forEach(({ section }) => adminSectionObserver.observe(section));
  }

  function enhanceAdmin() {
    const admin = document.querySelector("#admin");
    if (!admin) return;
    admin.classList.add("admin-polished");
    prepareAdminDanger(admin);

    const sections = [...admin.querySelectorAll(".admin-layout > .admin-section")].map((section, index) => {
      const definition = definitionForSection(section, index);
      decorateAdminSection(section, definition);
      return { section, definition };
    });

    buildAdminQuickNav(admin, sections);
    setAdminPanel(admin, admin.dataset.activePanel || "admin-profiles");
  }

  function hasProfiles() {
    try {
      return typeof state !== "undefined" && Array.isArray(state.profiles) && state.profiles.length > 0;
    } catch (_error) {
      return false;
    }
  }

  function syncEmptyStateForView(view = currentView()) {
    const dashboard = document.querySelector("#dashboard-content");
    const empty = document.querySelector("#empty-state");
    if (!dashboard || !empty) return;
    if (view === "admin" && document.querySelector("#admin")) {
      dashboard.hidden = false;
      empty.hidden = true;
    } else if (!hasProfiles()) {
      dashboard.hidden = true;
      empty.hidden = false;
    }
  }

  function enhanceAll() {
    document.body.classList.add("dashboard-polished");
    injectStyles();
    ensureSkipLink();
    enhanceBrand();
    enhanceNavigation();
    ensureTopbar();
    ensureMobileNavigation();
    decoratePrimaryActions();
    decorateKpis();
    enhanceAdmin();
    updateViewContext();
    syncEmptyStateForView();
  }

  function scheduleEnhancement() {
    if (enhancementFrame) return;
    enhancementFrame = requestAnimationFrame(() => {
      enhancementFrame = 0;
      enhanceAll();
    });
  }

  injectStyles();
  enhanceAll();

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest("#sidebar-toggle")) {
      setSidebarOpen(!document.body.classList.contains("sidebar-open"));
      return;
    }
    if (event.target.closest("#sidebar-backdrop")) {
      setSidebarOpen(false);
      return;
    }

    const navItem = event.target.closest(".nav-item[data-view]");
    if (navItem) {
      const view = navItem.dataset.view;
      updateViewContext(view);
      syncEmptyStateForView(view);
      if (matchMedia("(max-width: 1024px)").matches) setSidebarOpen(false);
    }

    const adminTarget = event.target.closest("[data-admin-target]");
    if (adminTarget) {
      const admin = adminTarget.closest("#admin");
      if (admin) setAdminPanel(admin, adminTarget.dataset.adminTarget);
      return;
    }

    const collapse = event.target.closest(".admin-collapse");
    if (collapse) {
      const section = collapse.closest(".admin-section");
      if (!section) return;
      const collapsed = section.classList.toggle("is-collapsed");
      collapse.setAttribute("aria-expanded", String(!collapsed));
      const label = section.querySelector("h2")?.textContent || "sección";
      collapse.setAttribute("aria-label", `${collapsed ? "Expandir" : "Contraer"} ${label}`);
    }
  });

  window.addEventListener("hashchange", () => {
    const view = currentView();
    updateViewContext(view);
    syncEmptyStateForView(view);
  });

  window.addEventListener("resize", () => {
    if (!matchMedia("(max-width: 1024px)").matches) setSidebarOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("sidebar-open")) {
      setSidebarOpen(false);
    }
  });

  globalThis.FollowTrackerDashboardPolish = {
    enhanceAll,
    setSidebarOpen,
    updateViewContext,
  };
})();
