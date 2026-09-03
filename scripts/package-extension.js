"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension");
const distDir = path.join(root, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (manifest.version !== packageJson.version) {
  throw new Error(`Versiones desalineadas: manifest=${manifest.version}, package=${packageJson.version}`);
}

execFileSync(process.execPath, [path.join(root, "scripts", "validate-extension.js")], {
  cwd: root,
  stdio: "inherit",
});

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const ignored = new Set([".DS_Store", "Thumbs.db"]);
const files = walk(extensionDir)
  .filter((absolute) => !ignored.has(path.basename(absolute)))
  .filter((absolute) => !absolute.endsWith(".test.js"))
  .sort((a, b) => a.localeCompare(b));

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function localHeader(nameBuffer, data, crc, stamp) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(stamp.time, 10);
  header.writeUInt16LE(stamp.day, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer, data]);
}

function centralHeader(nameBuffer, data, crc, stamp, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(stamp.time, 12);
  header.writeUInt16LE(stamp.day, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endRecord(fileCount, centralSize, centralOffset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(fileCount, 8);
  record.writeUInt16LE(fileCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stableDate = new Date("2026-01-01T00:00:00.000Z");
  const stamp = dosTimestamp(stableDate);

  entries.forEach(({ name, data }) => {
    const nameBuffer = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const crc = crc32(data);
    const local = localHeader(nameBuffer, data, crc, stamp);
    const central = centralHeader(nameBuffer, data, crc, stamp, offset);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });

  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    endRecord(entries.length, central.length, offset),
  ]);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const entries = files.map((absolute) => ({
  name: path.relative(extensionDir, absolute).replace(/\\/g, "/"),
  data: fs.readFileSync(absolute),
}));
const zip = buildZip(entries);
const filename = `follow-tracker-${manifest.version}.zip`;
const zipPath = path.join(distDir, filename);
fs.writeFileSync(zipPath, zip);

const checksum = crypto.createHash("sha256").update(zip).digest("hex");
fs.writeFileSync(`${zipPath}.sha256`, `${checksum}  ${filename}\n`, "utf8");
fs.writeFileSync(path.join(distDir, "release-manifest.json"), JSON.stringify({
  name: manifest.name,
  version: manifest.version,
  generatedAt: new Date().toISOString(),
  file: filename,
  sha256: checksum,
  files: entries.map((entry) => entry.name),
}, null, 2));

console.log(`Paquete creado: ${path.relative(root, zipPath)}`);
console.log(`SHA-256: ${checksum}`);
console.log(`Archivos incluidos: ${entries.length}`);
