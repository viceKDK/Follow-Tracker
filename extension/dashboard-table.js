"use strict";

(function loadDashboardEnhancements() {
  const versioned = (file, version) => `${file}?v=${version}`;
  const files = [
    "history-guard.js",
    "history-quality.js",
    "trust-core.js",
    "trust-domain-adapter.js",
    "capture-store.js",
    "product-core.js",
    "maintenance.js",
    versioned("dashboard-ux.js", "4.5.0"),
    versioned("dashboard-product.js", "4.6.0"),
    "dashboard-maintenance.js",
    "dashboard-backup.js",
    "dashboard-identity.js",
    "admin-core.js",
    versioned("dashboard-admin.js", "4.0.0"),
    "dashboard-integrity.js",
    "dashboard-guidance.js",
    versioned("dashboard-polish.js", "4.5.0"),
  ];

  function loadAt(index) {
    if (index >= files.length) return;
    const script = document.createElement("script");
    script.src = files[index];
    script.async = false;
    script.addEventListener("load", () => loadAt(index + 1), { once: true });
    script.addEventListener("error", () => {
      console.error(`No se pudo cargar ${files[index]}`);
    }, { once: true });
    document.head.append(script);
  }

  loadAt(0);
})();
