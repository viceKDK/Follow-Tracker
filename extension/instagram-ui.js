(function (root, factory) {
  const trust = root && root.FollowTrackerTrust
    ? root.FollowTrackerTrust
    : (typeof module === "object" && module.exports ? require("./trust-core.js") : null);
  const api = factory(trust);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerInstagramUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Trust) {
  "use strict";

  if (!Trust) throw new Error("Follow Tracker Instagram UI no pudo cargar Trust Core.");

  const DEFAULTS = Object.freeze({
    openTimeoutMs: 12000,
    settleMs: 500,
    scrollDelayMs: 420,
    stagnantLimit: 14,
    maxIterations: 3000,
    maxUsers: 100000,
  });

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new DOMException("Cancelado", "AbortError"));
        return;
      }
      const id = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(id);
          reject(new DOMException("Cancelado", "AbortError"));
        }, { once: true });
      }
    });
  }

  function parseCount(text) {
    const raw = String(text || "").toLowerCase().trim().replace(/\s+/g, "");
    const abbreviated = raw.match(/([0-9]+(?:[.,][0-9]+)?)([km])/i);
    if (abbreviated) {
      const number = Number(abbreviated[1].replace(",", "."));
      if (!Number.isFinite(number)) return null;
      return Math.round(number * (abbreviated[2].toLowerCase() === "m" ? 1000000 : 1000));
    }
    const digits = raw.replace(/[.,]/g, "").match(/\d+/);
    return digits ? Number(digits[0]) : null;
  }

  function triggerFor(profile, phase) {
    const direct = document.querySelector(`a[href='/${profile}/${phase}/'],a[href^='/${profile}/${phase}/?']`);
    if (direct) return direct;
    const hrefPart = `/${phase}/`;
    const anchor = [...document.querySelectorAll("a[href]")]
      .find((element) => String(element.getAttribute("href") || "").includes(hrefPart));
    if (anchor) return anchor;
    const labels = phase === "followers"
      ? ["followers", "seguidores"]
      : ["following", "seguidos"];
    return [...document.querySelectorAll("a,button")]
      .find((element) => labels.some((label) => String(element.textContent || "").toLowerCase().includes(label)));
  }

  function expectedFromTrigger(trigger) {
    if (!trigger) return null;
    const titled = trigger.querySelector("[title]") || (trigger.hasAttribute("title") ? trigger : null);
    const fromTitle = titled ? parseCount(titled.getAttribute("title")) : null;
    return Number.isFinite(fromTitle) ? fromTitle : parseCount(trigger.textContent);
  }

  async function waitFor(predicate, timeoutMs, signal) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (signal && signal.aborted) throw new DOMException("Cancelado", "AbortError");
      const value = predicate();
      if (value) return value;
      await sleep(150, signal);
    }
    return null;
  }

  function dialogOrRoute(profile, phase) {
    return document.querySelector('div[role="dialog"]')
      || document.querySelector("main section")
      || document.querySelector("main")
      || document.body;
  }

  function userFromHref(href) {
    let path = String(href || "");
    if (/^https?:/i.test(path)) {
      try { path = new URL(path).pathname; } catch (_error) { return null; }
    }
    const username = Trust.normalizeUsername(path.split("/").filter(Boolean)[0]);
    const blocked = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct"]);
    return username && !blocked.has(username) ? username : null;
  }

  function collectVisible(scope, target) {
    let added = 0;
    scope.querySelectorAll("a[href]").forEach((anchor) => {
      const username = userFromHref(anchor.getAttribute("href"));
      if (!username || target.has(username)) return;
      const lines = String(anchor.innerText || anchor.textContent || "")
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
      target.set(username, Trust.normalizeUser({
        username,
        fullName: lines.find((line) => Trust.normalizeUsername(line) !== username) || "",
      }, "ui"));
      added += 1;
    });

    if (!added) {
      scope.querySelectorAll("li,div[role='listitem'],div[role='button']").forEach((row) => {
        const lines = String(row.innerText || "")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean);
        if (!lines.length) return;
        const username = Trust.normalizeUsername(lines[0]);
        if (!username || target.has(username)) return;
        if (["seguir", "following", "followers", "seguidores", "seguidos"].some((word) => username.includes(word))) return;
        target.set(username, Trust.normalizeUser({ username, fullName: lines[1] || "" }, "ui"));
        added += 1;
      });
    }
    return added;
  }

  function scrollScore(element) {
    if (!element) return -1;
    const style = getComputedStyle(element);
    const scrollable = element.scrollHeight > element.clientHeight + 20
      || ["auto", "scroll"].includes(style.overflowY);
    return (scrollable ? 100 : 0)
      + element.querySelectorAll("a[href]").length * 4
      + Math.min(50, element.scrollHeight / 1000);
  }

  function scrollContainer(scope) {
    const candidates = [scope, ...scope.querySelectorAll("div")]
      .filter((element) => element && element instanceof HTMLElement)
      .sort((a, b) => scrollScore(b) - scrollScore(a));
    return candidates[0] || document.scrollingElement || document.documentElement;
  }

  async function openPhase(profile, phase, options) {
    const settings = { ...DEFAULTS, ...(options || {}) };
    const trigger = triggerFor(profile, phase);
    const expected = expectedFromTrigger(trigger);
    if (trigger) {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } else {
      history.pushState({}, "", `/${profile}/${phase}/`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    const scope = await waitFor(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) return dialog;
      const pathOpen = location.pathname.toLowerCase().includes(`/${phase}/`);
      const routeScope = dialogOrRoute(profile, phase);
      return pathOpen && routeScope.querySelectorAll("a[href]").length ? routeScope : null;
    }, settings.openTimeoutMs, settings.signal);
    if (!scope) throw new Error(`Instagram no abrió la lista de ${phase === "followers" ? "seguidores" : "seguidos"}.`);
    await sleep(settings.settleMs, settings.signal);
    return { scope, expected };
  }

  async function closePhase(profile, signal) {
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      const button = dialog.querySelector('button[aria-label="Cerrar"],button[aria-label="Close"]');
      if (button) button.click();
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(350, signal);
    }
    if (/\/(followers|following)\/?$/i.test(location.pathname)) {
      history.pushState({}, "", `/${profile}/`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      await sleep(400, signal);
    }
  }

  async function collectPhase(profile, phase, options) {
    const settings = { ...DEFAULTS, ...(options || {}) };
    const opened = await openPhase(profile, phase, settings);
    const target = new Map();
    const container = scrollContainer(opened.scope);
    let stagnant = 0;
    let iterations = 0;
    let previousSize = 0;

    container.scrollTop = 0;
    collectVisible(opened.scope, target);
    settings.onProgress && settings.onProgress({ phase, count: target.size, expected: opened.expected });

    while (iterations < settings.maxIterations && target.size < settings.maxUsers) {
      if (settings.signal && settings.signal.aborted) throw new DOMException("Cancelado", "AbortError");
      const before = container.scrollTop;
      const jump = Math.max(320, Math.floor((container.clientHeight || 600) * 0.65));
      container.scrollTop = Math.min(container.scrollHeight, before + jump);
      container.dispatchEvent(new WheelEvent("wheel", { deltaY: jump, bubbles: true }));
      if (container.scrollTop === before && container !== document.scrollingElement) window.scrollBy(0, jump);
      await sleep(settings.scrollDelayMs, settings.signal);
      collectVisible(opened.scope, target);
      settings.onProgress && settings.onProgress({ phase, count: target.size, expected: opened.expected });

      if (target.size === previousSize) stagnant += 1;
      else stagnant = 0;
      previousSize = target.size;
      iterations += 1;
      if (Number.isFinite(opened.expected) && opened.expected >= 0 && target.size >= opened.expected) break;
      if (stagnant >= settings.stagnantLimit) break;
    }

    await closePhase(profile, settings.signal);
    return {
      users: Trust.uniqueUsers([...target.values()], "ui"),
      expected: opened.expected,
      iterations,
      warning: stagnant >= settings.stagnantLimit
        ? `La lista de ${phase === "followers" ? "seguidores" : "seguidos"} dejó de cargar nuevas filas.`
        : "",
    };
  }

  async function collectProfile(profileValue, options) {
    const profile = Trust.safeProfile(profileValue);
    const settings = { ...DEFAULTS, ...(options || {}) };
    const startedAt = Date.now();
    const followers = await collectPhase(profile, "followers", settings);
    const following = await collectPhase(profile, "following", settings);
    const warnings = [followers.warning, following.warning].filter(Boolean);
    return {
      source: "ui",
      profile,
      profileId: "",
      followers: followers.users,
      following: following.users,
      expectedFollowers: followers.expected,
      expectedFollowing: following.expected,
      durationMs: Date.now() - startedAt,
      retries: 0,
      warnings,
    };
  }

  return {
    DEFAULTS,
    closePhase,
    collectPhase,
    collectProfile,
    collectVisible,
    expectedFromTrigger,
    openPhase,
    parseCount,
    triggerFor,
  };
});
