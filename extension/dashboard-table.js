"use strict";

(function loadDashboardEnhancements() {
  const files = [
    "trust-core.js",
    "capture-store.js",
    "product-core.js",
    "maintenance.js",
    "dashboard-ux.js",
    "dashboard-product.js",
    "dashboard-maintenance.js",
    "dashboard-backup.js",
    "dashboard-identity.js",
    "dashboard-admin.js",
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
