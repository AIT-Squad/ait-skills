import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const skill = join(repo, 'skill', 'ait');
const requireFromInstaller = createRequire(join(skill, 'install.mjs'));
const yaml = requireFromInstaller('yaml');
let corePackage = requireFromInstaller.resolve('ait-core');
while (!existsSync(join(corePackage, 'package.json'))) {
  const parent = dirname(corePackage);
  assert.notEqual(parent, corePackage, 'ait-core package.json not found');
  corePackage = parent;
}
corePackage = join(corePackage, 'package.json');
const coreManifest = JSON.parse(readFileSync(corePackage, 'utf8'));
const coreEntry = requireFromInstaller.resolve('ait-core');
const { createCoreApi } = await import(pathToFileURL(coreEntry));
const owned = [];
const deliveryDirs = new Set();
const pathKey = value => process.platform === 'win32' ? normalize(value).toLowerCase() : normalize(value);

function removeOwnedDirectory(dir, prefix) {
  const base = realpathSync(tmpdir());
  assert.equal(pathKey(realpathSync(dirname(dir))), pathKey(base));
  const leaf = relative(dirname(dir), dir);
  assert.ok(leaf.startsWith(prefix) && !leaf.includes('/') && !leaf.includes('\\'));
  assert.equal(lstatSync(dir).isSymbolicLink(), false);
  rmSync(dir, { recursive: true, force: true });
}

after(() => {
  for (const dir of deliveryDirs) {
    removeOwnedDirectory(dir, 'ait-codegen-');
  }
  for (const dir of owned.reverse()) {
    removeOwnedDirectory(dir, 'ait-skills-test-');
  }
});

function tempProject() {
  const owner = mkdtempSync(join(tmpdir(), 'ait-skills-test-'));
  owned.push(owner);
  const dir = join(owner, '项目 !验收');
  mkdirSync(dir);
  return dir;
}

function filesUnder(root, skipNodeModules = true) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (skipNodeModules && entry.name === 'node_modules') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(path, skipNodeModules));
    else result.push(path);
  }
  return result;
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? yaml.parse(match[1]) : null;
}

function links(text) {
  return [...text.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)]+)\)/g)].map((m) => m[1].split('#')[0]);
}

function progress(stderr) {
  for (const line of stderr.split(/\r?\n/).filter(Boolean)) {
    const event = JSON.parse(line);
    assert.deepEqual(Object.keys(event).sort(), ['operation', 'operationId', 'stage', 'status']);
    assert.equal(typeof event.operation, 'string');
    assert.ok(event.operation.length && typeof event.operationId === 'string' && event.operationId.length);
    assert.ok(['read','validate','assemble','write_bundle','register_delivery','acceptance','git','persist'].includes(event.stage));
    assert.ok(['started','completed','failed'].includes(event.status));
  }
}

function run(command, args, cwd, extra = {}) {
  const r = runRaw(command, args, cwd, extra);
  const stdout = r.stdout.trim();
  let body;
  try { body = JSON.parse(stdout); } catch { assert.fail(`stdout is not one JSON value: ${stdout}\nstderr: ${r.stderr}`); }
  assert.equal(stdout, JSON.stringify(body), 'stdout must contain exactly one compact JSON value');
  progress(r.stderr);
  return { ...r, body };
}

function runRaw(command, args, cwd, extra = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024, ...extra });
  if (result.error) throw result.error;
  assert.equal(result.signal, null, `Child interrupted: ${command}`);
  return result;
}

function wrapper(entry, args, project, raw = false) {
  const execute = raw ? runRaw : run;
  const env = { ...process.env };
  delete env.AIT_CORE_BIN;
  if (process.platform !== 'win32') return execute(entry, args, project, { env });
  const parameters = [entry, ...args].map((arg, index) => {
    assert.doesNotMatch(arg, /["\0\r\n]/, 'CMD fixture arguments use files for multiline content');
    const name = `AIT_SKILLS_TEST_ARG_${index}`;
    env[name] = arg.replace(/(\\+)$/, '$1$1');
    return `"!${name}!"`;
  });
  return execute(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/v:on', '/c', `"${parameters.join(' ')}"`], project, {
    windowsVerbatimArguments: true, env,
  });
}

function cli(project, ...args) {
  const bin = process.platform === 'win32'
    ? join(project, 'project-docs', '.ait', 'ait-cli.cmd')
    : join(project, 'project-docs', '.ait', 'ait-cli');
  return wrapper(bin, args, project);
}

function cliRaw(project, ...args) {
  const bin = process.platform === 'win32'
    ? join(project, 'project-docs', '.ait', 'ait-cli.cmd')
    : join(project, 'project-docs', '.ait', 'ait-cli');
  const result = wrapper(bin, args, project, true);
  progress(result.stderr);
  return result;
}

function snapshot(root, includeModules = false) {
  return new Map(filesUnder(root, !includeModules).sort().map(file => [relative(root, file),
    lstatSync(file).isSymbolicLink() ? `link:${readlinkSync(file)}` : createHash('sha256').update(readFileSync(file)).digest('hex')]));
}

function managedSnapshot(project) {
  return Object.fromEntries(['docs','.meta','versions'].map(name => {
    const directory = join(project, 'project-docs', name);
    return [name, existsSync(directory) ? snapshot(directory) : null];
  }));
}

function deliver(project) {
  const result = ok(cli(project, 'codegen', 'prepare', '[TDD]-smoke', '--version', 'v0.1'));
  deliveryDirs.add(dirname(result.bundle_path));
  const rel = relative(project, result.bundle_path);
  assert.ok(isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../'), 'bundle must be outside the complete host project');
  const bytes = readFileSync(result.bundle_path);
  assert.equal(bytes.length, result.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), result.sha256);
  assert.match(bytes.toString('utf8'), /^target_file: "hello.mjs"$/m);
  return result;
}

function ok(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true, JSON.stringify(result.body));
  return result.body.data;
}

function fail(result, code) {
  assert.equal(result.status, 1);
  assert.equal(result.body.ok, false);
  if (code) assert.equal(result.body.code, code);
  return result.body;
}

function fill(name) {
  return readFileSync(join(skill, 'templates', name), 'utf8')
    .replaceAll('{semantic_name}', 'smoke')
    .replaceAll('{requirement_name}', 'behavior')
    .replaceAll('{split_name}', 'feature')
    .replaceAll('{target_file}', 'hello.mjs')
    .replaceAll('{test_command}', 'node hello.mjs')
    .replaceAll(/\{[^}\r\n]+\}/g, '可执行验收正文');
}

test('distributed assets, manifests, links and runtime are internally complete', () => {
  const packageJson = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.deepEqual({ name: packageJson.name, version: packageJson.version, private: packageJson.private, type: packageJson.type }, { name: 'ait-skills', version: '0.3.0', private: true, type: 'module' });
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.mjs');
  assert.match(packageJson.engines.node, />=22/);
  assert.equal(coreManifest.version, '0.2.1');
  assert.equal(coreManifest.name, 'ait-core');
  const binRel = typeof coreManifest.bin === 'string' ? coreManifest.bin : coreManifest.bin.ait;
  assert.ok(existsSync(resolve(dirname(corePackage), binRel)));
  assert.equal(typeof createCoreApi, 'function');

  const plugin = JSON.parse(readFileSync(join(skill, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'ait');
  assert.equal(plugin.version, '0.3.0');
  for (const field of ['skills', 'agents']) {
    assert.ok(Array.isArray(plugin[field]) && plugin[field].length);
    for (const item of plugin[field]) {
      assert.match(item, /^\.\//);
      const target = resolve(skill, item);
      assert.ok(!relative(skill, target).startsWith('..'));
      assert.ok(existsSync(field === 'skills' ? join(target, 'SKILL.md') : target));
    }
  }

  for (const path of filesUnder(skill)) {
    const rel = relative(skill, path).replaceAll('\\', '/');
    if (!/\.(md|mjs|cmd)$/.test(rel) && rel !== 'bin/ait') continue;
    const text = readFileSync(path, 'utf8');
    assert.equal(text.includes('{{AIT_ENTRY}}'), false, rel);
    if (rel.endsWith('SKILL.md') || rel.startsWith('agents/')) {
      const fm = frontmatter(text);
      assert.equal(typeof fm?.name, 'string', rel);
      assert.equal(typeof fm?.description, 'string', rel);
    }
    for (const link of links(text)) assert.ok(existsSync(resolve(dirname(path), decodeURIComponent(link))), `${rel}: broken ${link}`);
  }
  for (const required of ['install.mjs', 'bin/ait', 'bin/ait.cmd', 'agents/codegen-generator.md']) assert.ok(existsSync(join(skill, required)));
});

test('every distributed target has one TDD owner, preserving declared path case', async () => {
  const old = process.cwd();
  process.chdir(repo);
  const core = createCoreApi();
  process.chdir(old);
  const versions = await core.version.list();
  assert.equal(versions.ok, true);
  const active = versions.data.versions.filter(item => !item.merged);
  assert.ok(active.length <= 1);
  const selected = active[0]?.version ?? 'baseline';
  const graph = await core.graph.export(active[0] ? { version: selected } : undefined);
  assert.equal(graph.ok, true);
  const effective = new Map();
  const tddFiles = [
    ...filesUnder(join(repo, 'project-docs', 'docs', 'tdd'), false),
    ...(active[0] && existsSync(join(repo, 'project-docs', 'versions', selected, 'tdd'))
      ? filesUnder(join(repo, 'project-docs', 'versions', selected, 'tdd'), false) : []),
  ];
  for (const path of tddFiles) {
    const text = readFileSync(path, 'utf8');
    const id = text.match(/<!--\s*@id:([^\s]+)\s*-->/)?.[1];
    const declaration = text.match(/```yaml\r?\n([\s\S]*?)\r?\n```/);
    const target = declaration ? yaml.parse(declaration[1]).target_file : null;
    if (!id || !target) continue;
    effective.set(id, target);
  }
  const owners = new Map();
  for (const [id, target] of effective) {
    const key = pathKey(target);
    assert.equal(owners.has(key), false, `${target} has multiple effective TDD owners`);
    const related = await core.graph.query({ target: id, direction: 'in', rels: ['details'], version: selected });
    assert.equal(related.ok, true);
    assert.equal(related.data.edges.filter(edge => edge.dst === id).length, 1, `${id} requires one details parent`);
    owners.set(key, { id, target });
  }
  const distributed = ['package.json', 'tests/asset-contracts.test.mjs', 'tests/installation.test.mjs', ...filesUnder(skill).filter((p) => !p.includes(`${join(skill, 'node_modules')}`)).map((p) => relative(repo, p).replaceAll('\\', '/'))];
  for (const target of distributed) {
    const key = pathKey(target);
    assert.ok(owners.has(key), `missing TDD owner for ${target}`);
    assert.equal(owners.get(key).target, target);
  }
});

test('templates drive the real CLI through receipt, negative checks, acceptance, confirm and merge', { timeout: 120000 }, () => {
  const project = tempProject();
  const entry = process.platform === 'win32' ? join(skill, 'bin', 'ait.cmd') : join(skill, 'bin', 'ait');
  const init = wrapper(entry, ['init', '--name', 'smoke'], project);
  ok(init);
  const noActiveBefore = managedSnapshot(project);
  fail(cli(project, 'state', '--format', 'json'), 'NO_VERSION');
  assert.deepEqual(managedSnapshot(project), noActiveBefore);
  ok(cli(project, 'version', 'create', 'v0.1'));

  const create = (layer, id, content, extra = []) => {
    const background = ok(cli(project, layer, 'create', id, ...extra));
    const draft = join(project, `.draft-${layer}.md`);
    writeFileSync(draft, content, 'utf8');
    return ok(cli(project, layer, 'create', id, ...extra, '--content-file', draft, '--context-token', background.context_token));
  };
  create('prd', '[PRD]-smoke', fill('TEMPLATE-PRD-AIT-DRAFT.md'));
  ok(cli(project, 'prd', 'confirm'));
  create('fsd', '[FSD]-smoke', fill('TEMPLATE-FSD-AIT-DRAFT.md'), ['--parent', '[PRD]-smoke']);
  ok(cli(project, 'fsd', 'confirm'));
  create('tdd', '[TDD]-smoke', fill('TEMPLATE-TDD-AIT-DRAFT.md'), ['--parent', '[FSD]-smoke:feature']);
  ok(cli(project, 'tdd', 'confirm'));

  const readBefore = managedSnapshot(project);
  const panel = ok(cli(project, 'state', '--format', 'json'));
  assert.equal(panel.phase, 'tdd-confirm');
  assert.equal(panel.counts.tdd, 1);
  const query = '可执行 验收 & ! 中文';
  assert.equal(ok(cli(project, 'search', query)).query, query);
  const depends = ok(cli(project, 'specgraph', 'query', '[FSD]-smoke:feature', '--depends-on', '--direction', 'out'));
  assert.equal(depends.direction, 'out');
  assert.deepEqual(depends.edges, []);
  assert.deepEqual(managedSnapshot(project), readBefore);

  const dep = ok(cli(project, 'specgraph', 'query', '[PRD]-smoke:behavior', '--derives', '--direction', 'out', '--version', 'v0.1'));
  assert.match(JSON.stringify(dep), /\[FSD\]-smoke:feature/);
  const first = deliver(project);
  const second = deliver(project);
  fail(cli(project, 'codegen', 'receipt', '--generation-token', first.generation_token), 'GENERATION_TOKEN_STALE');
  assert.equal(second.target_file, 'hello.mjs');
  assert.equal(isAbsolute(second.bundle_path), true);
  assert.equal(normalize(second.bundle_path).startsWith(normalize(join(project, 'project-docs'))), false);
  const bundle = readFileSync(second.bundle_path);
  assert.equal(bundle.length, second.bytes);
  assert.equal(createHash('sha256').update(bundle).digest('hex'), second.sha256);

  const artifact = join(project, 'hello.mjs');
  const source = "import assert from 'node:assert/strict';\nexport const greet=(name)=>`Hello, ${name}!`;\nassert.equal(greet('艾达'),'Hello, 艾达!');\nassert.equal(greet(''),'Hello, !');\n";
  writeFileSync(artifact, source, 'utf8');
  execFileSync(process.execPath, [artifact], { cwd: project });
  ok(cli(project, 'codegen', 'receipt', '--generation-token', second.generation_token));
  writeFileSync(artifact, `${source}// changed\n`, 'utf8');
  const changed = ok(cli(project, 'codegen', 'verify', '--version', 'v0.1'));
  assert.match(JSON.stringify(changed.findings), /ARTIFACT_CHANGED/);
  assert.equal(changed.enforcement, 'report');
  assert.equal(changed.passed, true, 'report policy preserves success while reporting findings');
  writeFileSync(artifact, source, 'utf8');
  const third = deliver(project);
  execFileSync(process.execPath, [artifact], { cwd: project });
  ok(cli(project, 'codegen', 'receipt', '--generation-token', third.generation_token));
  const verified = ok(cli(project, 'codegen', 'verify', '--version', 'v0.1'));
  assert.equal(verified.passed, true);
  assert.deepEqual(verified.findings, []);

  writeFileSync(join(project, 'fail.mjs'), 'process.exit(7);\n', 'utf8');
  ok(cli(project, 'acceptance', 'set', 'node fail.mjs'));
  const rejected = ok(cli(project, 'acceptance', 'run'));
  assert.deepEqual({ ran: rejected.ran, passed: rejected.passed, exitCode: rejected.exitCode }, { ran: true, passed: false, exitCode: 7 });
  fail(cli(project, 'version', 'confirm', 'v0.1'), 'ACCEPTANCE_FAILED');
  fail(cli(project, 'version', 'merge', 'v0.1'), 'CONFIRMATION_REQUIRED');
  ok(cli(project, 'acceptance', 'set', 'node hello.mjs'));
  const acceptance = ok(cli(project, 'acceptance', 'run'));
  assert.equal(acceptance.ran && acceptance.passed, true);
  const confirmation = ok(cli(project, 'version', 'confirm', 'v0.1'));
  assert.equal(confirmation.acceptance.ran && confirmation.acceptance.passed, true);
  assert.deepEqual(confirmation.generation_receipts.findings, []);
  const merged = ok(cli(project, 'version', 'merge', 'v0.1'));
  assert.equal(merged.version, 'v0.1');
  const status = ok(cli(project, 'version', 'status', 'v0.1'));
  assert.equal(status.phase, 'merged');
  const historicalBefore = managedSnapshot(project);
  const historical = ok(cli(project, 'codegen', 'verify', '--version', 'v0.1'));
  assert.deepEqual(historical.findings, []);
  fail(cli(project, 'codegen', 'receipt', '--generation-token', third.generation_token), 'GENERATION_TOKEN_STALE');
  assert.deepEqual(managedSnapshot(project), historicalBefore);

  const summaryJson = ok(cli(project, 'baseline-summary', '--scope', 'prd', '--format', 'json'));
  const summaryYaml = cliRaw(project, 'baseline-summary', '--scope', 'prd');
  assert.equal(summaryYaml.status, 0);
  assert.ok(Array.isArray(summaryJson));
  assert.deepEqual(yaml.parse(summaryYaml.stdout), summaryJson);
  const before = snapshot(skill, true);
  const check = run(process.execPath, [join(skill, 'install.mjs'), '--check'], project);
  ok(check);
  assert.deepEqual(snapshot(skill, true), before);
  const afterMerge = managedSnapshot(project);
  fail(cli(project, 'state', '--format', 'json'), 'NO_VERSION');
  assert.equal(ok(cli(project, 'state', '--version', 'v0.1', '--format', 'json')).merged, true);
  assert.deepEqual(managedSnapshot(project), afterMerge);
});
