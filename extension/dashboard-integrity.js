"use strict";

(function () {
  const Trust = globalThis.FollowTrackerTrust;
  const IdentityUi = globalThis.FollowTrackerIdentityUi;
  const Storage = globalThis.FollowTrackerStorage;
  if (!Trust || !Storage) throw new Error("Follow Tracker Dashboard Integrity no pudo cargar sus dependencias.");

  const storageRemove = Storage.remove;

  function officialPhases(files) {
    const names = [...(files || [])].map((file) => String(file.name || "").toLowerCase());
    return {
      followers: names.some((name) => /followers?(?:_\d+)?\.json$/.test(name) || name.includes("followers")),
      following: names.some((name) => /following(?:_accounts)?\.json$/.test(name) || name.includes("following")),
    };
  }

  function enforceOfficialImport(files) {
    const phases = officialPhases(files);
    const complete = phases.followers && phases.following;
    const button = document.querySelector("#official-import-save");
    const stateTarget = document.querySelector("#official-import-state");
    const preview = document.querySelector("#official-import-preview");
    if (button) button.disabled = !complete || button.disabled;
    if (!complete && stateTarget) {
      stateTarget.textContent = !phases.followers && !phases.following
        ? "Faltan las listas de seguidores y seguidos."
        : !phases.followers
          ? "Falta un archivo de seguidores."
          : "Falta el archivo de seguidos.";
    }
    if (!complete && preview) {
      let warning = preview.querySelector("[data-complete-import-warning]");
      if (!warning) {
        warning = document.createElement("div");
        warning.dataset.completeImportWarning = "true";
        warning.className = "trust-observation";
        preview.append(warning);
      }
      warning.textContent = "Para crear un reporte comparable se necesitan ambas listas: seguidores y seguidos.";
    }
    return complete;
  }

  function canonicalSearch(value) {
    const normalized = Trust.normalizeUsername(value);
    if (!normalized || !IdentityUi) return normalized;
    return IdentityUi.canonicalFor(normalized) || normalized;
  }

  document.addEventListener("change", (event) => {
    if (event.target.id !== "official-import-files") return;
    const files = event.target.files;
    setTimeout(() => enforceOfficialImport(files), 0);
  });

  document.addEventListener("input", (event) => {
    if (!["people-search", "relationship-search"].includes(event.target.id)) return;
    const visibleValue = event.target.value;
    queueMicrotask(() => {
      const canonical = canonicalSearch(visibleValue.replace(/^@/, ""));
      if (!canonical || canonical === Trust.normalizeUsername(visibleValue)) return;
      if (event.target.id === "people-search") {
        state.query = canonical;
        renderPeople();
      } else {
        state.relationshipQuery = canonical;
        renderRelationshipList();
      }
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("#delete-profile");
    if (!button || !state.profile) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const profile = state.profile;
    if (!confirm(`¿Borrar todo el historial y los datos locales de @${profile}? Esta acción no se puede deshacer.`)) return;
    button.disabled = true;
    button.textContent = "Borrando…";
    storageRemove(Object.values(Trust.storageKeys(profile)))
      .then(() => {
        location.href = "dashboard.html#admin";
      })
      .catch((error) => {
        button.disabled = false;
        button.textContent = "Borrar historial de este perfil";
        alert(`No se pudo borrar el perfil: ${error.message}`);
      });
  }, true);

  globalThis.FollowTrackerDashboardIntegrity = {
    canonicalSearch,
    enforceOfficialImport,
    officialPhases,
  };
})();
