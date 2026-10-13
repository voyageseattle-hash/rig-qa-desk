import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildWorkflowFixture } from '../fixtures/workflow.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = join(root, 'judge-site');
const run = (...args) => execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
async function standalone(t) {
  const target = await mkdtemp(join(tmpdir(), 'rig-qa-site-shared-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  await mkdir(join(target, 'scripts'));
  await mkdir(join(target, 'lib'));
  for (const name of ['scripts/sync-shared.mjs', 'scripts/generate-validators.mjs', 'lib/provider.mjs', 'lib/schema-validators.mjs', 'SHARED-SOURCE-MANIFEST.json']) await cp(join(site, name), join(target, name));
  await cp(join(site, 'shared'), join(target, 'shared'), { recursive: true });
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'standalone-qa-snapshot-test', type: 'module' }));
  return target;
}

test('shared snapshot is exact, bounded, public-only source with relative path hashes', async () => {
  const manifest = JSON.parse(await readFile(join(site, 'SHARED-SOURCE-MANIFEST.json')));
  assert.equal(manifest.files.length, 8);
  for (const entry of manifest.files) {
    assert.doesNotMatch(entry.path, /:|\\|^\/|\.\./);
    const snapshot = await readFile(join(site, 'shared', entry.path));
    assert.deepEqual(snapshot, await readFile(join(root, entry.path)));
    assert.equal(snapshot.length, entry.bytes);
    assert.equal(createHash('sha256').update(snapshot).digest('hex'), entry.sha256);
  }
  assert.match(run(join(site, 'scripts/sync-shared.mjs'), '--verify'), /8 allowlisted files/);
});

test('site-only checkout verifies snapshots and runs inspector, fixtures and provider without parent or dependencies', async t => {
  const target = await standalone(t);
  assert.match(run(join(target, 'scripts/sync-shared.mjs')), /8 allowlisted files/);
  const { buildWorkflowFixture: independentFixture } = await import(pathToFileURL(join(target, 'shared/fixtures/workflow.mjs')));
  const { inspectGlb } = await import(pathToFileURL(join(target, 'shared/src/inspect.mjs')));
  const provider = await import(pathToFileURL(join(target, 'lib/provider.mjs')));
  for (const flawed of [false, true]) {
    const bytes = independentFixture({ flawed });
    assert.deepEqual(bytes, buildWorkflowFixture({ flawed }));
    const report = inspectGlb(bytes);
    assert.equal(report.findings.filter(f => f.severity === 'error').length, flawed ? 2 : 0);
    assert.match(provider.createMockAdvice(report).summary, /MOCK OUTPUT/);
  }
});

test('standalone site validator generation uses site-local pinned Ajv and produces identical validators', async t => {
  const target = await standalone(t);
  await mkdir(join(target, 'node_modules'));
  // Copy already installed public packages only; this test never downloads.
  for (const name of ['ajv', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string']) await cp(join(root, 'node_modules', name), join(target, 'node_modules', name), { recursive: true });
  const before = await readFile(join(target, 'lib/schema-validators.mjs'));
  run(join(target, 'scripts/generate-validators.mjs'));
  assert.deepEqual(await readFile(join(target, 'lib/schema-validators.mjs')), before);
});

test('standalone snapshot verification rejects tampered source, missing files and unexpected files', async t => {
  const target = await standalone(t);
  const check = () => run(join(target, 'scripts/sync-shared.mjs'));
  const core = join(target, 'shared/src/recommend-core.mjs');
  const original = await readFile(core);
  await writeFile(core, Buffer.concat([original, Buffer.from('\n// tamper')]));
  assert.throws(check, /does not match its manifest/);
  await writeFile(core, original);
  await writeFile(join(target, 'shared/extra.txt'), 'unexpected');
  assert.throws(check, /missing or unexpected/);
  await rm(join(target, 'shared/extra.txt'));
  await rm(core);
  assert.throws(check, /missing or unexpected/);
});

test('standalone manifest cannot widen allowlist or traverse directories', async t => {
  const target = await standalone(t);
  const manifestPath = join(target, 'SHARED-SOURCE-MANIFEST.json');
  const manifest = JSON.parse(await readFile(manifestPath));
  manifest.files[0].path = '../../outside.txt';
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.throws(() => run(join(target, 'scripts/sync-shared.mjs')), /Invalid shared source manifest entry/);
});
