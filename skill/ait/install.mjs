#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const nodeMajor = Number(process.versions.node.split(".")[0]);
const metadataName = ".ait-install.json";
let skillVersion;
const requiredCoreVersion = "0.2.1";
const assetNames = [
  "SKILL.md", "README.md", "install.mjs", "bin", "agents", "references",
  "sub-skills", "templates", ".claude-plugin",
];

function output(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(exitCode);
}

function fail(code, error, details, exitCode = 1) {
  throw Object.assign(new Error(error), { code, details, exitCode });
}

function parseArgs(args) {
  const commands = new Set(["install", "update", "uninstall", "check"]);
  let command = null;
  let legacy = false;
  let prefix = null;
  let tarball = process.env.AIT_CORE_TARBALL || null;
  let explicitTarball = false;
  let backupDir = null;
  let replaceLegacy = false;
  let oldCheck = false;
  let i = 0;
  if (commands.has(args[0])) {
    command = args[0];
    i = 1;
  } else {
    legacy = true;
  }
  for (; i < args.length; i += 1) {
    const arg = args[i];
    const take = (name) => {
      const value = args[++i];
      if (!value || value.startsWith("--")) fail("USAGE_ERROR", `${name} requires a value.`, undefined, 2);
      return value;
    };
    if (arg === "--prefix") prefix = take("--prefix");
    else if (arg.startsWith("--prefix=")) prefix = arg.slice(9);
    else if (arg === "--core-tarball") { tarball = take("--core-tarball"); explicitTarball = true; }
    else if (arg.startsWith("--core-tarball=")) { tarball = arg.slice(15); explicitTarball = true; }
    else if (arg === "--backup-dir") backupDir = take("--backup-dir");
    else if (arg.startsWith("--backup-dir=")) backupDir = arg.slice(13);
    else if (arg === "--replace-legacy") replaceLegacy = true;
    else if (arg === "--check" && legacy) oldCheck = true;
    else fail("USAGE_ERROR", `Unknown or contradictory argument: ${arg}`, undefined, 2);
  }
  if (legacy) {
    if (prefix !== null || backupDir !== null || replaceLegacy || (oldCheck && explicitTarball)) {
      fail("USAGE_ERROR", "Legacy --check is read-only and cannot be combined with change options.", undefined, 2);
    }
    if (oldCheck) return { command: "check", prefix: sourceDir, legacy: true };
    return { command: "legacy-install", prefix: sourceDir, tarball, legacy: true };
  }
  if (!prefix || !prefix.trim()) fail("USAGE_ERROR", `${command} requires a nonempty --prefix.`, undefined, 2);
  if (command === "check" && (explicitTarball || backupDir || replaceLegacy)) {
    fail("USAGE_ERROR", "check is read-only and cannot be combined with change options.", undefined, 2);
  }
  if (command === "uninstall" && (explicitTarball || replaceLegacy)) {
    fail("USAGE_ERROR", "uninstall does not accept --core-tarball or --replace-legacy.", undefined, 2);
  }
  if (command === "install" && replaceLegacy) {
    fail("USAGE_ERROR", "--replace-legacy is only valid with update.", undefined, 2);
  }
  return { command, prefix: path.resolve(process.cwd(), prefix), tarball, backupDir, replaceLegacy, legacy: false };
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isInside(candidate, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function assertNoLinks(location) {
  let cursor = path.resolve(location);
  for (;;) {
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) fail("UNSAFE_PREFIX", `Path contains a symlink or junction: ${cursor}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function assertSafePrefix(prefix) {
  if (!prefix || !path.isAbsolute(prefix)) fail("UNSAFE_PREFIX", "Prefix must resolve to an absolute path.");
  const root = path.parse(prefix).root;
  if (samePath(prefix, root) || samePath(prefix, os.homedir())) fail("UNSAFE_PREFIX", "Refusing a volume root or user home as prefix.");
  if (isInside(prefix, sourceDir) || isInside(sourceDir, prefix)) fail("UNSAFE_PREFIX", "Prefix cannot be the installer source, its ancestor, or its descendant.");
  assertNoLinks(prefix);

  let cursor = prefix;
  for (;;) {
    if (fs.existsSync(cursor)) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) fail("UNSAFE_PREFIX", `Prefix path contains a symlink or junction: ${cursor}`);
      if (fs.existsSync(path.join(cursor, "project-docs")) || fs.existsSync(path.join(cursor, ".git"))) {
        fail("UNSAFE_PREFIX", `Prefix is inside a project/repository boundary: ${cursor}`);
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walkFiles(root, relative = "") {
  const current = path.join(root, relative);
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) fail("SOURCE_SYMLINK", `Distribution source contains a symlink: ${current}`);
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory()) fail("SOURCE_INVALID", `Distribution asset is not a regular file or directory: ${current}`);
  const result = [];
  for (const entry of fs.readdirSync(current)) {
    if (["node_modules", ".venv", "__pycache__", "build", ".git", ".npm"].includes(entry) || /\.(py|pyc|pyo)$/.test(entry)) continue;
    const child = path.join(relative, entry);
    result.push(...walkFiles(root, child));
  }
  return result;
}

function copyDistribution(destination) {
  const manifest = {};
  for (const name of assetNames) {
    const from = path.join(sourceDir, name);
    if (!fs.existsSync(from)) fail("SOURCE_INVALID", `Missing distribution asset: ${name}`);
    const top = fs.lstatSync(from);
    if (top.isSymbolicLink()) fail("SOURCE_SYMLINK", `Distribution source contains a symlink: ${from}`);
    for (const rel of walkFiles(sourceDir, name)) {
      const src = path.join(sourceDir, rel);
      const dst = path.join(destination, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      let bytes = fs.readFileSync(src);
      if (rel.split(path.sep).join("/") === "bin/ait") bytes = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
      fs.writeFileSync(dst, bytes, { mode: fs.statSync(src).mode });
      if (rel.split(path.sep).join("/") === "bin/ait" && process.platform !== "win32") fs.chmodSync(dst, 0o755);
      manifest[rel.split(path.sep).join("/")] = crypto.createHash("sha256").update(bytes).digest("hex");
    }
  }
  return manifest;
}

function resolveTarball(value) {
  if (!value) fail("CORE_TARBALL_REQUIRED", "Provide --core-tarball or set AIT_CORE_TARBALL.");
  const resolved = path.resolve(process.cwd(), value);
  let stat;
  try { stat = fs.lstatSync(resolved); } catch { fail("CORE_TARBALL_NOT_FOUND", `ait-core tarball was not found: ${resolved}`); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail("CORE_TARBALL_NOT_FOUND", `ait-core tarball must be a regular file: ${resolved}`);
  return resolved;
}

function findNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  return candidates.find((candidate) => candidate && /npm-cli\.js$/i.test(candidate) && fs.existsSync(candidate)) || null;
}

function readCore(prefix, verifyImport = false) {
  const packageDir = path.join(prefix, "node_modules", "ait-core");
  const manifestPath = path.join(packageDir, "package.json");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { fail("CORE_BIN_MISSING", "Installed ait-core package manifest is missing or invalid."); }
  const rel = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.ait;
  if (manifest.name !== "ait-core" || typeof manifest.version !== "string" || !manifest.version || typeof rel !== "string") {
    fail("CORE_BIN_MISSING", "Installed package is not a valid ait-core package with bin.ait.");
  }
  const bin = path.resolve(packageDir, rel);
  if (!isInside(bin, packageDir)) fail("CORE_BIN_MISSING", "ait-core bin points outside its package.");
  let stat;
  try {
    assertNoLinks(bin);
    stat = fs.lstatSync(bin);
    if (!isInside(fs.realpathSync(bin), fs.realpathSync(packageDir))) fail("CORE_BIN_MISSING", "ait-core bin resolves outside its package.");
    fs.accessSync(bin, fs.constants.R_OK);
  } catch { fail("CORE_BIN_MISSING", "ait-core bin is missing, linked, or unreadable."); }
  if (!stat.isFile()) fail("CORE_BIN_MISSING", "ait-core bin is not a regular file.");
  if (verifyImport) {
    const script = "const {createRequire}=await import('node:module');const {pathToFileURL}=await import('node:url');const r=createRequire(process.argv[1]);const m=await import(pathToFileURL(r.resolve('ait-core')).href);if(typeof m.createCoreApi!=='function'||typeof m.dispatch!=='function')process.exit(1);";
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, path.join(prefix, "probe.mjs")], { cwd: prefix, encoding: "utf8", windowsHide: true, timeout: 30000 });
    if (result.error || result.status !== 0) fail("CORE_BIN_MISSING", "ait-core public API or its dependencies cannot be imported.");
  }
  return { package: manifest.name, version: manifest.version, bin };
}

function installCore(prefix, tarball) {
  const npmCli = findNpmCli();
  if (!npmCli) fail("CORE_INSTALL_FAILED", "Unable to locate npm-cli.js for the current Node installation.");
  const args = [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", "--no-package-lock", "--prefix", prefix, tarball];
  const result = spawnSync(process.execPath, args, { cwd: prefix, encoding: "utf8", windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) fail("CORE_INSTALL_FAILED", result.error?.message || `npm install exited with ${result.status ?? 1}`);
  const core = readCore(prefix, true);
  if (core.version !== requiredCoreVersion) {
    fail("CORE_INSTALL_FAILED", `ait-core ${requiredCoreVersion} is required, but the tarball installed ${core.version}.`);
  }
  const probe = spawnSync(process.execPath, [core.bin, "--version"], { cwd: prefix, encoding: "utf8", windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  if (probe.stdout) process.stderr.write(probe.stdout);
  if (probe.stderr) process.stderr.write(probe.stderr);
  let probeResult;
  try { probeResult = JSON.parse(probe.stdout); } catch { fail("CORE_INSTALL_FAILED", "ait-core --version returned invalid JSON."); }
  if (probe.error || probe.status !== 0 || probeResult.ok !== true) fail("CORE_INSTALL_FAILED", probe.error?.message || `ait-core --version exited with ${probe.status ?? 1}`);
  return core;
}

function readMetadata(prefix) {
  try { return JSON.parse(fs.readFileSync(path.join(prefix, metadataName), "utf8")); } catch { return null; }
}

function verifyManaged(prefix) {
  const metadata = readMetadata(prefix);
  if (!metadata || metadata.schemaVersion !== 1 || metadata.kind !== "ait-skills" || !metadata.assets || Array.isArray(metadata.assets) || typeof metadata.assets !== "object" || !Object.hasOwn(metadata.assets, "SKILL.md") || !Object.hasOwn(metadata.assets, "install.mjs")) {
    fail("NOT_MANAGED", `Target is not managed by this installer (${metadataName} missing or invalid).`);
  }
  const mismatches = [];
  for (const [rel, expected] of Object.entries(metadata.assets)) {
    if (path.isAbsolute(rel) || rel.includes('\\') || rel.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(expected)) fail("NOT_MANAGED", "Invalid asset manifest path or hash.");
    const file = path.join(prefix, ...rel.split("/"));
    try {
      assertNoLinks(file);
      if (!fs.statSync(file).isFile() || sha256(file) !== expected) mismatches.push(rel);
    } catch { mismatches.push(rel); }
  }
  return { metadata, mismatches };
}

function isLegacyAit(prefix) {
  try {
    const skill = fs.readFileSync(path.join(prefix, "SKILL.md"), "utf8");
    const hasName = /(^|\n)name:\s*ait\s*($|\n)/i.test(skill);
    const hasBin = fs.existsSync(path.join(prefix, "bin", "ait")) || fs.existsSync(path.join(prefix, "bin", "ait.cmd"));
    const hasPython = fs.existsSync(path.join(prefix, "pyproject.toml")) || fs.existsSync(path.join(prefix, ".venv")) || fs.existsSync(path.join(prefix, "ait"));
    return hasName && hasBin && hasPython;
  } catch { return false; }
}

function backupRootFor(options) {
  const root = path.resolve(process.cwd(), options.backupDir || path.join(os.homedir(), ".ait-skills-backups"));
  if (isInside(root, options.prefix) || isInside(options.prefix, root)) fail("UNSAFE_BACKUP_DIR", "Backup directory must be outside the installation tree.");
  if (isInside(root, sourceDir) || isInside(sourceDir, root) || root.split(path.sep).some(part => part.toLowerCase() === "skills")) fail("UNSAFE_BACKUP_DIR", "Backup directory must be outside source and host skill discovery roots.");
  assertNoLinks(root);
  if (path.parse(root).root.toLowerCase() !== path.parse(options.prefix).root.toLowerCase()) {
    fail("BACKUP_CROSS_DEVICE", "Backup directory must be on the same filesystem as the prefix; the old installation was preserved.");
  }
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function uniqueBackup(root, prefix) {
  const safe = path.basename(prefix).replace(/[^A-Za-z0-9._-]/g, "_") || "ait";
  for (let i = 0; i < 20; i += 1) {
    const candidate = path.join(root, `${safe}-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  fail("BACKUP_CONFLICT", "Unable to allocate a unique backup directory.");
}

function makeStage(prefix) {
  const parent = path.dirname(prefix);
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, ".ait-stage-"));
}

function cleanupStage(stageRoot, prefix) {
  if (!samePath(path.dirname(stageRoot), path.dirname(prefix)) || !path.basename(stageRoot).startsWith('.ait-stage-') || fs.lstatSync(stageRoot).isSymbolicLink()) throw Error('Unsafe staging cleanup');
  fs.rmSync(stageRoot, { recursive: true, force: true });
}

function createStaged(prefix, tarball) {
  const stageRoot = makeStage(prefix);
  const staged = path.join(stageRoot, "ait");
  fs.mkdirSync(staged);
  try {
    const assets = copyDistribution(staged);
    const core = installCore(staged, tarball);
    const metadata = { schemaVersion: 1, kind: "ait-skills", skillVersion, coreVersion: core.version, installedAt: new Date().toISOString(), assets };
    fs.writeFileSync(path.join(staged, metadataName), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    return { stageRoot, staged, core };
  } catch (error) {
    cleanupStage(stageRoot, prefix);
    throw error;
  }
}

function main() {
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) fail("NODE_VERSION_UNSUPPORTED", "Node.js 22 or newer is required.");
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, '.claude-plugin/plugin.json'), 'utf8'));
  if (manifest.name !== 'ait' || !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(manifest.version)) throw Error('Invalid manifest');
  skillVersion = manifest.version;
} catch { fail('SOURCE_INVALID', 'Missing or invalid distribution plugin manifest.'); }
const options = parseArgs(process.argv.slice(2));

if (options.command === "legacy-install") {
  const tarball = resolveTarball(options.tarball);
  const core = installCore(sourceDir, tarball);
  output({ ok: true, data: { skill_dir: sourceDir, ...core } });
}

if (options.command === "check") {
  const prefix = options.prefix;
  if (options.legacy) {
    const core = readCore(prefix, true);
    output({ ok: true, data: { skill_dir: prefix, node: process.versions.node, installed: true, managed: Boolean(readMetadata(prefix)), ...core } });
  }
  assertSafePrefix(prefix);
  if (!fs.existsSync(prefix)) output({ ok: true, data: { prefix, node: process.versions.node, installed: false, managed: false } });
  const { metadata, mismatches } = verifyManaged(prefix);
  const core = readCore(prefix, true);
  output({ ok: true, data: { prefix, node: process.versions.node, installed: true, managed: true, valid: mismatches.length === 0 && core.version === metadata.coreVersion, skillVersion: metadata.skillVersion, metadata: metadataName, assetMismatches: mismatches, ...core } });
}

assertSafePrefix(options.prefix);

if (options.command === "install") {
  if (fs.existsSync(options.prefix)) fail("TARGET_EXISTS", "Target already exists; use update to replace a managed installation.");
  const tarball = resolveTarball(options.tarball);
  const staged = createStaged(options.prefix, tarball);
  try { fs.renameSync(staged.staged, options.prefix); } catch (error) { cleanupStage(staged.stageRoot, options.prefix); fail("INSTALL_SWITCH_FAILED", `Unable to activate staged installation: ${error.message}`); }
  cleanupStage(staged.stageRoot, options.prefix);
  const core = readCore(options.prefix, true);
  output({ ok: true, data: { action: "install", prefix: options.prefix, skillVersion, metadata: metadataName, ...core } });
}

if (options.command === "update") {
  if (!fs.existsSync(options.prefix)) fail("TARGET_NOT_FOUND", "Target does not exist; use install.");
  const managed = Boolean(readMetadata(options.prefix));
  if (managed) verifyManaged(options.prefix);
  else if (!options.replaceLegacy || !isLegacyAit(options.prefix)) fail("NOT_MANAGED", "Target is neither managed nor a recognizable legacy AIT installation; no files were changed.");
  const tarball = resolveTarball(options.tarball);
  const root = backupRootFor(options);
  const backup = uniqueBackup(root, options.prefix);
  const staged = createStaged(options.prefix, tarball);
  try {
    fs.renameSync(options.prefix, backup);
    try { fs.renameSync(staged.staged, options.prefix); }
    catch (error) {
      try { fs.renameSync(backup, options.prefix); }
      catch (recovery) { fail('INSTALL_RECOVERY_FAILED', `New installation could not be activated and automatic restore failed: ${recovery.message}`, { backup, prefix: options.prefix, cause: error.message }); }
      throw error;
    }
  } catch (error) {
    cleanupStage(staged.stageRoot, options.prefix);
    if (error.code === 'INSTALL_RECOVERY_FAILED') throw error;
    fail("INSTALL_SWITCH_FAILED", `Update switch failed; the old installation was preserved or restored: ${error.message}`);
  }
  cleanupStage(staged.stageRoot, options.prefix);
  const core = readCore(options.prefix, true);
  output({ ok: true, data: { action: "update", prefix: options.prefix, backup, backupPreservesCustomFiles: true, replacedLegacy: !managed, skillVersion, metadata: metadataName, ...core, note: "Existing project wrappers that point to an old path must be refreshed through the new AIT entry." } });
}

if (options.command === "uninstall") {
  if (!fs.existsSync(options.prefix)) fail("TARGET_NOT_FOUND", "Target does not exist.");
  verifyManaged(options.prefix);
  const root = backupRootFor(options);
  const backup = uniqueBackup(root, options.prefix);
  try { fs.renameSync(options.prefix, backup); }
  catch (error) { fail("UNINSTALL_FAILED", `Unable to move the installation to backup; no recursive deletion was attempted: ${error.message}`); }
  output({ ok: true, data: { action: "uninstall", prefix: options.prefix, backup, recoverable: true, backupPreservesCustomFiles: true } });
}

fail("USAGE_ERROR", "No supported command was selected.", undefined, 2);
}

try { main(); }
catch (error) {
  const result = { ok: false, code: error.code || 'INSTALL_FAILED', error: error.message };
  if (error.details !== undefined) result.details = error.details;
  output(result, error.exitCode ?? 1);
}
