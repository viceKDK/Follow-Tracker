(function () {
  const CONFIG = {
    maxUsers: 10000,
    minWaitMs: 1800,
    maxWaitMs: 4200,
    stagnantAttempts: 14,
    phaseDelayMs: 1200,
  };

  const PHASES = [
    { key: "followers", hrefKey: "/followers/", labels: ["followers", "seguidores"] },
    { key: "following", hrefKey: "/following/", labels: ["following", "seguidos"] },
  ];

  let running = false;
  let overlay = null;
  const overlayLogs = [];

  function ensureOverlay() {
    if (overlay && document.body.contains(overlay)) return overlay;
    const old = document.getElementById("ft-auto-overlay");
    if (old) old.remove();
    overlay = document.createElement("div");
    overlay.id = "ft-auto-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "top:20px",
      "right:20px",
      "z-index:2147483647",
      "width:320px",
      "background:rgba(10,18,28,.92)",
      "color:#d9f2ff",
      "border:2px solid #1fa37d",
      "border-radius:12px",
      "padding:10px",
      "font-family:Segoe UI,Arial,sans-serif",
      "box-shadow:0 10px 24px rgba(0,0,0,.35)",
    ].join(";");
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="font-size:14px;font-weight:700;color:#7de8c6;">Follow Tracker Auto</div>
        <button id="ft-close" style="border:none;background:#ef4444;color:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px;">X</button>
      </div>
      <div style="font-size:12px;margin-bottom:4px;">Perfil: <span id="ft-profile">-</span></div>
      <div style="font-size:12px;margin-bottom:4px;">Fase: <span id="ft-phase">-</span></div>
      <div style="font-size:12px;margin-bottom:4px;">Usuarios: <span id="ft-count">0</span></div>
      <div id="ft-status" style="font-size:12px;color:#a2f3a6;">Iniciando...</div>
      <div id="ft-log" style="margin-top:8px;max-height:120px;overflow:auto;background:rgba(255,255,255,.05);padding:6px;border-radius:8px;font-size:11px;line-height:1.35;"></div>
    `;
    overlay.querySelector("#ft-close").addEventListener("click", () => {
      overlay.remove();
      overlay = null;
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function setOverlay(profile, phase, count, status, color) {
    const box = ensureOverlay();
    box.querySelector("#ft-profile").textContent = profile || "-";
    box.querySelector("#ft-phase").textContent = phase || "-";
    box.querySelector("#ft-count").textContent = String(count ?? 0);
    const st = box.querySelector("#ft-status");
    st.textContent = status || "";
    if (color) st.style.color = color;
  }

  function appendOverlayLog(text) {
    const msg = String(text || "");
    overlayLogs.push(msg);
    if (overlayLogs.length > 16) overlayLogs.shift();
    const box = ensureOverlay();
    const log = box.querySelector("#ft-log");
    log.textContent = overlayLogs.join("\n");
    log.scrollTop = log.scrollHeight;
  }

  function sendProgress(text) {
    chrome.runtime.sendMessage({ source: "content", type: "progress", text });
    appendOverlayLog(text);
  }

  function sendDone() {
    chrome.runtime.sendMessage({ source: "content", type: "done" });
  }

  function sendError(text) {
    chrome.runtime.sendMessage({ source: "content", type: "error", text });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomSleep() {
    const ms = Math.floor(Math.random() * (CONFIG.maxWaitMs - CONFIG.minWaitMs + 1)) + CONFIG.minWaitMs;
    return sleep(ms);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function nowCompact() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function toSafeFilePart(text) {
    return String(text || "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  function escapeCsvValue(value) {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getProfileFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] || "perfil";
  }

  function onProfilePage() {
    if (!window.location.hostname.includes("instagram.com")) return false;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return false;
    const blocked = new Set(["explore", "accounts", "reels", "direct", "stories"]);
    return !blocked.has(parts[0]);
  }

  function findPhaseTrigger(phase) {
    const profile = getProfileFromPath();
    const strictHrefA = document.querySelector(`a[href='/${profile}/${phase.key}/']`);
    if (strictHrefA) return strictHrefA;
    const strictHrefB = document.querySelector(`a[href^='/${profile}/${phase.key}/?']`);
    if (strictHrefB) return strictHrefB;

    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const byHref = anchors.find((a) => (a.getAttribute("href") || "").includes(phase.hrefKey));
    if (byHref) return byHref;

    const clickable = Array.from(document.querySelectorAll("a, button"));
    return clickable.find((el) => {
      const txt = (el.textContent || "").toLowerCase().trim();
      return phase.labels.some((label) => txt.includes(label));
    });
  }

  async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await sleep(150);
    }
    return false;
  }

  function parseCountFromText(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/\./g, "").replace(/,/g, "");
    const match = cleaned.match(/(\d{1,9})/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }

  function getExpectedCountFromTrigger(trigger) {
    if (!trigger) return null;
    const ownText = parseCountFromText(trigger.textContent || "");
    if (ownText) return ownText;
    const row = trigger.closest("li, section, div, header");
    if (row) {
      const rowText = parseCountFromText(row.textContent || "");
      if (rowText) return rowText;
    }
    return null;
  }

  async function openDialogForPhase(phase) {
    const trigger = findPhaseTrigger(phase);
    if (!trigger) throw new Error(`No se encontro acceso a ${phase.key}.`);
    const expectedCount = getExpectedCountFromTrigger(trigger);
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    const ok = await waitFor(() => !!document.querySelector('div[role="dialog"]'), 9000);
    if (!ok) throw new Error(`No se abrio el dialogo de ${phase.key}.`);
    // Si abre otro dialogo distinto, intentamos clickear el contenedor padre del trigger.
    const hasAnyListAnchor = !!document.querySelector(
      'div[role="dialog"] a[href^="/"], div[role="dialog"] a[href*="instagram.com/"]'
    );
    if (!hasAnyListAnchor && trigger.parentElement) {
      trigger.parentElement.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await waitFor(
        () =>
          !!document.querySelector(
            'div[role="dialog"] a[href^="/"], div[role="dialog"] a[href*="instagram.com/"]'
          ),
        5000
      );
    }
    return { expectedCount };
  }

  async function closeDialog() {
    const closeBtn =
      document.querySelector('div[role="dialog"] button[aria-label="Cerrar"]') ||
      document.querySelector('div[role="dialog"] button[aria-label="Close"]') ||
      document.querySelector('div[role="dialog"] svg[aria-label="Cerrar"]') ||
      document.querySelector('div[role="dialog"] svg[aria-label="Close"]');
    if (closeBtn) {
      closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await waitFor(() => !document.querySelector('div[role="dialog"]'), 3000);
      return;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitFor(() => !document.querySelector('div[role="dialog"]'), 3000);
  }

  function isLikelyScrollable(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const hasOverflow = style.overflowY === "auto" || style.overflowY === "scroll";
    const hasSize = el.scrollHeight > el.clientHeight + 20;
    return hasOverflow || hasSize;
  }

  function scoreContainer(el) {
    if (!el) return -1;
    const userLinks = el.querySelectorAll('a[href^="/"]').length;
    const heightScore = Math.min(el.scrollHeight, 30000) / 1000;
    const overflowBonus = isLikelyScrollable(el) ? 10 : 0;
    return userLinks * 5 + heightScore + overflowBonus;
  }

  function canScrollElement(el) {
    if (!el) return false;
    const before = el.scrollTop;
    el.scrollTop = before + 250;
    const changed = el.scrollTop !== before;
    el.scrollTop = before;
    return changed;
  }

  function findScrollableContainer() {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) throw new Error("No hay dialogo abierto.");

    const selectors = [
      'div[role="dialog"] ._aano',
      'div[role="dialog"] div[style*="overflow"]',
      'div[role="dialog"] div[class*="scroll"]',
      'div[role="dialog"] [role="dialog"]',
      'div[role="dialog"] > div > div',
    ];

    const seen = new Set();
    const candidates = [];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (seen.has(el)) continue;
        seen.add(el);
        candidates.push(el);
      }
    }

    for (const el of dialog.querySelectorAll("div")) {
      if (seen.has(el)) continue;
      if (!isLikelyScrollable(el)) continue;
      seen.add(el);
      candidates.push(el);
    }

    if (candidates.length === 0) {
      throw new Error("No se encontraron candidatos de scroll.");
    }

    candidates.sort((a, b) => scoreContainer(b) - scoreContainer(a));

    for (const el of candidates) {
      if (canScrollElement(el)) {
        return el;
      }
    }

    return candidates[0];
  }

  function extractUsers(container, map) {
    const dialog = document.querySelector('div[role="dialog"]') || container;
    const links = dialog.querySelectorAll("a[href]");
    let added = 0;
    links.forEach((el) => {
      const href = el.getAttribute("href") || "";
      if (!href) return;
      const lower = href.toLowerCase();
      if (
        lower.includes("/p/") ||
        lower.includes("/reel/") ||
        lower.includes("/stories/") ||
        lower.includes("/explore/") ||
        lower.includes("/accounts/")
      ) {
        return;
      }

      let path = href;
      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          path = new URL(href).pathname;
        } catch (_e) {
          return;
        }
      }
      if (!path.startsWith("/")) return;
      const username = path.split("/").filter(Boolean)[0] || "";
      if (!username || !/^[a-zA-Z0-9._]+$/.test(username)) return;
      if (map.has(username)) return;

      let fullName = "Sin Nombre";
      const text = (el.innerText || "").trim();
      if (text && text.toLowerCase() !== username.toLowerCase()) {
        fullName = text.split("\n")[0].replace(/,/g, " ");
      }
      map.set(username, { username, fullName });
      added += 1;
    });
    return added;
  }

  async function scrapeCurrentDialog(phase, profile, expectedCount) {
    const data = new Map();
    const container = findScrollableContainer();
    let stagnant = 0;
    let prevCount = 0;
    let recoveries = 0;

    // Toma inicial de elementos visibles antes de empezar a mover.
    extractUsers(container, data);
    const initialAnchors = (document.querySelector('div[role="dialog"]') || container).querySelectorAll("a[href]").length;
    setOverlay(profile, phase.key, data.size, "Recolectando...", "#a2f3a6");
    sendProgress(
      `${phase.key}: ${data.size} usuarios (inicio, anchors=${initialAnchors}, esperado=${expectedCount || "?"})`
    );

    while (data.size < CONFIG.maxUsers) {
      const startTop = container.scrollTop;
      const jump = Math.max(700, Math.floor(container.clientHeight * 0.8));
      container.scrollTop = Math.min(container.scrollTop + jump, container.scrollHeight);
      container.scrollBy(0, jump);
      container.dispatchEvent(new WheelEvent("wheel", { deltaY: jump, bubbles: true }));
      if (container.scrollTop === startTop) {
        container.scrollTop = startTop + jump;
      }
      await randomSleep();

      const added = extractUsers(container, data);
      setOverlay(profile, phase.key, data.size, `En curso (+${added})`, "#a2f3a6");
      sendProgress(`${phase.key}: ${data.size} usuarios (+${added})`);

      const countUnchanged = data.size === prevCount;
      if (added === 0 && countUnchanged) {
        stagnant += 1;
        if (stagnant >= CONFIG.stagnantAttempts) {
          const hasExpected = Number.isFinite(expectedCount) && expectedCount > 0;
          const clearlyIncomplete = hasExpected && data.size < Math.floor(expectedCount * 0.95);
          if (clearlyIncomplete && recoveries < 4) {
            recoveries += 1;
            sendProgress(
              `${phase.key}: atascado en ${data.size}/${expectedCount}, intento recuperacion ${recoveries}/4`
            );
            // Recuperacion: subir bastante, esperar, bajar al fondo y esperar carga.
            container.scrollTop = Math.max(0, container.scrollTop - container.clientHeight * 4);
            await sleep(1200 + recoveries * 400);
            container.scrollTop = container.scrollHeight;
            container.dispatchEvent(new WheelEvent("wheel", { deltaY: 1800, bubbles: true }));
            await sleep(3000 + recoveries * 800);
            stagnant = 0;
            continue;
          }
          break;
        }
      } else {
        stagnant = 0;
      }
      prevCount = data.size;
    }

    const ts = nowIso();
    const rows = Array.from(data.values());
    const csv = [
      "Usuario,Nombre,Timestamp",
      ...rows.map((r) => `${escapeCsvValue(r.username)},${escapeCsvValue(r.fullName)},${ts}`),
    ].join("\n");
    const filename = `ig_auto_${toSafeFilePart(profile)}_${phase.key}_${Date.now()}.csv`;
    downloadText(filename, csv, "text/csv;charset=utf-8;");
    return { phase: phase.key, rows, filename, scrapeTimestamp: ts };
  }

  function buildComparison(followersRows, followingRows) {
    const followersSet = new Set(followersRows.map((r) => r.username));
    const followingSet = new Set(followingRows.map((r) => r.username));

    const nos = [...followersSet].filter((u) => followingSet.has(u)).sort();
    const noLoSigo = [...followersSet].filter((u) => !followingSet.has(u)).sort();
    const noMeSigue = [...followingSet].filter((u) => !followersSet.has(u)).sort();

    return { nos, noLoSigo, noMeSigue };
  }

  function buildExcelHtml(profile, comparison, scrapeTime) {
    const maxLen = Math.max(comparison.nos.length, comparison.noLoSigo.length, comparison.noMeSigue.length, 1);
    const rowHtml = [];
    for (let i = 0; i < maxLen; i += 1) {
      rowHtml.push(
        `<tr>` +
          `<td>${comparison.nos[i] || ""}</td>` +
          `<td>${comparison.noLoSigo[i] || ""}</td>` +
          `<td>${comparison.noMeSigue[i] || ""}</td>` +
          `<td>${scrapeTime}</td>` +
          `</tr>`
      );
    }
    return (
      `<!doctype html><html><head><meta charset="utf-8"></head><body>` +
      `<h2>Seguidores vs Seguidos (${profile})</h2>` +
      `<table border="1" cellspacing="0" cellpadding="4">` +
      `<thead><tr>` +
      `<th>Nos seguimos (${comparison.nos.length})</th>` +
      `<th>No lo sigo (${comparison.noLoSigo.length})</th>` +
      `<th>No me sigue (${comparison.noMeSigue.length})</th>` +
      `<th>Ultimo Scrapeo</th>` +
      `</tr></thead>` +
      `<tbody>${rowHtml.join("")}</tbody>` +
      `</table>` +
      `</body></html>`
    );
  }

  async function runAnalysis() {
    if (running) throw new Error("Ya hay un analisis en curso.");
    if (!onProfilePage()) {
      throw new Error("Abre Instagram en el perfil objetivo (ej: instagram.com/usuario/).");
    }
    running = true;

    try {
      const profile = getProfileFromPath();
      setOverlay(profile, "preparando", 0, "Iniciando analisis...", "#a2f3a6");
      sendProgress(`Perfil detectado: ${profile}`);

      const phaseResults = {};
      for (const phase of PHASES) {
        setOverlay(profile, phase.key, 0, `Abriendo ${phase.key}...`, "#a2f3a6");
        sendProgress(`Abriendo ${phase.key}...`);
        const phaseMeta = await openDialogForPhase(phase);
        await sleep(650);
        phaseResults[phase.key] = await scrapeCurrentDialog(
          phase,
          profile,
          phaseMeta && Number.isFinite(phaseMeta.expectedCount) ? phaseMeta.expectedCount : null
        );
        sendProgress(`CSV ${phase.key} descargado: ${phaseResults[phase.key].filename}`);
        await closeDialog();
        await sleep(CONFIG.phaseDelayMs);
      }

      const comparison = buildComparison(phaseResults.followers.rows, phaseResults.following.rows);
      const scrapeTime = phaseResults.following.scrapeTimestamp || nowIso();
      const reportHtml = buildExcelHtml(profile, comparison, scrapeTime);
      const reportName = `ig_auto_${toSafeFilePart(profile)}_seguidores_vs_seguidos_${nowCompact()}.xls`;
      downloadText(reportName, reportHtml, "application/vnd.ms-excel;charset=utf-8;");

      setOverlay(profile, "completo", comparison.nos.length + comparison.noLoSigo.length + comparison.noMeSigue.length, "Finalizado y descargado", "#7de8c6");
      sendProgress(`Excel compatible descargado: ${reportName}`);
      sendDone();
    } catch (error) {
      setOverlay(getProfileFromPath(), "error", 0, `Error: ${error.message || "desconocido"}`, "#ff9a9a");
      sendError(error.message || "Error desconocido.");
      throw error;
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "START_ANALYSIS") return undefined;

    runAnalysis()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Error." }));

    return true;
  });
})();
