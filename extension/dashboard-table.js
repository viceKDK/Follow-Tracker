"use strict";

(function loadDashboardEnhancements() {
  const files = ["product-core.js", "dashboard-ux.js", "dashboard-product.js"];

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
