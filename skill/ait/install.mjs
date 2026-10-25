#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const nodeMajor = Number(process.versions.node.split(".")[0]);

function fail(code, error, exitCode = 1) {
  process.stdout.write(`${JSON.stringify({ ok: false, code, error })}\n`);
  process.exit(exitCode);
}

if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  fail("NODE_VERSION_UNSUPPORTED", "Node.js 22 or newer is required.");
}

const argv = process.argv.slice(2);
let check = false;
let tarball = process.env.AIT_CORE_TARBALL ?? null;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--check") {
    check = true;
    continue;
  }
  if (arg === "--core-tarball") {
    tarball = argv[++i] ?? null;
    continue;
  }
  if (arg.startsWith("--core-tarball=")) {
    tarball = arg.slice("--core-tarball=".length);
    continue;
  }
  fail("USAGE_ERROR", `未知参数：${arg}`, 2);
}

const packageDir = path.join(skillDir, "node_modules", "ait-core");
const manifestPath = path.join(packageDir, "package.json");

function readInstalled() {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const rel = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.ait;
    if (manifest.name !== "ait-core" || typeof rel !== "string") return null;
    const bin = path.resolve(packageDir, rel);
    if (!fs.existsSync(bin)) return null;
    return { package: manifest.name, version: manifest.version, bin };
  } catch {
    return null;
  }
}

if (check) {
  const installed = readInstalled();
  if (!installed) fail("CORE_BIN_MISSING", "Installed ait-core package or bin is missing.");
  process.stdout.write(`${JSON.stringify({ ok: true, data: { skill_dir: skillDir, ...installed } })}\n`);
  process.exit(0);
}

if (!tarball) fail("CORE_TARBALL_REQUIRED", "Provide --core-tarball or set AIT_CORE_TARBALL.");
const resolvedTarball = path.resolve(process.cwd(), tarball);
if (!fs.existsSync(resolvedTarball)) fail("CORE_TARBALL_NOT_FOUND", `ait-core tarball was not found: ${resolvedTarball}`);

const npmCandidates = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
].filter((value) => typeof value === "string" && fs.existsSync(value));
const npmCli = npmCandidates[0];
const npmArgs = [
  "install", "--ignore-scripts", "--no-save", "--no-package-lock",
  "--prefix", skillDir, resolvedTarball,
];
const command = npmCli && /[\\/]npm-cli\.js$/i.test(npmCli)
  ? { file: process.execPath, args: [npmCli, ...npmArgs] }
  : process.platform === "win32"
    ? { file: "npm.cmd", args: npmArgs }
    : { file: "npm", args: npmArgs };
const result = spawnSync(command.file, command.args, {
  encoding: "utf8",
  windowsHide: true,
  cwd: skillDir,
});
if (result.error) fail("CORE_INSTALL_FAILED", result.error.message);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) fail("CORE_INSTALL_FAILED", `npm install exited with ${result.status ?? 1}`);

const installed = readInstalled();
if (!installed) fail("CORE_BIN_MISSING", "ait-core installed but its package bin was not found.");
process.stdout.write(`${JSON.stringify({ ok: true, data: { skill_dir: skillDir, ...installed } })}\n`);

