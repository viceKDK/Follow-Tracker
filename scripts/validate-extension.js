"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension");
const failures = [];
const checked = new Set();

function fail(message) { failures.push(message); }
function readJson(relative) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
  catch (error) { fail(`${relative}: JSON inválido (${error.message})`); return null; }
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
function requireRoot(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`Falta ${relative}`);
}
function localPath(reference) {
  const clean = String(reference || "").split(/[?#]/, 1)[0].trim();
  if (!clean || clean.startsWith("#") || clean.startsWith("data:")) return null;
  if (/^(?:https?:)?\/\//i.test(clean)) { fail(`Referencia remota no permitida: ${clean}`); return null; }
  return path.resolve(extensionDir, clean.replace(/^\//, ""));
}
function requireExtension(reference, source) {
  const absolute = localPath(reference);
  if (!absolute) return;
  if (!absolute.startsWith(`${extensionDir}${path.sep}`) && absolute !== extensionDir) {
    fail(`${source}: referencia fuera de extension/: ${reference}`);
    return;
  }
  const relative = path.relative(root, absolute);
  checked.add(relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail(`${source}: falta ${relative}`);
}
function collectHtml(relative) {
  const html = fs.readFileSync(path.join(root, relative), "utf8");
  const pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) requireExtension(match[1], relative);
}
function requireOrdered(files, expected, source) {
  let cursor = -1;
  expected.forEach((file) => {
    const index = files.indexOf(file);
    if (index < 0) fail(`${source}: falta ${file}`);
    else if (index <= cursor) fail(`${source}: ${file} está fuera de orden`);
    cursor = Math.max(cursor, index);
  });
}

const pkg = readJson("package.json");
const manifest = readJson("extension/manifest.json");
if (pkg && manifest) {
  if (pkg.version !== manifest.version) fail(`Versiones desalineadas: package=${pkg.version}, manifest=${manifest.version}`);
  if (manifest.manifest_version !== 3) fail("manifest.json debe usar Manifest V3");
  const requiredPermissions = ["activeTab", "storage"];
  const permissions = [...new Set(manifest.permissions || [])].sort();
  if (JSON.stringify(permissions) !== JSON.stringify([...requiredPermissions].sort())) {
    fail(`permissions debe limitarse a ${requiredPermissions.join(", ")}; recibió ${permissions.join(", ") || "ninguno"}`);
  }
  ["scripting", "unlimitedStorage", "tabs", "cookies", "webRequest"].forEach((permission) => {
    if (permissions.includes(permission)) fail(`Permiso excesivo: ${permission}`);
  });
  const allowedHosts = new Set(["https://www.instagram.com/*", "https://instagram.com/*"]);
  (manifest.host_permissions || []).forEach((host) => {
    if (!allowedHosts.has(host)) fail(`Host inesperado: ${host}`);
  });
  if ((manifest.host_permissions || []).length !== allowedHosts.size) fail("host_permissions debe limitarse a Instagram");

  requireExtension(manifest.background && manifest.background.service_worker, "manifest.background");
  requireExtension(manifest.action && manifest.action.default_popup, "manifest.action");
  requireExtension(manifest.options_ui && manifest.options_ui.page, "manifest.options_ui");
  Object.values(manifest.icons || {}).forEach((file) => requireExtension(file, "manifest.icons"));
  Object.values(manifest.action && manifest.action.default_icon || {}).forEach((file) => requireExtension(file, "manifest.action.default_icon"));
  (manifest.content_scripts || []).forEach((entry, index) => {
    const js = entry.js || [];
    js.forEach((file) => requireExtension(file, `content_scripts[${index}].js`));
    (entry.css || []).forEach((file) => requireExtension(file, `content_scripts[${index}].css`));
    requireOrdered(js, [
      "follower-identity.js", "follower-imports.js", "follower-relations.js", "core-facade.js",
      "trust-core.js", "trust-domain-adapter.js", "capture-store.js",
    ], `content_scripts[${index}].js`);
  });
}

walk(extensionDir).filter((file) => file.endsWith(".html")).forEach((file) => collectHtml(path.relative(root, file)));

const runtime = [
  "follower-identity.js", "follower-imports.js", "follower-relations.js", "core-facade.js", "core.js",
  "follower-history-model.js", "follower-history-engine.js", "follower-projections.js", "history-facade.js", "history.js",
  "history-guard.js", "history-quality.js", "maintenance.js", "platform-storage.js", "storage-migrations.js", "dashboard-runtime.js",
  "dashboard-projection.js", "relationship-core.js", "admin-core.js", "product-core.js", "product-guidance.js", "trust-core.js",
  "trust-domain-adapter.js", "capture-store.js", "instagram-api.js", "instagram-ui.js", "analysis-overlay.js",
  "analysis-controller.js", "content-entry.js", "dashboard.js", "dashboard-table.js", "dashboard-ux.js",
  "dashboard-product.js", "dashboard-maintenance.js", "dashboard-backup.js", "dashboard-identity.js",
  "dashboard-admin.js", "dashboard-integrity.js", "dashboard-guidance.js", "dashboard.css", "dashboard-table.css",
  "dashboard-ux.css", "dashboard-product.css", "dashboard-maintenance.css", "dashboard-trust.css",
  "dashboard-guidance.css", "popup.js", "popup.css", "background.js",
];
runtime.forEach((file) => requireExtension(file, "runtime requerido"));

for (const legacy of ["content.js", "export-policy.js"]) {
  if (fs.existsSync(path.join(extensionDir, legacy))) fail(`El runtime heredado extension/${legacy} debe permanecer eliminado`);
}

walk(extensionDir).filter((file) => file.endsWith(".js") && !file.endsWith(".test.js")).forEach((file) => {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(root, file);
  if (/\beval\s*\(/.test(source)) fail(`${relative}: usa eval()`);
  if (/\bnew\s+Function\s*\(/.test(source)) fail(`${relative}: usa new Function()`);
  if (/import\s*\(\s*["']https?:\/\//i.test(source)) fail(`${relative}: importa código remoto`);
});

const backgroundSource = fs.readFileSync(path.join(extensionDir, "background.js"), "utf8");
function requireSourceOrder(source, expected, label) {
  let cursor = -1;
  expected.forEach((file) => {
    const index = source.indexOf(`"${file}"`);
    if (index < 0) fail(`${label}: falta ${file}`);
    else if (index <= cursor) fail(`${label}: ${file} está fuera de orden`);
    cursor = Math.max(cursor, index);
  });
}
requireSourceOrder(backgroundSource, [
  "follower-identity.js", "follower-imports.js", "follower-relations.js", "core-facade.js",
  "follower-history-model.js", "follower-history-engine.js", "follower-projections.js", "history-facade.js",
  "history-guard.js", "history-quality.js", "storage-migrations.js",
], "background.importScripts");
if (/\bCONTENT_FILES\b|chrome\.scripting|executeScript\s*\(/.test(backgroundSource)) {
  fail("background.js no debe inyectar scripts dinámicamente; el runtime usa content_scripts declarativos.");
}

const dashboardHtmlSource = fs.readFileSync(path.join(extensionDir, "dashboard.html"), "utf8");
requireSourceOrder(dashboardHtmlSource, ["dashboard-runtime.js", "relationship-core.js", "dashboard-projection.js", "dashboard.js", "dashboard-table.js"], "dashboard.html");
const dashboardLoader = fs.readFileSync(path.join(extensionDir, "dashboard-table.js"), "utf8");
requireSourceOrder(dashboardLoader, ["trust-core.js", "trust-domain-adapter.js", "capture-store.js", "dashboard-ux.js"], "dashboard-table.js");
if (dashboardLoader.includes('"dashboard-projection.js"')) fail("dashboard-table.js no debe cargar dashboard-projection.js: es una dependencia base declarada en dashboard.html");

const coreBootstrap = fs.readFileSync(path.join(extensionDir, "core.js"), "utf8");
const historyBootstrap = fs.readFileSync(path.join(extensionDir, "history.js"), "utf8");
if (/https?:\/\//i.test(coreBootstrap + historyBootstrap)) fail("Los bootstraps core.js/history.js solo pueden cargar scripts locales.");
["follower-identity.js", "follower-imports.js", "follower-relations.js", "core-facade.js"].forEach((file) => {
  if (!coreBootstrap.includes(file)) fail(`core.js no carga ${file}.`);
});
["follower-history-model.js", "follower-history-engine.js", "follower-projections.js", "history-facade.js"].forEach((file) => {
  if (!historyBootstrap.includes(file)) fail(`history.js no carga ${file}.`);
});

[
  "PRIVACY_POLICY.md", "STORE_LISTING.md", "CHANGELOG.md", "docs/MIGRATION-3.0.md",
  "docs/DESIGN-THINKING.md", "docs/ADR-002-dashboard-runtime.md", "docs/ARCHITECTURE-3.1.md",
  "docs/ARCHITECTURE-3.2.md", "docs/DATA-INTEGRITY-3.3.md",
].forEach(requireRoot);

if (pkg) ["test", "check", "quality", "e2e", "e2e:fixture", "package"].forEach((script) => {
  if (!pkg.scripts || !pkg.scripts[script]) fail(`package.json: falta el script ${script}`);
});

if (failures.length) {
  console.error("Validación de extensión fallida:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Extensión válida: Manifest V3, versión ${manifest && manifest.version}, ${checked.size} referencias locales verificadas.`);
  console.log("Permisos mínimos validados: activeTab + storage, sin scripting ni unlimitedStorage.");
  console.log("Orden de carga del dominio canónico y migraciones versionadas validado.");
}
