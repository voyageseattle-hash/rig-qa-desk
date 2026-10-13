import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFixture } from '../fixtures/generate.mjs';
import { inspectConformance, validateConformance, evidenceHash } from '../src/conformance.mjs';

test('official validation is local, immutable and separately hash bound', async () => {
  const input = buildFixture(), before = evidenceHash([...input]);
  const result = await inspectConformance(input);
  assert.equal(result.status, 'complete');
  assert.equal(result.counts.errors, 0);
  assert.equal(evidenceHash([...input]), before);
  assert.equal(result.external_resources, 'blocked');
  assert.equal(validateConformance(result), result);
  assert.throws(() => validateConformance({ ...result, asset_sha256: 'bad' }));
  assert.throws(() => validateConformance({ ...result, instructions: 'execute code' }));
  assert.throws(() => validateConformance({ ...result, status: 'timeout' }));
});

test('non-root mesh exposes measured parent context without asset names or repair claims', async () => {
  const result = await inspectConformance(buildFixture({ mutate(g) {
    g.nodes.push({ name: '<img onerror=secret()>', children: [0, 2], scale: [0.01, 0.01, 0.01] });
    g.scenes[0].nodes = [3];
  } }));
  const issue = result.messages.find(m => m.code === 'NODE_SKINNED_MESH_NON_ROOT');
  assert.equal(issue.context.node, 2);
  assert.deepEqual(issue.context.parents, [3]);
  assert.deepEqual(issue.context.parent_scales, [[0.01, 0.01, 0.01]]);
  assert.equal(issue.context.joint_count, 2);
  assert(!JSON.stringify(result).includes('secret'));
});

test('official validator detects bad joints and nonincreasing animation times', async () => {
  const joints = await inspectConformance(buildFixture({ jointValues: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));
  assert(joints.counts.errors > 0);
  assert(joints.messages.some(m => m.code.includes('JOINTS')));
  const timing = await inspectConformance(buildFixture({ timeValues: [0, 0] }));
  assert(timing.messages.some(m => m.code.includes('ANIMATION_INPUT_NON_INCREASING')));
});

test('matrix parents never masquerade as measured identity scale', async () => {
  const matrix = [0.01,0,0,0, 0,0.01,0,0, 0,0,0.01,0, 0,0,0,1];
  const result = await inspectConformance(buildFixture({ mutate(g) {
    g.nodes.push({ children: [0, 2], matrix }); g.scenes[0].nodes = [3];
  } }));
  const context = result.messages.find(m => m.code === 'NODE_SKINNED_MESH_NON_ROOT').context;
  assert.deepEqual(context.parent_scales, [null]);
  assert.deepEqual(context.parent_matrices, [matrix]);
  const failed = await inspectConformance(buildFixture(), { workerUrl: null });
  assert.equal(failed.status, 'unavailable');
});

test('external URLs are refused and not echoed into returned evidence', async () => {
  const result = await inspectConformance(buildFixture({ mutate(g) {
    g.buffers[0].uri = 'http://127.0.0.1:1/private?key=NEVER-EXPOSE';
  } }));
  assert.equal(result.status, 'complete');
  assert(result.messages.some(m => m.code === 'IO_ERROR'));
  assert(!JSON.stringify(result).includes('NEVER-EXPOSE'));
});

test('worker timeout and startup failure are explicit unavailable states, never passes', async () => {
  const timeout = await inspectConformance(buildFixture(), { timeoutMs: 1 });
  assert.equal(timeout.status, 'timeout');
  assert.equal(timeout.counts, undefined);
  const failed = await inspectConformance(buildFixture(), { workerUrl: new URL('./not-present.mjs', import.meta.url) });
  assert.equal(failed.status, 'unavailable');
  assert.equal(failed.counts, undefined);
});

test('bounded issue truncation stays visible and supported extensions are named', async () => {
  const result = await inspectConformance(buildFixture({ mutate(g) {
    g.extensionsUsed = ['KHR_materials_ior', 'TEST_unknown'];
    for (let i = 0; i < 200; i++) g.nodes.push({ mesh: 9999 });
  } }));
  assert.equal(result.status, 'complete');
  assert.equal(result.truncated, true);
  assert(result.messages.length <= 128);
  assert.deepEqual(result.extensions, [{ name: 'KHR_materials_ior', supported: true }, { name: 'TEST_unknown', supported: false }]);
});
