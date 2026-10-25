import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const distributionInstaller = resolve(here, '..', 'skill', 'ait', 'install.mjs');
const owners = [];
let coreTarball;
let npmCache;

function owner() {
  const root = mkdtempSync(join(tmpdir(), 'ait-installer-test-'));
  owners.push(root);
  return root;
}

function run(command, args, cwd, extra = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, npm_config_cache: npmCache, NPM_CONFIG_CACHE: npmCache, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', ...extra.env },
    input: extra.input ?? '',
  });
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  return result;
}

function json(result) {
  const text = result.stdout.trim();
  let value;
  try { value = JSON.parse(text); } catch { assert.fail(`stdout is not one JSON value: ${text}\nstderr: ${result.stderr}`); }
  assert.equal(text, JSON.stringify(value));
  return value;
}

function ok(result) {
  assert.equal(result.status, 0, result.stderr);
  const body = json(result);
  assert.equal(body.ok, true);
  return body.data;
}

function fail(result, code, status = 1) {
  assert.equal(result.status, status, result.stderr);
  const body = json(result);
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
  return body;
}

function fixture(root) {
  const skill = join(root, 'fixture source 空格', 'ait');
  mkdirSync(join(skill, 'bin'), { recursive: true });
  mkdirSync(join(skill, 'agents'));
  mkdirSync(join(skill, 'references'));
  mkdirSync(join(skill, 'sub-skills'));
  mkdirSync(join(skill, 'templates'));
  mkdirSync(join(skill, '.claude-plugin'));
  copyFileSync(distributionInstaller, join(skill, 'install.mjs'));
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: ait\ndescription: fixture\n---\n', 'utf8');
  writeFileSync(join(skill, 'README.md'), 'fixture\n', 'utf8');
  writeFileSync(join(skill, 'bin', 'ait'), '#!/bin/sh\n', { encoding: 'utf8', mode: 0o755 });
  writeFileSync(join(skill, 'bin', 'ait.cmd'), '@echo off\r\n', 'utf8');
  writeFileSync(join(skill, 'agents', 'fixture.md'), 'agent\n', 'utf8');
  writeFileSync(join(skill, 'references', 'fixture.md'), 'reference\n', 'utf8');
  writeFileSync(join(skill, 'sub-skills', 'fixture.md'), 'sub-skill\n', 'utf8');
  writeFileSync(join(skill, 'templates', 'fixture.md'), 'template\n', 'utf8');
  writeFileSync(join(skill, '.claude-plugin', 'plugin.json'), '{"name":"ait","version":"0.3.0"}\n', 'utf8');
  return skill;
}

function invoke(installer, command, prefix, backup, extra = [], options = {}) {
  return run(process.execPath, [installer, command, '--prefix', prefix, '--core-tarball', coreTarball, '--backup-dir', backup, ...extra], dirname(installer), options);
}

function makeTarball() {
  // Package the actual installed core with its actual dependencies. This tests
  // a real npm tarball install without depending on a user's registry cache.
  const req = createRequire(distributionInstaller);
  const packageRoot = (entry, name) => {
    let dir = dirname(entry);
    for (;;) {
      const manifest = join(dir, 'package.json');
      if (existsSync(manifest) && JSON.parse(readFileSync(manifest,'utf8')).name === name) return dir;
      const parent=dirname(dir);assert.notEqual(parent,dir,`Cannot find package ${name}`);dir=parent;
    }
  };
  const source = packageRoot(req.resolve('ait-core'),'ait-core');
  const root = owner();
  npmCache = join(root,'npm-cache');
  const staged = join(root,'core-package');
  cpSync(source,staged,{recursive:true});
  const manifest = JSON.parse(readFileSync(join(staged,'package.json'),'utf8'));
  assert.equal(manifest.version,'0.2.1');
  manifest.bundledDependencies=Object.keys(manifest.dependencies??{});
  const dependencyRequire=createRequire(join(source,'package.json'));
  for(const name of manifest.bundledDependencies){
    const dep=packageRoot(dependencyRequire.resolve(name),name);
    cpSync(dep,join(staged,'node_modules',name),{recursive:true});
  }
  writeFileSync(join(staged,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  const npmCli=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(dirname(process.execPath)),'lib/node_modules/npm/bin/npm-cli.js')].find(p=>p&&existsSync(p));
  assert.ok(npmCli,'npm-cli.js is required for real install validation');
  const result = run(process.execPath, [npmCli,'pack','--json','--ignore-scripts','--pack-destination',root], staged);
  assert.equal(result.status, 0, result.stderr);
  const [packed] = JSON.parse(result.stdout);
  assert.deepEqual(new Set(packed.bundled),new Set(manifest.bundledDependencies));
  const tarball = join(root, packed.filename);
  assert.equal(existsSync(tarball), true);
  return tarball;
}

before(() => { coreTarball = makeTarball(); });

after(() => {
  for (const root of owners.reverse()) {
    assert.equal(realpathSync(dirname(root)).toLowerCase(), realpathSync(tmpdir()).toLowerCase());
    assert.ok(relative(dirname(root),root).startsWith('ait-installer-test-'));
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    rmSync(root, { recursive: true, force: true });
  }
});

test('real offline tarball install, check, update, and recoverable uninstall', { timeout: 240_000 }, () => {
  const root = owner();
  const source = fixture(root);
  const installer = join(source, 'install.mjs');
  const prefix = join(root, 'installed 技能', 'ait');
  const backup = join(root, 'backups');

  const installed = ok(invoke(installer, 'install', prefix, backup, [], { input: 'must-not-be-read\n' }));
  assert.deepEqual({ action: installed.action, skillVersion: installed.skillVersion, version: installed.version }, { action: 'install', skillVersion: '0.3.0', version: '0.2.1' });
  assert.equal(installed.metadata, '.ait-install.json');
  assert.equal(existsSync(join(prefix, 'node_modules', 'ait-core', 'package.json')), true);
  assert.equal(existsSync(join(prefix, 'project-docs')), false);
  assert.equal(existsSync(join(prefix, '.venv')), false);
  fail(invoke(installer,'install',prefix,backup),'TARGET_EXISTS');

  const checked = ok(run(process.execPath, [installer, 'check', '--prefix', prefix], root));
  assert.deepEqual({ installed: checked.installed, managed: checked.managed, valid: checked.valid, skillVersion: checked.skillVersion, version: checked.version }, { installed: true, managed: true, valid: true, skillVersion: '0.3.0', version: '0.2.1' });

  writeFileSync(join(prefix, 'custom-user-file.txt'), Buffer.from([0, 1, 2, 255]));
  const updated = ok(invoke(installer, 'update', prefix, backup));
  assert.equal(updated.action, 'update');
  assert.equal(readFileSync(join(updated.backup, 'custom-user-file.txt')).toString('hex'), '000102ff');
  assert.equal(updated.backup.startsWith(backup), true);

  const removed = ok(run(process.execPath, [installer, 'uninstall', '--prefix', prefix, '--backup-dir', backup], root));
  assert.equal(removed.recoverable, true);
  assert.equal(existsSync(prefix), false);
  assert.equal(existsSync(join(removed.backup, '.ait-install.json')), true);
});

test('failed staging leaves an existing managed installation byte-for-byte intact', { timeout: 240_000 }, () => {
  const root = owner();
  const installer = join(fixture(root), 'install.mjs');
  const prefix = join(root, 'target', 'ait');
  const backup = join(root, 'backups');
  ok(invoke(installer, 'install', prefix, backup));
  const marker = join(prefix, 'custom.bin');
  writeFileSync(marker, Buffer.from([9, 8, 7, 6]));
  const bad = join(root, 'bad.tgz');
  const before = snapshot(prefix);
  writeFileSync(bad, 'not a tarball\n', 'utf8');
  const result = run(process.execPath, [installer, 'update', '--prefix', prefix, '--core-tarball', bad, '--backup-dir', backup], root);
  fail(result, 'CORE_INSTALL_FAILED');
  assert.equal(readFileSync(marker).toString('hex'), '09080706');
  assert.equal(existsSync(join(prefix, '.ait-install.json')), true);
  assert.deepEqual(snapshot(prefix),before);
  assert.equal(readdirSync(dirname(prefix)).some(name=>name.startsWith('.ait-stage-')),false,'failed staging must be cleaned');
});

test('legacy replacement is explicit and preserves Python/custom bytes in backup', { timeout: 240_000 }, () => {
  const root = owner();
  const installer = join(fixture(root), 'install.mjs');
  const prefix = join(root, 'legacy', 'ait');
  const backup = join(root, 'backups');
  mkdirSync(join(prefix, 'bin'), { recursive: true });
  mkdirSync(join(prefix, '.venv'));
  writeFileSync(join(prefix, 'SKILL.md'), '---\nname: ait\n---\n', 'utf8');
  writeFileSync(join(prefix, 'bin', 'ait.cmd'), '@echo off\r\n', 'utf8');
  writeFileSync(join(prefix, 'pyproject.toml'), '[project]\nname="ait"\n', 'utf8');
  writeFileSync(join(prefix, 'custom.txt'), 'keep me exactly\r\n', 'utf8');

  fail(invoke(installer, 'update', prefix, backup), 'NOT_MANAGED');
  const updated = ok(invoke(installer, 'update', prefix, backup, ['--replace-legacy']));
  assert.equal(updated.replacedLegacy, true);
  assert.equal(readFileSync(join(updated.backup, 'custom.txt'), 'utf8'), 'keep me exactly\r\n');
  assert.equal(existsSync(join(updated.backup, '.venv')), true);
  assert.equal(existsSync(join(prefix, '.venv')), false);
  assert.equal(existsSync(join(prefix, 'pyproject.toml')), false);
});

test('unknown targets, dangerous prefixes, symlinks, argument conflicts, and cross-device backup are rejected', { timeout: 240_000 }, () => {
  const root = owner();
  const installer = join(fixture(root), 'install.mjs');
  const backup = join(root, 'backups');
  const unknown = join(root, 'unknown', 'ait');
  mkdirSync(unknown, { recursive: true });
  writeFileSync(join(unknown, 'note.txt'), 'not AIT\n', 'utf8');
  fail(invoke(installer, 'update', unknown, backup, ['--replace-legacy']), 'NOT_MANAGED');
  assert.equal(readFileSync(join(unknown, 'note.txt'), 'utf8'), 'not AIT\n');

  fail(run(process.execPath, [installer, 'install'], root), 'USAGE_ERROR', 2);
  fail(run(process.execPath, [installer, 'check', '--prefix', join(root, 'x'), '--core-tarball', coreTarball], root), 'USAGE_ERROR', 2);
  fail(run(process.execPath, [installer, 'install', '--prefix', parse(root).root, '--core-tarball', coreTarball], root), 'UNSAFE_PREFIX');
  fail(run(process.execPath, [installer, 'install', '--prefix', join(root, 'project', 'ait'), '--core-tarball', coreTarball], (() => { mkdirSync(join(root, 'project', '.git'), { recursive: true }); return root; })()), 'UNSAFE_PREFIX');

  const real = join(root, 'real-parent');
  const linked = join(root, 'linked-parent');
  mkdirSync(real);
  try {
    symlinkSync(real, linked, process.platform === 'win32' ? 'junction' : 'dir');
    fail(run(process.execPath, [installer, 'install', '--prefix', join(linked, 'ait'), '--core-tarball', coreTarball], root), 'UNSAFE_PREFIX');
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    assert.match(readFileSync(installer, 'utf8'), /isSymbolicLink\(\).*UNSAFE_PREFIX/s);
  }

  if (process.platform === 'win32') {
    const legacy=join(root,'cross','ait');mkdirSync(join(legacy,'bin'),{recursive:true});
    writeFileSync(join(legacy,'SKILL.md'),'---\nname: ait\n---\n');writeFileSync(join(legacy,'bin','ait.cmd'),'@echo off\r\n');writeFileSync(join(legacy,'pyproject.toml'),'legacy');
    const other=parse(root).root.toLowerCase()==='c:\\'?'D:\\ait-installer-backup-test':'C:\\ait-installer-backup-test';
    const before=snapshot(legacy);
    fail(invoke(installer,'update',legacy,other,['--replace-legacy']),'BACKUP_CROSS_DEVICE');
    assert.deepEqual(snapshot(legacy),before);
  }
});

function snapshot(root) {
  const result={};
  const walk=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){const f=join(dir,item.name);if(item.isDirectory())walk(f);else if(item.isFile())result[relative(root,f)]=createHash('sha256').update(readFileSync(f)).digest('hex');}};
  walk(root);return result;
}

test('check reports modified owned assets and remains read-only', {timeout:240000}, () => {
 const root=owner(),installer=join(fixture(root),'install.mjs'),prefix=join(root,'target','ait'),backup=join(root,'backups');
 ok(invoke(installer,'install',prefix,backup));
 writeFileSync(join(prefix,'README.md'),'customized\n');
 const before=snapshot(prefix);
 const result=ok(run(process.execPath,[installer,'check','--prefix',prefix],root));
 assert.equal(result.valid,false);assert.ok(result.assetMismatches.includes('README.md'));
 assert.deepEqual(snapshot(prefix),before);
});

test('check rejects an installed core bin reached through a directory link', {timeout:240000}, () => {
 const root=owner(),installer=join(fixture(root),'install.mjs'),prefix=join(root,'target','ait'),backup=join(root,'backups');
 ok(invoke(installer,'install',prefix,backup));
 const dist=join(prefix,'node_modules','ait-core','dist'),outside=join(root,'external-dist');
 renameSync(dist,outside);
 symlinkSync(outside,dist,process.platform==='win32'?'junction':'dir');
 const before=snapshot(root);
 fail(run(process.execPath,[installer,'check','--prefix',prefix],root),'CORE_BIN_MISSING');
 assert.deepEqual(snapshot(root),before);
 assert.equal(lstatSync(dist).isSymbolicLink(),true);
});
