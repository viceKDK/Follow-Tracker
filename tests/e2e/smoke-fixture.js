"use strict";

// Smoke local sin navegador: evita depender de Playwright en cada CI de Python/Node.
// El agente E2E puede abrir instagram-profile.html con Playwright para validar la UI.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const fixture = path.resolve(__dirname, "..", "fixtures", "instagram-profile.html");
const html = fs.readFileSync(fixture, "utf8");

assert.match(html, /data-testid="instagram-profile"/);
assert.match(html, /data-testid="followers-button"/);
assert.match(html, /data-testid="following-button"/);
assert.match(html, /data-testid="followers-dialog"/);
assert.match(html, /data-testid="following-dialog"/);
assert.match(html, /\['ana', 'Ana Demo'\]/);
assert.match(html, /\['diana', 'Diana Demo'\]/);
console.log(`Fixture E2E OK: ${path.relative(process.cwd(), fixture)}`);
