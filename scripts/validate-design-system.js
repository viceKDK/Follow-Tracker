"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension");
const tokenPath = path.join(extensionDir, "design-tokens.css");
const failures = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

if (!fs.existsSync(tokenPath)) {
  failures.push("Falta extension/design-tokens.css");
} else {
  const tokens = fs.readFileSync(tokenPath, "utf8");
  [
    "--ft-brand",
    "--ft-sidebar",
    "--ft-text",
    "--ft-page",
    "--ft-border",
    "--ft-success",
    "--ft-warning",
    "--ft-danger",
    "--ft-font-sans",
    "--ft-font-md",
    "--ft-focus-ring",
  ].forEach((token) => {
    if (!tokens.includes(`${token}:`)) failures.push(`Falta el token requerido ${token}`);
  });
}

for (const file of ["extension/dashboard.html", "extension/popup.html"]) {
  const html = read(file);
  const tokensIndex = html.indexOf('href="design-tokens.css"');
  const productCssIndex = html.search(/href="(?:dashboard|popup)\.css"/);
  if (tokensIndex < 0) failures.push(`${file}: no carga design-tokens.css`);
  if (tokensIndex > productCssIndex) failures.push(`${file}: design-tokens.css debe cargar antes que los estilos del producto`);
}

const presentationFiles = fs.readdirSync(extensionDir)
  .filter((name) => /\.(?:css|html|js)$/.test(name))
  .map((name) => path.join(extensionDir, name));

presentationFiles.forEach((file) => {
  const source = fs.readFileSync(file, "utf8");
  if (/\b(?:linear|radial|conic)-gradient\s*\(/i.test(source)) {
    failures.push(`${path.relative(root, file)}: los gradientes no pertenecen al sistema visual`);
  }
});

for (const file of ["extension/dashboard.css", "extension/dashboard-polish.css", "extension/popup.css"]) {
  const source = read(file);
  if (!source.includes("var(--ft-brand)")) failures.push(`${file}: no consume la marca canónica`);
  if (!source.includes("var(--ft-font-sans)")) failures.push(`${file}: no consume la tipografía canónica`);
}

if (failures.length) {
  console.error(`Validación del sistema visual fallida:\n\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Sistema visual válido: paleta, tipografía y política sin gradientes verificadas.");
