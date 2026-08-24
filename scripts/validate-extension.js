"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension");
const failures = [];
const checked = new Set();

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    fail(`${relativePath}: JSON inválido (${error.message})`);
    return null;
  }
}

function localExtensionPath(reference) {
  const clean = String(reference || "").split(/[?#]/, 1)[0].trim();
  if (!clean || clean.startsWith("#") || clean.startsWith("data:")) return null;
  if (/^(?:https?:)?\/\//i.test(clean)) {
    fail(`Referencia remota no permitida en la extensión: ${clean}`);
    return null;
  }
  return path.resolve(extensionDir, clean.replace(/^\//, ""));
}

function requireExtensionFile(reference, source) {
  const absolutePath = localExtensionPath(reference);
  if (!absolutePath) return;
  if (!absolutePath.startsWith(`${extensionDir}${path.sep}`) && absolutePath !== extensionDir) {
    fail(`${source}: referencia fuera de extension/: ${reference}`);
    return;
  }
  const key = path.relative(root, absolutePath);
  checked.add(key);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`${source}: falta ${key}`);
  }
}

function requireRootFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`Falta ${relativePath}`);
  }
}

function collectHtmlReferences(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const html = fs.readFileSync(absolutePath, "utf8");
  const referencePattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = referencePattern.exec(html))) requireExtensionFile(match[1], relativePath);
  if (/<script\b[^>]*src=["'](?:https?:)?\/\//i.test(html)) fail(`${relativePath}: contiene un script remoto`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

const packageJson = readJson("package.json");
const manifest = readJson("extension/manifest.json");

if (packageJson && manifest) {
  if (packageJson.version !== manifest.version) {
    fail(`Versiones desalineadas: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
  }
  if (manifest.manifest_version !== 3) fail("manifest.json debe usar Manifest V3");

  const allowedPermissions = new Set(["activeTab", "storage", "scripting", "unlimitedStorage"]);
  for (const permission of manifest.permissions || []) {
    if (!allowedPermissions.has(permission)) fail(`Permiso inesperado: ${permission}`);
  }

  const allowedHosts = new Set([
    "https://www.instagram.com/*",
    "https://instagram.com/*",
  ]);
  for (const host of manifest.host_permissions || []) {
    if (!allowedHosts.has(host)) fail(`Host inesperado: ${host}`);
  }
  if ((manifest.host_permissions || []).length !== allowedHosts.size) {
    fail("Los host_permissions deben limitarse a las dos variantes de instagram.com");
  }

  requireExtensionFile(manifest.background && manifest.background.service_worker, "manifest.background");
  requireExtensionFile(manifest.action && manifest.action.default_popup, "manifest.action");
  requireExtensionFile(manifest.options_ui && manifest.options_ui.page, "manifest.options_ui");

  Object.values(manifest.icons || {}).forEach((reference) => requireExtensionFile(reference, "manifest.icons"));
  Object.values((manifest.action && manifest.action.default_icon) || {}).forEach((reference) =>
    requireExtensionFile(reference, "manifest.action.default_icon")
  );
  (manifest.content_scripts || []).forEach((entry, index) => {
    (entry.js || []).forEach((reference) => requireExtensionFile(reference, `manifest.content_scripts[${index}].js`));
    (entry.css || []).forEach((reference) => requireExtensionFile(reference, `manifest.content_scripts[${index}].css`));
  });

  const loadedContent = (manifest.content_scripts || []).flatMap((entry) => entry.js || []);
  for (const legacy of ["content.js", "export-policy.js"]) {
    if (loadedContent.includes(legacy)) fail(`El manifest todavía carga el runtime heredado ${legacy}`);
  }
}

for (const htmlPath of walk(extensionDir).filter((file) => file.endsWith(".html"))) {
  collectHtmlReferences(path.relative(root, htmlPath));
}

const runtimeReferences = [
  "core.js",
  "history.js",
  "maintenance.js",
  "product-core.js",
  "trust-core.js",
  "capture-store.js",
  "instagram-api.js",
  "instagram-ui.js",
  "analysis-overlay.js",
  "analysis-controller.js",
  "content-entry.js",
  "dashboard.js",
  "dashboard-table.js",
  "dashboard-ux.js",
  "dashboard-product.js",
  "dashboard-maintenance.js",
  "dashboard-backup.js",
  "dashboard-identity.js",
  "dashboard-admin.js",
  "dashboard.css",
  "dashboard-table.css",
  "dashboard-ux.css",
  "dashboard-product.css",
  "dashboard-maintenance.css",
  "dashboard-trust.css",
  "popup.js",
  "popup.css",
  "background.js",
];
runtimeReferences.forEach((reference) => requireExtensionFile(reference, "runtime requerido"));

for (const legacy of ["content.js", "export-policy.js"]) {
  if (fs.existsSync(path.join(extensionDir, legacy))) fail(`El archivo heredado extension/${legacy} debe eliminarse del paquete 3.0`);
}

for (const jsPath of walk(extensionDir).filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"))) {
  const relativePath = path.relative(root, jsPath);
  const source = fs.readFileSync(jsPath, "utf8");
  if (/\beval\s*\(/.test(source)) fail(`${relativePath}: usa eval()`);
  if (/\bnew\s+Function\s*\(/.test(source)) fail(`${relativePath}: usa new Function()`);
  if (/import\s*\(\s*["']https?:\/\//i.test(source)) fail(`${relativePath}: importa código remoto`);
}

for (const requiredDocument of ["PRIVACY_POLICY.md", "STORE_LISTING.md", "CHANGELOG.md", "docs/MIGRATION-3.0.md"]) {
  requireRootFile(requiredDocument);
}

if (packageJson) {
  const scripts = packageJson.scripts || {};
  for (const required of ["test", "check", "e2e", "e2e:fixture", "package"]) {
    if (!scripts[required]) fail(`package.json: falta el script ${required}`);
  }
}

if (failures.length) {
  console.error("Validación de extensión fallida:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(
    `Extensión válida: Manifest V3, versión ${manifest && manifest.version}, ${checked.size} referencias locales verificadas.`
  );
}
