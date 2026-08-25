"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "extension");
const failures = [];
const metrics = [];

function fail(message) { failures.push(message); }
function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function lines(relative) { return read(relative).split(/\r?\n/).length; }

const limits = {
  "extension/dashboard.js": 1100,
  "extension/dashboard-admin.js": 480,
  "extension/dashboard-ux.js": 620,
  "extension/trust-core.js": 720,
};

Object.entries(limits).forEach(([file, limit]) => {
  const count = lines(file);
  metrics.push(`${file}: ${count}/${limit} líneas`);
  if (count > limit) fail(`${file} supera el límite de ${limit} líneas (${count}). Dividí responsabilidades antes de agregar más código.`);
});

const dashboardFiles = fs.readdirSync(extension)
  .filter((name) => /^dashboard.*\.js$/.test(name) && !name.endsWith(".test.js"));
const forbiddenAssignments = /\b(renderAll|loadProfile|validView|renderPeople|renderActivity|renderRelationshipList|renderReportComparison)\s*=\s*(?:async\s*)?function/g;

dashboardFiles.forEach((name) => {
  const source = read(`extension/${name}`);
  if (forbiddenAssignments.test(source)) {
    fail(`extension/${name} reemplaza una función global del dashboard. Registrá un hook o renderer en dashboard-runtime.js.`);
  }
  forbiddenAssignments.lastIndex = 0;
  if (/chrome\.storage\.local/.test(source)) {
    fail(`extension/${name} accede directamente a chrome.storage.local. Usá platform-storage.js.`);
  }
});

const pureModules = [
  "extension/relationship-core.js",
  "extension/product-guidance.js",
  "extension/admin-core.js",
  "extension/trust-core.js",
];
pureModules.forEach((file) => {
  const source = read(file);
  if (/\b(document|window|HTMLElement|MutationObserver)\b/.test(source)) {
    fail(`${file} debe ser un módulo puro y no puede depender del DOM.`);
  }
  if (/chrome\.storage/.test(source)) fail(`${file} no puede persistir datos directamente.`);
});

for (const name of fs.readdirSync(extension).filter((value) => value.endsWith(".js"))) {
  const source = read(`extension/${name}`);
  if (name !== "instagram-api.js" && /\/api\/v1\//.test(source)) {
    fail(`extension/${name} construye endpoints de Instagram fuera de instagram-api.js.`);
  }
}

const requiredFiles = [
  "extension/platform-storage.js",
  "extension/dashboard-runtime.js",
  "extension/relationship-core.js",
  "extension/admin-core.js",
  "extension/product-guidance.js",
  "extension/dashboard-guidance.js",
  "extension/dashboard-guidance.css",
  "docs/DESIGN-THINKING.md",
  "docs/ADR-002-dashboard-runtime.md",
  "docs/ARCHITECTURE-3.1.md",
];
requiredFiles.forEach((file) => {
  if (!fs.existsSync(path.join(root, file))) fail(`Falta ${file}.`);
});

if (failures.length) {
  console.error("Quality gates fallaron:\n");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("Quality gates OK");
  metrics.forEach((message) => console.log(`- ${message}`));
  console.log(`- ${dashboardFiles.length} módulos de dashboard sin monkey patching ni storage directo`);
  console.log(`- ${pureModules.length} módulos de dominio verificados sin DOM`);
}
