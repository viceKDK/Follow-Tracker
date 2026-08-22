"use strict";

(function loadDashboardUx() {
  const script = document.createElement("script");
  script.src = "dashboard-ux.js";
  script.defer = false;
  document.head.append(script);
})();
