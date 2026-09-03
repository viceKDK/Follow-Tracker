"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "extension");
const failures = [];
const metrics = [];

function fail(message) { failures.push(message); }
function exists(relative) { return fs.existsSync(path.join(root, relative)); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function lines(relative) { return read(relative).split(/\r?\n/).length; }
function requireInOrder(source, names, label) {
  let cursor = -1;
  names.forEach((name) => {
    const index = source.indexOf(name);
    if (index < 0) fail(`${label}: falta ${name}.`);
    else if (index <= cursor) fail(`${label}: ${name} está fuera de orden.`);
    cursor = Math.max(cursor, index);
  });
}

const limits = {
  "extension/follower-identity.js": 220,
  "extension/follower-imports.js": 280,
  "extension/follower-relations.js": 300,
  "extension/follower-history-model.js": 220,
  "extension/follower-history-engine.js": 260,
  "extension/follower-projections.js": 260,
  "extension/dashboard-projection.js": 140,
  "extension/dashboard.js": 760,
  "extension/dashboard-admin.js": 480,
  "extension/dashboard-ux.js": 620,
  "extension/trust-core.js": 720,
  "extension/capture-store.js": 320,
  "extension/storage-migrations.js": 220,
};

Object.entries(limits).forEach(([file, limit]) => {
  if (!exists(file)) { fail(`Falta ${file}.`); return; }
  const count = lines(file);
  metrics.push(`${file}: ${count}/${limit} líneas`);
  if (count > limit) fail(`${file} supera el límite de ${limit} líneas (${count}). Dividí responsabilidades antes de agregar más código.`);
});

const dashboardFiles = fs.readdirSync(extension)
  .filter((name) => /^dashboard.*\.js$/.test(name) && !name.endsWith(".test.js"));
const forbiddenAssignments = /\b(renderAll|loadProfile|validView|renderPeople|renderActivity|renderRelationshipList|renderReportComparison)\s*=\s*(?:async\s*)?function/g;

dashboardFiles.forEach((name) => {
  const source = read(`extension/${name}`);
  if (forbiddenAssignments.test(source)) fail(`extension/${name} reemplaza una función global del dashboard. Registrá un hook o renderer en dashboard-runtime.js.`);
  forbiddenAssignments.lastIndex = 0;
  if (/chrome\.storage\.local/.test(source)) fail(`extension/${name} accede directamente a chrome.storage.local. Usá platform-storage.js.`);
});

const dashboardSource = read("extension/dashboard.js");
[
  [/(?:function|const|let|var)\s+compareSnapshots\b/, "no debe implementar su propio motor de diff"],
  [/(?:function|const|let|var)\s+deriveCategories\b/, "no debe derivar categorías de seguidores"],
  [/Core\.(?:compareSnapshots|buildRelationshipComparison)\s*\(/, "debe consumir proyecciones, no recalcular relaciones desde Core"],
  [/History\.compareReports\s*\(/, "no debe calcular comparaciones dentro del render"],
  [/History\.(?:summarizeSnapshot|latestReport|buildPeopleIndex)\s*\(/, "debe leer resumen, último reporte y personas desde state.projection"],
  [/Relationship\.buildTransitions\s*\(/, "no debe construir transiciones dentro de la UI"],
].forEach(([pattern, reason]) => {
  if (pattern.test(dashboardSource)) fail(`extension/dashboard.js ${reason}.`);
});
if (!/Projection\.projectState\s*\(/.test(dashboardSource)) fail("extension/dashboard.js debe construir state.projection antes de renderizar un perfil.");
if (!/projection\.comparison/.test(dashboardSource)) fail("extension/dashboard.js debe renderizar la comparación desde projection.comparison.");

const domainFiles = [
  "extension/follower-identity.js",
  "extension/follower-imports.js",
  "extension/follower-relations.js",
  "extension/follower-history-model.js",
  "extension/follower-history-engine.js",
  "extension/follower-projections.js",
];
const otherPureModules = [
  "extension/core-facade.js",
  "extension/history-facade.js",
  "extension/relationship-core.js",
  "extension/product-guidance.js",
  "extension/admin-core.js",
  "extension/trust-core.js",
  "extension/storage-migrations.js",
  "extension/dashboard-projection.js",
];

[...domainFiles, ...otherPureModules].forEach((file) => {
  if (!exists(file)) { fail(`Falta ${file}.`); return; }
  const source = read(file);
  if (/\b(document|window|HTMLElement|MutationObserver)\b/.test(source)) fail(`${file} debe ser un módulo puro y no puede depender del DOM.`);
  if (/chrome\.storage/.test(source)) fail(`${file} no puede persistir datos directamente.`);
});

const domainSource = domainFiles.filter(exists).map(read).join("\n");
[
  "normalizeSnapshot",
  "parseInstagramExportPart",
  "mergeInstagramExportParts",
  "diffSnapshots",
  "appendSnapshot",
  "compareReports",
  "deriveCategories",
  "buildDashboardProjection",
].forEach((contract) => {
  if (!new RegExp(`\\b${contract}\\b`).test(domainSource)) fail(`La capa follower-* no expone el contrato ${contract}.`);
});

[
  "extension/core-facade.js",
  "extension/history-facade.js",
  "extension/relationship-core.js",
].forEach((file) => {
  if (exists(file) && !/FollowTrackerFollowerDomain/.test(read(file))) fail(`${file} debe ser una fachada del modelo canónico FollowTrackerFollowerDomain.`);
});

const coreFacade = read("extension/core-facade.js");
if (!/Domain\.diffLists\s*\(/.test(coreFacade)) fail("extension/core-facade.js debe delegar compareSnapshots al motor canónico.");
if (/(?:function|const|let|var)\s+diffSnapshots\b/.test(coreFacade)) fail("extension/core-facade.js no puede mantener un segundo motor de snapshots.");

const adapterSource = read("extension/trust-domain-adapter.js");
if (!/Object\.assign\(Trust, delegated\)/.test(adapterSource)) fail("trust-domain-adapter.js debe redirigir la API histórica de Trust al dominio canónico.");
[
  "parseInstagramExportPart",
  "mergeInstagramExportParts",
  "normalizeUsername",
  "uniqueUsers",
].forEach((contract) => {
  if (!new RegExp(`\\b${contract}\\b`).test(adapterSource)) fail(`trust-domain-adapter.js no delega ${contract}.`);
});

const importSource = read("extension/follower-imports.js");
[
  "IMPORT_NORMALIZERS",
  'id: "instagram-json"',
  'id: "instagram-html"',
  'id: "csv"',
  "duplicateRecords",
  "invalidRecords",
  "completeness",
].forEach((contract) => {
  if (!importSource.includes(contract)) fail(`extension/follower-imports.js no implementa ${contract}.`);
});
if (/JSON\.parse/.test(importSource) && !/'instagram-json'|"instagram-json"/.test(importSource)) {
  fail("El parser JSON debe permanecer dentro del normalizador instagram-json.");
}

const captureStoreSource = read("extension/capture-store.js");
if (/(?:function|const|let|var)\s+(?:compareSnapshots|diffSnapshots|deriveCategories)\b/.test(captureStoreSource)) {
  fail("extension/capture-store.js no puede definir diff o categorías; debe consumir Core/Trust adaptados.");
}
requireInOrder(captureStoreSource, ["assessCaptureCompleteness", "applyAbsencePolicy"], "capture-store integridad");
if (!/canConfirmRemovals/.test(captureStoreSource)) fail("capture-store.js debe congelar bajas según canConfirmRemovals.");
if (!/activeRenameCandidates/.test(captureStoreSource) || !/renameCandidates/.test(captureStoreSource)) {
  fail("capture-store.js debe mantener candidatos de cambio de username entre capturas.");
}

const trustIntegritySource = adapterSource;
[
  "assessCaptureCompleteness",
  "minRemovalConfidence",
  "deferred",
  "detectRenameCandidates",
  "normalizeCaptureMetrics",
].forEach((contract) => {
  if (!trustIntegritySource.includes(contract)) fail(`extension/trust-domain-adapter.js no implementa ${contract}.`);
});
if (!/return Trust/.test(trustIntegritySource)) {
  fail("trust-domain-adapter.js debe exportar la API Trust ya parcheada para Node y navegador.");
}

for (const collector of ["extension/instagram-api.js", "extension/instagram-ui.js"]) {
  const source = read(collector);
  if (!/captureMetrics/.test(source) || !/paginationCompleted/.test(source) || !/terminationReason/.test(source)) {
    fail(`${collector} debe informar métricas, paginación y razón de terminación.`);
  }
}
if (!/expectedInfoFromTrigger/.test(read("extension/instagram-ui.js"))) {
  fail("instagram-ui.js debe distinguir contadores exactos de contadores abreviados.");
}

const migrationSource = read("extension/storage-migrations.js");
[
  "STORAGE_SCHEMA_VERSION",
  "MIGRATION_BACKUP_KEY",
  "planStorageMigration",
  "validateStorageSnapshot",
  "restoreMigration",
  "checksum",
].forEach((contract) => {
  if (!migrationSource.includes(contract)) fail(`storage-migrations.js no expone ${contract}.`);
});
if (!/catch \(error\)[\s\S]*restoreMigration/.test(migrationSource)) {
  fail("storage-migrations.js debe restaurar automáticamente ante una migración fallida.");
}

const backgroundSource = read("extension/background.js");
if (/\bCONTENT_FILES\b|chrome\.scripting|executeScript\s*\(/.test(backgroundSource)) {
  fail("background.js no puede depender de scripting ni inyección dinámica.");
}
if (!/storage-migrations\.js/.test(backgroundSource) || !/migrateStorage\s*\(/.test(backgroundSource)) {
  fail("background.js debe ejecutar las migraciones versionadas.");
}

const manifest = JSON.parse(read("extension/manifest.json"));
const permissions = new Set(manifest.permissions || []);
if (permissions.size !== 2 || !permissions.has("activeTab") || !permissions.has("storage")) {
  fail("manifest.json debe limitar permissions a activeTab y storage.");
}
["scripting", "unlimitedStorage", "tabs", "cookies", "webRequest"].forEach((permission) => {
  if (permissions.has(permission)) fail(`manifest.json conserva el permiso excesivo ${permission}.`);
});

const relationshipSource = read("extension/relationship-core.js");
if (!/transitionHeadline\s*=\s*api\.headline/.test(relationshipSource)) fail("relationship-core.js debe conservar el alias transitionHeadline requerido por dashboard.js 3.1.");

const projectionSource = read("extension/dashboard-projection.js");
if (!/History\.buildDashboardProjection\s*\(/.test(projectionSource)) fail("dashboard-projection.js debe construir el estado visible desde buildDashboardProjection().");
if (/(?:compareSnapshots|deriveCategories|buildRelationshipComparison)\s*\(/.test(projectionSource)) fail("dashboard-projection.js no puede reimplementar diff o categorías del dominio.");
if (!/comparisonSelection/.test(projectionSource) || !/selectComparison/.test(projectionSource)) {
  fail("dashboard-projection.js debe ser dueño de la selección y reconstrucción de comparaciones.");
}

const dashboardHtml = read("extension/dashboard.html");
const projectionIndex = dashboardHtml.indexOf('src="dashboard-projection.js"');
const dashboardIndex = dashboardHtml.indexOf('src="dashboard.js"');
if (projectionIndex < 0 || dashboardIndex < 0 || projectionIndex > dashboardIndex) {
  fail("dashboard.html debe cargar dashboard-projection.js antes de dashboard.js.");
}
const dashboardLoaderSource = read("extension/dashboard-table.js");
if (/"dashboard-projection\.js"/.test(dashboardLoaderSource)) {
  fail("dashboard-table.js no debe cargar tarde dashboard-projection.js; ya es dependencia base del dashboard.");
}

for (const name of fs.readdirSync(extension).filter((value) => value.endsWith(".js"))) {
  const source = read(`extension/${name}`);
  if (name !== "instagram-api.js" && /\/api\/v1\//.test(source)) fail(`extension/${name} construye endpoints de Instagram fuera de instagram-api.js.`);
}

const requiredFiles = [
  ...domainFiles,
  "extension/core-facade.js",
  "extension/history-facade.js",
  "extension/follower-domain.test.js",
  "extension/import-normalizers.test.js",
  "extension/history-bootstrap.test.js",
  "extension/trust-domain-adapter.js",
  "extension/trust-domain-adapter.test.js",
  "extension/platform-storage.js",
  "extension/storage-migrations.js",
  "extension/storage-migrations.test.js",
  "extension/capture-integrity.test.js",
  "extension/dashboard-runtime.js",
  "extension/dashboard-projection.js",
  "extension/dashboard-projection.test.js",
  "extension/relationship-core.js",
  "extension/admin-core.js",
  "extension/product-guidance.js",
  "extension/dashboard-guidance.js",
  "extension/dashboard-guidance.css",
  "docs/DESIGN-THINKING.md",
  "docs/ADR-002-dashboard-runtime.md",
  "docs/ARCHITECTURE-3.1.md",
  "docs/ARCHITECTURE-3.2.md",
  "docs/DATA-INTEGRITY-3.3.md",
];
requiredFiles.forEach((file) => { if (!exists(file)) fail(`Falta ${file}.`); });

if (failures.length) {
  console.error("Quality gates fallaron:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("Quality gates OK");
  metrics.forEach((message) => console.log(`- ${message}`));
  console.log(`- ${dashboardFiles.length} módulos de dashboard sin monkey patching ni storage directo`);
  console.log(`- ${domainFiles.length} módulos del dominio canónico verificados sin DOM ni persistencia`);
  console.log("- importadores JSON, HTML y CSV normalizan hacia un modelo común con métricas");
  console.log("- capturas incompletas congelan bajas y candidatos de rename persisten entre capturas");
  console.log("- almacenamiento versionado con backup, checksum, validación y rollback");
  console.log("- permisos limitados a activeTab + storage y hosts de Instagram");
}
