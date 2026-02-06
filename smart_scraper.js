// Instagram Auto Scraper
// Ejecuta automaticamente:
// 1) Seguidores
// 2) Seguidos
// Requisito: estar en el perfil de la cuenta objetivo.

const CONFIG = {
  MAX_USERS: 10000,
  MIN_WAIT_MS: 2500,
  MAX_WAIT_MS: 7000,
  MAX_STAGNANT_ATTEMPTS: 5,
  SAVE_EVERY_X_USERS: 100,
  PHASE_GAP_MS: 1800,
};

const PHASES = [
  { key: "followers", hrefKey: "/followers/", labels: ["followers", "seguidores"] },
  { key: "following", hrefKey: "/following/", labels: ["following", "seguidos"] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSleep() {
  const ms =
    Math.floor(Math.random() * (CONFIG.MAX_WAIT_MS - CONFIG.MIN_WAIT_MS + 1)) +
    CONFIG.MIN_WAIT_MS;
  return sleep(ms);
}

function profileUsernameFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[0] : "unknown_profile";
}

function sanitizeFilenamePart(text) {
  return String(text || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function createUI() {
  const old = document.getElementById("ig-auto-scraper-ui");
  if (old) old.remove();

  const panel = document.createElement("div");
  panel.id = "ig-auto-scraper-ui";
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.88);
    color: #fff;
    font-family: Arial, sans-serif;
    border: 2px solid #2f80ed;
    border-radius: 12px;
    padding: 12px;
    min-width: 290px;
    box-shadow: 0 8px 24px rgba(0,0,0,.35);
  `;
  panel.innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:#57c6ff;">IG Auto Scraper</div>
    <div style="font-size:13px;margin-bottom:4px;">Perfil: <span id="ig-profile">-</span></div>
    <div style="font-size:13px;margin-bottom:4px;">Fase: <span id="ig-phase">-</span></div>
    <div style="font-size:13px;margin-bottom:4px;">Usuarios: <span id="ig-count">0</span></div>
    <div id="ig-status" style="font-size:13px;color:#7dff9e;margin-bottom:8px;">Listo</div>
    <button id="ig-stop" style="width:100%;padding:8px;border:none;border-radius:8px;background:#e53e3e;color:#fff;cursor:pointer;">Detener</button>
  `;
  document.body.appendChild(panel);
  return panel;
}

class AutoInstagramScraper {
  constructor() {
    this.isRunning = false;
    this.ui = createUI();
    this.data = new Map();
    this.phase = null;
    this.profile = profileUsernameFromPath();
    this.batchCounter = 0;
    this.downloadedFiles = [];
    this.bindUI();
    this.setProfile(this.profile);
    window.instagramAutoScraper = this;
  }

  bindUI() {
    const stopBtn = this.ui.querySelector("#ig-stop");
    stopBtn.onclick = () => this.stop("Detenido por usuario");
  }

  setProfile(text) {
    this.ui.querySelector("#ig-profile").textContent = text;
  }

  setPhase(text) {
    this.ui.querySelector("#ig-phase").textContent = text;
  }

  setCount(n) {
    this.ui.querySelector("#ig-count").textContent = String(n);
  }

  setStatus(text, color = "#7dff9e") {
    const el = this.ui.querySelector("#ig-status");
    el.textContent = text;
    el.style.color = color;
  }

  stop(reason) {
    this.isRunning = false;
    this.setStatus(reason || "Detenido", "#ffd166");
  }

  isProfilePage() {
    if (!window.location.hostname.includes("instagram.com")) return false;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return false;
    const reserved = new Set(["explore", "accounts", "reels", "direct", "stories"]);
    return !reserved.has(parts[0]);
  }

  getWarningTextsFound() {
    const warningTexts = [
      "Try Again Later",
      "Too Many Requests",
      "Action Blocked",
      "Intentar de nuevo mas tarde",
      "Accion bloqueada",
    ];
    const bodyText = document.body && document.body.innerText ? document.body.innerText : "";
    return warningTexts.filter((w) => bodyText.includes(w));
  }

  checkForWarnings() {
    const matches = this.getWarningTextsFound();
    const alerts = document.querySelectorAll('div[role="alert"]');
    if (matches.length > 0 || alerts.length > 0) {
      this.stop("Instagram mostro alerta. Se detuvo por seguridad.");
      alert("Instagram detecto actividad inusual. Espera antes de reintentar.");
      return false;
    }
    return true;
  }

  findPhaseTrigger(phase) {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const byHref = anchors.find((a) => a.getAttribute("href").includes(phase.hrefKey));
    if (byHref) return byHref;

    // Fallback por texto visible (idioma EN/ES)
    const candidates = Array.from(document.querySelectorAll("a, button"));
    return candidates.find((el) => {
      const text = (el.textContent || "").toLowerCase().trim();
      return phase.labels.some((label) => text.includes(label));
    });
  }

  async openPhaseDialog(phase) {
    const trigger = this.findPhaseTrigger(phase);
    if (!trigger) {
      throw new Error(`No encontre acceso a ${phase.key} en el perfil.`);
    }
    trigger.click();
    const ok = await this.waitFor(() => !!document.querySelector('div[role="dialog"]'), 10000);
    if (!ok) {
      throw new Error(`No se abrio el dialogo de ${phase.key}.`);
    }
  }

  async closeDialog() {
    const closeBtn = document.querySelector('div[role="dialog"] [aria-label="Cerrar"], div[role="dialog"] [aria-label="Close"]');
    if (closeBtn) {
      closeBtn.click();
      await sleep(500);
      return;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(500);
  }

  async waitFor(predicateFn, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicateFn()) return true;
      await sleep(150);
    }
    return false;
  }

  findScrollableContainer() {
    const selectors = [
      'div[role="dialog"] div[style*="overflow"]',
      'div[role="dialog"] ._aano',
      'div[role="dialog"] div[class*="scroll"]',
      'div[role="dialog"] > div > div',
    ];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const style = window.getComputedStyle(element);
        const hasScroll = style.overflowY === "auto" || style.overflowY === "scroll";
        if (hasScroll) return element;
      }
    }
    throw new Error("No encontre contenedor con scroll en el dialogo.");
  }

  extractUsers(container) {
    const users = new Set();
    const links = container.querySelectorAll("a[href]");
    links.forEach((el) => {
      const href = el.getAttribute("href") || "";
      if (!href.startsWith("/")) return;
      if (href.includes("/p/") || href.includes("/reel/") || href.includes("/stories/")) return;
      const username = href.replace(/\//g, "").split("?")[0].trim();
      if (!username) return;
      if (!/^[a-zA-Z0-9._]+$/.test(username)) return;
      if (this.data.has(username)) return;

      let fullName = "Sin Nombre";
      const text = (el.innerText || "").trim();
      if (text && text.toLowerCase() !== username.toLowerCase()) {
        fullName = text.split("\n")[0].replace(/,/g, " ");
      }
      users.add(`${username},${fullName}`);
    });
    return Array.from(users);
  }

  saveBackup() {
    try {
      localStorage.setItem(
        "ig_auto_scraper_backup",
        JSON.stringify({
          ts: Date.now(),
          profile: this.profile,
          phase: this.phase ? this.phase.key : null,
          count: this.data.size,
          last100: Array.from(this.data.values()).slice(-100),
        })
      );
    } catch (e) {
      // ignore quota issues
    }
  }

  downloadCSV(phaseKey) {
    const rows = Array.from(this.data.values());
    if (rows.length === 0) {
      throw new Error(`No hay datos para ${phaseKey}.`);
    }
    const safeProfile = sanitizeFilenamePart(this.profile);
    const headers = "Usuario,Nombre,Timestamp\n";
    const nowIso = new Date().toISOString();
    const csv = headers + rows.map((r) => `${r},${nowIso}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename = `ig_auto_${safeProfile}_${phaseKey}_${Date.now()}.csv`;
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.downloadedFiles.push(filename);
    return filename;
  }

  async scrapeCurrentDialog(phase) {
    this.phase = phase;
    this.setPhase(phase.key);
    this.data.clear();
    this.batchCounter = 0;
    this.setCount(0);
    this.setStatus(`Scrapeando ${phase.key}...`);

    const container = this.findScrollableContainer();
    let stagnantAttempts = 0;
    let previousHeight = container.scrollHeight;
    let previousCount = 0;

    while (this.isRunning && this.data.size < CONFIG.MAX_USERS) {
      if (!this.checkForWarnings()) return null;

      const start = container.scrollTop;
      container.scrollTop = container.scrollHeight;
      if (container.scrollTop === start) {
        container.scrollTop = start + 600;
      }

      await randomSleep();

      const newUsers = this.extractUsers(container);
      newUsers.forEach((row) => {
        const [username] = row.split(",");
        this.data.set(username, row);
      });
      this.setCount(this.data.size);

      const hadNewUsers = this.data.size > previousCount;
      if (hadNewUsers) {
        previousCount = this.data.size;
        stagnantAttempts = 0;
        this.batchCounter += 1;
        if (this.batchCounter % CONFIG.SAVE_EVERY_X_USERS === 0) {
          this.saveBackup();
        }
      }

      const currentHeight = container.scrollHeight;
      if (currentHeight === previousHeight && !hadNewUsers) {
        stagnantAttempts += 1;
        if (stagnantAttempts >= CONFIG.MAX_STAGNANT_ATTEMPTS) break;
      } else if (currentHeight !== previousHeight) {
        previousHeight = currentHeight;
      }
    }

    const filename = this.downloadCSV(phase.key);
    this.setStatus(`CSV listo: ${filename}`);
    return filename;
  }

  async run() {
    if (this.isRunning) return;
    if (!this.isProfilePage()) {
      alert("Abre Instagram en el perfil de la persona objetivo (ej: instagram.com/usuario/).");
      return;
    }

    this.isRunning = true;
    this.profile = profileUsernameFromPath();
    this.setProfile(this.profile);
    this.setStatus("Iniciando flujo automatico...");

    try {
      for (const phase of PHASES) {
        if (!this.isRunning) break;
        this.setStatus(`Abriendo ${phase.key}...`);
        await this.openPhaseDialog(phase);
        await sleep(700);

        const csvName = await this.scrapeCurrentDialog(phase);
        if (!csvName) break;

        this.setStatus(`Cerrando ${phase.key}...`);
        await this.closeDialog();
        await sleep(CONFIG.PHASE_GAP_MS);
      }

      if (this.isRunning) {
        this.setStatus("Proceso completo. CSV de followers/following descargados.", "#7dff9e");
        localStorage.setItem(
          "ig_auto_last_run",
          JSON.stringify({
            profile: this.profile,
            files: this.downloadedFiles,
            ts: Date.now(),
          })
        );
        alert(
          "Scraping completo.\n" +
            "Se descargaron los 2 CSV.\n\n" +
            "Ahora abre comparar_ig.py y usa 'Analizar otra cuenta (AUTO)'."
        );
      }
    } catch (error) {
      console.error(error);
      this.setStatus(`Error: ${error.message}`, "#ff8a8a");
      alert(`Error del scraper: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}

async function initializeAutoScraper() {
  if (!window.location.hostname.includes("instagram.com")) {
    alert("Este script solo funciona en Instagram.com");
    return;
  }
  const scraper = new AutoInstagramScraper();
  // Arranque automatico breve
  await sleep(1200);
  scraper.run();
}

initializeAutoScraper().catch(console.error);
