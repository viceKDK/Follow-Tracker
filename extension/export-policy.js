(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerExportPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NOTICE_WINDOW_MS = 5000;
  let lastSuppressionNoticeAt = 0;

  function isAutomaticCaptureExport(filename) {
    const name = String(filename || "").trim();
    return /^ig_auto_.+\.(?:csv|xls|xlsx)$/i.test(name);
  }

  function shouldSuppressDownload(filename) {
    const name = String(filename || "").trim();
    if (!name) return false;
    if (isAutomaticCaptureExport(name)) return true;
    return /\.(?:xls|xlsx)$/i.test(name);
  }

  function currentProfile() {
    const parts = String(location.pathname || "").split("/").filter(Boolean);
    return parts.length && /^[a-zA-Z0-9._]+$/.test(parts[0]) ? parts[0].toLowerCase() : "";
  }

  function openDashboard() {
    try {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", profile: currentProfile() });
    } catch (_error) {}
  }

  function notifySuppressed(filename) {
    const now = Date.now();
    if (now - lastSuppressionNoticeAt < NOTICE_WINDOW_MS) return;
    lastSuppressionNoticeAt = now;
    try {
      chrome.runtime.sendMessage({
        source: "content",
        type: "legacy-report-suppressed",
        filename: String(filename || ""),
        profile: currentProfile(),
      });
    } catch (_error) {}
  }

  function rewriteLegacyDownloadMessages() {
    document.querySelectorAll("#ft-auto-overlay .ft-log-line").forEach((line) => {
      if (/^Descargado:/i.test(String(line.textContent || "").trim())) {
        line.textContent = "Guardado localmente. Exportá desde el dashboard cuando lo necesites.";
      }
    });
  }

  function enhanceOverlay() {
    const button = document.querySelector("#ft-export-history");
    if (button && button.dataset.ftDashboardButton !== "true") {
      const replacement = button.cloneNode(true);
      replacement.id = "ft-export-history";
      replacement.dataset.ftDashboardButton = "true";
      replacement.textContent = "Abrir dashboard";
      replacement.title = "Ver historial, fechas, personas y exportaciones manuales";
      button.replaceWith(replacement);
      replacement.addEventListener("click", openDashboard);
    }
    rewriteLegacyDownloadMessages();
  }

  function installBrowserPolicy() {
    if (typeof HTMLAnchorElement !== "undefined" && !globalThis.__followTrackerDownloadPolicyInstalled) {
      globalThis.__followTrackerDownloadPolicyInstalled = true;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function followTrackerControlledDownload() {
        if (shouldSuppressDownload(this.download)) {
          notifySuppressed(this.download);
          return undefined;
        }
        return originalClick.apply(this, arguments);
      };
    }

    if (typeof document !== "undefined" && !globalThis.__followTrackerOverlayEnhancerInstalled) {
      globalThis.__followTrackerOverlayEnhancerInstalled = true;
      enhanceOverlay();
      const observer = new MutationObserver(enhanceOverlay);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  installBrowserPolicy();

  return { isAutomaticCaptureExport, shouldSuppressDownload };
});
