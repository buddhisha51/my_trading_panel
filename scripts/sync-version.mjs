import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8'));
}

function writeJsonPreservingEol(relPath, obj) {
  const fullPath = resolve(rootDir, relPath);
  const raw = readFileSync(fullPath, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const serialized = JSON.stringify(obj, null, 2).replace(/\n/g, eol) + eol;
  writeFileSync(fullPath, serialized, 'utf8');
}

const argVersion = process.argv[2]?.replace(/^v/, '');
const pkg = readJson('package.json');
const targetVersion = argVersion || pkg.version;

if (!targetVersion || !SEMVER_RE.test(targetVersion)) {
  console.error(`Invalid semver version: "${targetVersion}"`);
  process.exit(1);
}

// 1. package.json (single source of truth)
if (pkg.version !== targetVersion) {
  pkg.version = targetVersion;
  writeJsonPreservingEol('package.json', pkg);
}

// 2. package-lock.json
const lockPath = resolve(rootDir, 'package-lock.json');
const lockRaw = readFileSync(lockPath, 'utf8');
const lockJson = JSON.parse(lockRaw);
if (lockJson.version !== targetVersion || lockJson.packages?.['']?.version !== targetVersion) {
  lockJson.version = targetVersion;
  if (lockJson.packages?.['']) {
    lockJson.packages[''].version = targetVersion;
  }
  writeJsonPreservingEol('package-lock.json', lockJson);
}

// 3. src-tauri/tauri.conf.json
const tauriConf = readJson('src-tauri/tauri.conf.json');
if (tauriConf.version !== targetVersion) {
  tauriConf.version = targetVersion;
  writeJsonPreservingEol('src-tauri/tauri.conf.json', tauriConf);
}

// 4. src-tauri/Cargo.toml ([package] version)
const cargoTomlPath = resolve(rootDir, 'src-tauri/Cargo.toml');
const cargoTomlRaw = readFileSync(cargoTomlPath, 'utf8');
const cargoTomlNext = cargoTomlRaw.replace(
  /^(\[package\][\s\S]*?\r?\nversion\s*=\s*)"[^"]+"/m,
  `$1"${targetVersion}"`,
);
if (cargoTomlNext === cargoTomlRaw && !cargoTomlRaw.includes(`version = "${targetVersion}"`)) {
  console.error('Could not update [package] version in src-tauri/Cargo.toml');
  process.exit(1);
}
if (cargoTomlNext !== cargoTomlRaw) {
  writeFileSync(cargoTomlPath, cargoTomlNext, 'utf8');
}

// 5. src-tauri/Cargo.lock (root crate entry)
const cargoLockPath = resolve(rootDir, 'src-tauri/Cargo.lock');
const cargoLockRaw = readFileSync(cargoLockPath, 'utf8');
const cargoLockNext = cargoLockRaw.replace(
  /(\[\[package\]\]\r?\nname = "ict-smc-trading-panel"\r?\nversion = )"[^"]+"/,
  `$1"${targetVersion}"`,
);
if (cargoLockNext !== cargoLockRaw) {
  writeFileSync(cargoLockPath, cargoLockNext, 'utf8');
}

console.log(`Synced version ${targetVersion} across package.json, package-lock.json, Cargo.toml, Cargo.lock, and tauri.conf.json.`);
