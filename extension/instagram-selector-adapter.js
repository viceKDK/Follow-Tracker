(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FollowTrackerInstagramSelectors = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SELECTOR_SCHEMA_VERSION = 1;
  const PHASE_LABELS = Object.freeze({
    followers: ["followers", "seguidores"],
    following: ["following", "seguidos"],
  });

  function labelsFor(phase) {
    return PHASE_LABELS[phase] || [String(phase || "")];
  }

  function normalizedText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function semanticText(element) {
    if (!element) return "";
    return normalizedText([
      element.getAttribute && element.getAttribute("aria-label"),
      element.getAttribute && element.getAttribute("title"),
      element.getAttribute && element.getAttribute("data-testid"),
      element.getAttribute && element.getAttribute("data-target"),
      element.textContent,
    ].filter(Boolean).join(" "));
  }

  function matchesPhase(element, phase) {
    const text = semanticText(element);
    return labelsFor(phase).some((label) => text.includes(label));
  }

  function isVisible(element) {
    if (!element || element.hidden === true) return false;
    if (element.getAttribute && element.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function all(documentValue, selector) {
    const documentObject = documentValue || (typeof document !== "undefined" ? document : null);
    if (!documentObject || typeof documentObject.querySelectorAll !== "function") return [];
    return [...documentObject.querySelectorAll(selector)];
  }

  function exactRouteTrigger(documentValue, profile, phase) {
    const documentObject = documentValue || document;
    if (!documentObject || typeof documentObject.querySelector !== "function") return null;
    return documentObject.querySelector(`a[href='/${profile}/${phase}/'],a[href^='/${profile}/${phase}/?']`);
  }

  function findTrigger(documentValue, profile, phase) {
    const documentObject = documentValue || (typeof document !== "undefined" ? document : null);
    if (!documentObject) return { element: null, strategy: "none", confidence: 0 };

    const exact = exactRouteTrigger(documentObject, profile, phase);
    if (exact) return { element: exact, strategy: "exact-route", confidence: 1 };

    const testId = all(documentObject, "a,button,[role='button']")
      .find((element) => isVisible(element)
        && [element.getAttribute("data-testid"), element.getAttribute("data-target"), element.getAttribute("data-ft-phase")]
          .some((value) => labelsFor(phase).some((label) => normalizedText(value).includes(label))));
    if (testId) return { element: testId, strategy: "semantic-attribute", confidence: 0.98 };

    const semantic = all(documentObject, "a,button,[role='button']")
      .find((element) => isVisible(element) && matchesPhase(element, phase));
    if (semantic) return { element: semantic, strategy: "accessible-label", confidence: 0.94 };

    const href = all(documentObject, "a[href]")
      .find((element) => normalizedText(element.getAttribute("href")).includes(`/${phase}/`));
    if (href) return { element: href, strategy: "phase-href", confidence: 0.9 };

    return { element: null, strategy: "none", confidence: 0 };
  }

  function dialogCandidates(documentValue) {
    return all(documentValue, "div[role='dialog'],section[role='dialog'],[data-ft-list],[data-testid$='-dialog']");
  }

  function findScope(documentValue, phase) {
    const documentObject = documentValue || (typeof document !== "undefined" ? document : null);
    if (!documentObject) return { element: null, strategy: "none", confidence: 0 };
    const dialogs = dialogCandidates(documentObject).filter(isVisible);
    const phaseDialog = dialogs.find((element) => matchesPhase(element, phase));
    if (phaseDialog) return { element: phaseDialog, strategy: "phase-dialog", confidence: 1 };
    if (dialogs.length) return { element: dialogs[0], strategy: "visible-dialog", confidence: 0.82 };

    const routeCandidates = all(documentObject, "main section,main").filter(isVisible);
    const phaseRoute = routeCandidates.find((element) => matchesPhase(element, phase));
    if (phaseRoute) return { element: phaseRoute, strategy: "phase-route", confidence: 0.78 };
    if (routeCandidates.length) return { element: routeCandidates[0], strategy: "main-route", confidence: 0.65 };
    return { element: documentObject.body || null, strategy: "document-body", confidence: 0.4 };
  }

  function findCloseButton(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return null;
    const buttons = [...scope.querySelectorAll("button,[role='button']")];
    return buttons.find((element) => {
      const text = semanticText(element);
      return ["close", "cerrar", "dismiss", "salir"].some((label) => text.includes(label));
    }) || null;
  }

  function userAnchors(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    return [...scope.querySelectorAll("a[href]")].filter(isVisible);
  }

  function userRows(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    return [...scope.querySelectorAll("li,div[role='listitem'],div[role='button'],[data-testid='user-row']")].filter(isVisible);
  }

  return {
    SELECTOR_SCHEMA_VERSION,
    PHASE_LABELS,
    findCloseButton,
    findScope,
    findTrigger,
    isVisible,
    labelsFor,
    matchesPhase,
    semanticText,
    userAnchors,
    userRows,
  };
});