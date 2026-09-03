"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(projectRoot, "extension");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

let server;
let dashboardUrl;

function dashboardSeed() {
  const profile = "demo_profile";
  const users = ["ana", "beto", "carla", "diana", "eva"].map((username, index) => ({
    instagramUserId: String(index + 1),
    username,
    avatarUrl: `https://cdn.instagram.test/${username}.png`,
  }));
  const snapshot = {
    schemaVersion: 2,
    profile,
    followers: ["ana", "carla", "eva"],
    following: ["ana", "beto", "eva"],
    updatedAt: "2026-08-24T15:30:00.000Z",
    runId: "r3",
    reportId: "r3",
    users,
  };

  const timeline = {
    schemaVersion: 2,
    profile,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: snapshot.updatedAt,
    baseline: {
      profile,
      reportId: "r1",
      runId: "r1",
      capturedAt: "2026-08-20T10:00:00.000Z",
      followers: ["ana", "beto"],
      following: ["ana", "diana"],
      users: users.filter((user) => ["ana", "beto", "diana"].includes(user.username)),
    },
    reports: [
      {
        id: "r1",
        runId: "r1",
        capturedAt: "2026-08-20T10:00:00.000Z",
        isBaseline: true,
        followersCount: 2,
        followingCount: 2,
        mutualCount: 1,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: {
          newFollowers: [],
          lostFollowers: [],
          newFollowing: [],
          lostFollowing: [],
        },
        eventCount: 0,
        users: users.filter((user) => ["ana", "beto", "diana"].includes(user.username)),
      },
      {
        id: "r2",
        runId: "r2",
        capturedAt: "2026-08-21T10:00:00.000Z",
        isBaseline: false,
        followersCount: 2,
        followingCount: 2,
        mutualCount: 1,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: {
          newFollowers: ["carla"],
          lostFollowers: ["beto"],
          newFollowing: ["beto"],
          lostFollowing: ["diana"],
        },
        eventCount: 4,
        users: users.filter((user) => ["beto", "carla", "diana"].includes(user.username)),
      },
      {
        id: "r3",
        runId: "r3",
        capturedAt: snapshot.updatedAt,
        isBaseline: false,
        followersCount: 3,
        followingCount: 3,
        mutualCount: 2,
        followerOnlyCount: 1,
        followingOnlyCount: 1,
        changes: {
          newFollowers: ["eva"],
          lostFollowers: [],
          newFollowing: ["eva"],
          lostFollowing: [],
        },
        eventCount: 2,
        users: users.filter((user) => user.username === "eva"),
      },
    ],
    events: [
      {
        id: "r2:followed_you:carla",
        profile,
        username: "carla",
        type: "followed_you",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r2:unfollowed_you:beto",
        profile,
        username: "beto",
        type: "unfollowed_you",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r2:you_followed:beto",
        profile,
        username: "beto",
        type: "you_followed",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r2:you_unfollowed:diana",
        profile,
        username: "diana",
        type: "you_unfollowed",
        occurredAt: "2026-08-21T10:00:00.000Z",
        reportId: "r2",
        runId: "r2",
      },
      {
        id: "r3:followed_you:eva",
        profile,
        username: "eva",
        type: "followed_you",
        occurredAt: snapshot.updatedAt,
        reportId: "r3",
        runId: "r3",
      },
      {
        id: "r3:you_followed:eva",
        profile,
        username: "eva",
        type: "you_followed",
        occurredAt: snapshot.updatedAt,
        reportId: "r3",
        runId: "r3",
      },
    ],
  };

  return {
    [`ft_history_${profile}`]: snapshot,
    [`ft_timeline_${profile}`]: timeline,
  };
}

function serveExtension(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = url.pathname === "/" ? "dashboard.html" : url.pathname.replace(/^\/extension\//, "").replace(/^\//, "");
  const candidate = path.resolve(extensionRoot, relative);

  if (!candidate.startsWith(`${extensionRoot}${path.sep}`) && candidate !== extensionRoot) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(candidate, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(candidate)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(candidate).pipe(response);
  });
}

async function installDashboardMocks(page, seed = dashboardSeed()) {
  await page.addInitScript(({ initialStorage }) => {
    const persisted = sessionStorage.getItem("__ft_dashboard_storage");
    const storage = persisted ? JSON.parse(persisted) : JSON.parse(JSON.stringify(initialStorage));
    const storageListeners = [];
    const downloads = [];
    const blobs = [];
    const openedTabs = [];

    function persist() {
      sessionStorage.setItem("__ft_dashboard_storage", JSON.stringify(storage));
    }

    function selectStorage(keys) {
      if (keys == null) return { ...storage };
      if (typeof keys === "string") {
        return Object.prototype.hasOwnProperty.call(storage, keys) ? { [keys]: storage[keys] } : {};
      }
      if (Array.isArray(keys)) {
        return keys.reduce((result, key) => {
          if (Object.prototype.hasOwnProperty.call(storage, key)) result[key] = storage[key];
          return result;
        }, {});
      }
      if (typeof keys === "object") {
        return Object.entries(keys).reduce((result, [key, fallback]) => {
          result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback;
          return result;
        }, {});
      }
      return {};
    }

    globalThis.__ftDashboardTest = { storage, downloads, blobs, openedTabs };
    globalThis.confirm = () => true;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        getURL(file) { return new URL(file, location.origin).href; },
      },
      tabs: {
        create(options) { openedTabs.push(options); },
      },
      storage: {
        local: {
          get(keys, callback) { callback(selectStorage(keys)); },
          set(values, callback) {
            const changes = {};
            Object.entries(values || {}).forEach(([key, value]) => {
              changes[key] = { oldValue: storage[key], newValue: value };
              storage[key] = value;
            });
            persist();
            if (callback) callback();
            queueMicrotask(() => storageListeners.forEach((listener) => listener(changes, "local")));
          },
          remove(keys, callback) {
            const changes = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (!Object.prototype.hasOwnProperty.call(storage, key)) return;
              changes[key] = { oldValue: storage[key], newValue: undefined };
              delete storage[key];
            });
            persist();
            if (callback) callback();
            queueMicrotask(() => storageListeners.forEach((listener) => listener(changes, "local")));
          },
        },
        onChanged: {
          addListener(listener) { storageListeners.push(listener); },
        },
      },
    };

    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return `blob:follow-tracker-dashboard-${blobs.length}`;
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function recordDownload() {
      if (this.download) downloads.push(this.download);
    };
  }, { initialStorage: seed });
}

async function openDashboard(page, hash = "relationships") {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://cdn.instagram.test/**", (route) => route.fulfill({
    path: path.join(extensionRoot, "icons", "icon-48.png"),
    contentType: "image/png",
  }));
  await installDashboardMocks(page);
  await page.goto(`${dashboardUrl}?profile=demo_profile#${hash}`);
  await expect(page.locator("#dashboard-content")).toBeVisible();
  await expect(page.locator("#profile-select")).toHaveValue("demo_profile");
  await expect(page.locator("#relationship-advanced")).toBeAttached();
  return pageErrors;
}

test.beforeAll(async () => {
  server = http.createServer(serveExtension);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  dashboardUrl = `http://127.0.0.1:${address.port}/extension/dashboard.html`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

test("Antes y ahora filtra, pagina, abre detalle y exporta la vista", async ({ page }) => {
  const pageErrors = await openDashboard(page);

  await page.locator('[data-preset="first"]').click();
  await expect(page.locator("#compare-from")).toHaveValue("r1");
  await expect(page.locator("#compare-to")).toHaveValue("r3");
  await expect(page.locator("#relationship-visible-count")).toContainText("4 relaciones");

  await page.locator("#relationship-advanced-disclosure > summary").click();
  await page.locator("#relationship-change-filter").selectOption("unfollowed-you");
  await page.locator("#relationship-search").fill("@beto");
  await expect(page.locator(".relationship-person-card")).toHaveCount(1);
  await expect(page.locator(".relationship-person-card")).toContainText("@beto");
  await expect(page.locator(".relationship-column")).toHaveCount(4);

  await page.locator(".relationship-person-card").click();
  await expect(page.locator("#rel-drawer-overlay")).toBeVisible();
  await expect(page.locator("#drawer-user")).toHaveText("@beto");
  await expect(page.locator("#drawer-status")).toContainText("Antes");
  await page.keyboard.press("Escape");
  await expect(page.locator("#rel-drawer-overlay")).toBeHidden();

  await page.locator("#export-comparison-list").click();
  const downloads = await page.evaluate(() => globalThis.__ftDashboardTest.downloads.slice());
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/^follow-tracker_lista_demo_profile_r1_a_r3\.csv$/);
  expect(pageErrors).toEqual([]);
});

test("Actividad combina filtros, pagina y exporta solamente las coincidencias", async ({ page }) => {
  const pageErrors = await openDashboard(page, "activity");
  await page.locator('[data-view="activity"]').click();
  await expect(page.locator("#activity-controls")).toBeVisible();

  await page.locator(".activity-disclosure > summary").click();
  await page.locator("#activity-type").selectOption("unfollowed_you");
  await page.locator("#activity-search").fill("beto");
  await expect(page.locator(".activity-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".activity-table tbody tr")).toContainText("@beto");
  await expect(page.locator(".activity-event-icon")).toHaveAttribute("src", /icons\/metric-/);
  await expect(page.locator(".activity-profile-avatar img")).toHaveAttribute("src", /cdn\.instagram\.test/);
  await expect(page.locator("#event-total")).toContainText("1 de 6");

  await page.locator("#export-activity-view").click();
  const downloads = await page.evaluate(() => globalThis.__ftDashboardTest.downloads.slice());
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/^follow-tracker_actividad_filtrada_demo_profile_.*\.csv$/);
  expect(pageErrors).toEqual([]);
});

test("Personas prioriza el resumen visual y una tabla compacta", async ({ page }) => {
  const pageErrors = await openDashboard(page, "people");
  await page.locator('[data-view="people"]').click();
  await expect(page.locator("#people-summary .people-summary-card")).toHaveCount(6);
  await expect(page.locator("#people-summary img")).toHaveCount(6);
  await expect(page.locator(".people-current-table thead th")).toHaveCount(4);
  await expect(page.locator(".people-current-table")).toContainText("Relación actual");
  await expect(page.locator(".people-current-table")).toContainText("Último cambio");
  await expect(page.locator(".people-current-table .profile-avatar img").first()).toHaveAttribute("src", /cdn\.instagram\.test/);
  expect(pageErrors).toEqual([]);
});

test("Resumen muestra historial saludable y permite exportar el diagnóstico", async ({ page }) => {
  const pageErrors = await openDashboard(page, "overview");
  await page.locator('[data-view="overview"]').click();
  await expect(page.locator("#data-health-panel")).toBeVisible();
  await expect(page.locator("#health-status")).toContainText("100/100");
  await expect(page.locator("#health-issues")).toContainText("No se detectaron");

  await page.locator("#export-health").click();
  const downloads = await page.evaluate(() => globalThis.__ftDashboardTest.downloads.slice());
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatch(/^follow-tracker_diagnostico_demo_profile_.*\.json$/);
  expect(pageErrors).toEqual([]);
});

test("Los cambios y relaciones conservan un color semántico propio", async ({ page }) => {
  const pageErrors = await openDashboard(page, "overview");
  const changes = await page.locator("#latest-changes .change-group").evaluateAll((groups) => groups.map((group) => ({
    className: group.className,
    background: getComputedStyle(group).backgroundColor,
    border: getComputedStyle(group).borderTopColor,
  })));
  expect(changes).toHaveLength(4);
  expect(new Set(changes.map((group) => group.background)).size).toBe(4);
  expect(changes.map((group) => group.className)).toEqual(expect.arrayContaining([
    expect.stringContaining("change-group-followed-you"),
    expect.stringContaining("change-group-unfollowed-you"),
    expect.stringContaining("change-group-you-followed"),
    expect.stringContaining("change-group-you-unfollowed"),
  ]));

  await page.locator('[data-view="relationships"]').click();
  const relationships = await page.locator(".relationship-column").evaluateAll((columns) => columns.map((column) => ({
    className: column.className,
    accent: getComputedStyle(column).borderTopColor,
    header: getComputedStyle(column.querySelector(".relationship-column-head")).backgroundColor,
  })));
  expect(relationships).toHaveLength(4);
  expect(new Set(relationships.map((column) => column.accent)).size).toBe(4);
  expect(new Set(relationships.map((column) => column.header)).size).toBe(4);
  expect(pageErrors).toEqual([]);
});

test("Resumen mantiene navegación legible y métricas compactas en escritorio", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = await openDashboard(page, "overview");
  await expect(page.locator("body")).toHaveClass(/dashboard-polished/);

  const layout = await page.evaluate(() => {
    const navLabels = Array.from(document.querySelectorAll(".nav-label")).map((label) => {
      const style = getComputedStyle(label);
      return {
        text: label.textContent.trim(),
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        clipped: label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight,
      };
    });
    const cards = Array.from(document.querySelectorAll(".kpi-card"));
    const brandIcon = document.querySelector(".brand-mark img");
    const statusIcons = Array.from(document.querySelectorAll(".kpi-icon img"));
    return {
      navLabels,
      brandText: document.querySelector(".brand-mark")?.textContent.trim(),
      brandIconSize: brandIcon ? Math.round(brandIcon.getBoundingClientRect().width) : null,
      brandBackground: getComputedStyle(document.querySelector(".brand-mark")).backgroundImage,
      favicon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
      statusIconSizes: statusIcons.map((icon) => Math.round(icon.getBoundingClientRect().width)),
      statusIconSources: statusIcons.map((icon) => icon.getAttribute("src")),
      hasSidebarMessage: document.body.innerText.includes("La comparación es lo importante"),
      gradientElements: Array.from(document.querySelectorAll("*")).filter((element) => {
        const style = getComputedStyle(element);
        return `${style.backgroundImage} ${style.maskImage}`.includes("gradient");
      }).length,
      cardHeights: cards.map((card) => Math.round(card.getBoundingClientRect().height)),
      cardRows: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size,
      cardLabelSizes: cards.map((card) => Number.parseFloat(getComputedStyle(card.querySelector("p")).fontSize)),
      cardColumnGaps: cards.map((card) => Number.parseFloat(getComputedStyle(card).columnGap)),
    };
  });

  expect(layout.navLabels.map((item) => item.text)).toEqual([
    "Resumen",
    "Antes y ahora",
    "Personas",
    "Actividad",
    "Administrar",
  ]);
  expect(layout.navLabels.every((item) => item.textOverflow !== "ellipsis" && !item.clipped)).toBe(true);
  expect(layout.brandText).toBe("");
  expect(layout.brandIconSize).toBeLessThanOrEqual(30);
  expect(layout.brandBackground).toBe("none");
  expect(layout.favicon).toBe("icons/icon-32.png");
  expect(layout.statusIconSizes).toHaveLength(6);
  expect(Math.max(...layout.statusIconSizes)).toBeLessThanOrEqual(48);
  expect(layout.statusIconSources.every((source) => source.startsWith("icons/metric-"))).toBe(true);
  expect(layout.hasSidebarMessage).toBe(false);
  expect(layout.gradientElements).toBe(0);
  expect(layout.cardRows).toBe(1);
  expect(Math.max(...layout.cardHeights)).toBeLessThanOrEqual(120);
  expect(Math.min(...layout.cardLabelSizes)).toBeGreaterThanOrEqual(12);
  expect(Math.min(...layout.cardColumnGaps)).toBeGreaterThanOrEqual(18);
  expect(pageErrors).toEqual([]);
});

test("Navegación móvil permanece accesible y no tapa el contenido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors = await openDashboard(page, "overview");
  const mobile = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar").getBoundingClientRect();
    const navItems = Array.from(document.querySelectorAll(".main-nav .nav-item"));
    return {
      sidebarBottom: Math.round(sidebar.bottom),
      viewportHeight: innerHeight,
      navCount: navItems.length,
      minTarget: Math.min(...navItems.map((item) => item.getBoundingClientRect().height)),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(mobile.sidebarBottom).toBe(mobile.viewportHeight);
  expect(mobile.navCount).toBe(5);
  expect(mobile.minTarget).toBeGreaterThanOrEqual(40);
  expect(mobile.overflow).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("Importar backup rechaza JSON roto y restaura un perfil válido", async ({ page }) => {
  const pageErrors = await openDashboard(page, "overview");

  await page.locator("#import-backup-input").setInputFiles({
    name: "roto.json",
    mimeType: "application/json",
    buffer: Buffer.from("{no-es-json"),
  });
  await expect(page.locator("#product-toast")).toContainText("No se pudo leer");

  const imported = {
    snapshot: {
      schemaVersion: 2,
      profile: "imported_profile",
      followers: ["luz"],
      following: ["luz"],
      updatedAt: "2026-08-24T18:00:00.000Z",
      runId: "import-r1",
      reportId: "import-r1",
    },
    timeline: {
      schemaVersion: 2,
      profile: "imported_profile",
      createdAt: "2026-08-24T18:00:00.000Z",
      updatedAt: "2026-08-24T18:00:00.000Z",
      baseline: {
        profile: "imported_profile",
        reportId: "import-r1",
        runId: "import-r1",
        capturedAt: "2026-08-24T18:00:00.000Z",
        followers: ["luz"],
        following: ["luz"],
      },
      reports: [
        {
          id: "import-r1",
          runId: "import-r1",
          capturedAt: "2026-08-24T18:00:00.000Z",
          isBaseline: true,
          followersCount: 1,
          followingCount: 1,
          mutualCount: 1,
          followerOnlyCount: 0,
          followingOnlyCount: 0,
          changes: { newFollowers: [], lostFollowers: [], newFollowing: [], lostFollowing: [] },
          eventCount: 0,
        },
      ],
      events: [],
    },
  };

  await page.locator("#import-backup-input").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });

  await page.waitForFunction(() => Boolean(globalThis.__ftDashboardTest.storage.ft_history_imported_profile));
  const stored = await page.evaluate(() => ({
    snapshot: globalThis.__ftDashboardTest.storage.ft_history_imported_profile,
    timeline: globalThis.__ftDashboardTest.storage.ft_timeline_imported_profile,
  }));
  expect(stored.snapshot.profile).toBe("imported_profile");
  expect(stored.timeline.reports).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
