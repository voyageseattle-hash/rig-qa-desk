import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflowFixture } from '../fixtures/workflow.mjs';
import { inspectGlb } from '../src/inspect.mjs';
import { inspectConformance } from '../src/conformance.mjs';
import { validateInspection } from '../src/recommend.mjs';
import { workflowVisual } from '../src/workflow-visual.mjs';

test('visual evidence comes from inspected GLB bytes and known corrections change exactly two data values', () => {
  const before = workflowVisual(), after = workflowVisual({ flawed: false });
  const report = inspectGlb(buildWorkflowFixture({ flawed: true }));
  assert.equal(before.asset_sha256, report.asset_sha256);
  assert.equal(before.joint_slot, report.findings[0].evidence.value);
  assert.equal(before.joint_slots, report.findings[0].evidence.joint_count);
  assert.equal(before.declared_samples, report.findings[1].evidence.actual);
  assert.equal(before.timestamps.length, report.findings[1].evidence.expected);
  assert.deepEqual(before.vertices[0], [Math.fround(-0.03), 0, 0]);
  assert.equal(before.vertices.length, 48); assert.equal(before.active_weight, 1);
  assert.equal(before.stored_vectors, 23); assert.equal(before.interpolation, 'LINEAR');
  assert.equal(after.joint_slot, 0); assert.equal(after.declared_samples, 23);
  const { asset_sha256: bh, joint_slot: bj, declared_samples: bs, ...b } = before;
  const { asset_sha256: ah, joint_slot: aj, declared_samples: as, ...a } = after;
  assert.deepEqual(a, b); assert.notEqual(ah, bh);
  const decode = bytes => { const length = bytes.readUInt32LE(12); return { json: JSON.parse(bytes.subarray(20, 20 + length)), bin: bytes.subarray(28 + length) }; };
  const original = buildWorkflowFixture({ flawed: true }), snapshot = Buffer.from(original);
  const flawed = decode(original), corrected = decode(buildWorkflowFixture());
  assert.equal(flawed.json.accessors[7].count, 22); flawed.json.accessors[7].count = 23;
  assert.deepEqual(flawed.json, corrected.json);
  const jointOffset = flawed.json.bufferViews[flawed.json.accessors[2].bufferView].byteOffset;
  assert.equal(flawed.bin[jointOffset], 24);
  const restored = Buffer.from(flawed.bin); restored[jointOffset] = 0;
  assert.deepEqual(restored, corrected.bin); assert.deepEqual(original, snapshot);
});

test('owned workflow fixture has clean24bone baseline and exactly two controlled export faults', async () => {
  const valid = buildWorkflowFixture(), flawed = buildWorkflowFixture({ flawed: true });
  assert.deepEqual(inspectGlb(valid).findings, []);
  const validOfficial = await inspectConformance(valid);
  assert.equal(validOfficial.status, 'complete'); assert.equal(validOfficial.counts.errors, 0);
  const report = validateInspection(inspectGlb(flawed));
  assert.deepEqual(report.findings.map(f => f.code), ['JOINT_INDEX_RANGE', 'ANIMATION_OUTPUT_COUNT']);
  assert.equal(report.findings[0].evidence.value, 24); assert.equal(report.findings[0].evidence.joint_count, 24);
  assert.deepEqual(report.findings[1].evidence, { expected: 23, actual: 22, channel: 0, target_node: 0, target_path: 'translation', input_accessor: 6, output_accessor: 7, interpolation: 'LINEAR' });
  const official = await inspectConformance(flawed);
  assert.equal(official.status, 'complete'); assert(official.counts.errors >= 2);
  assert.equal(inspectGlb(valid).asset_sha256, inspectGlb(buildWorkflowFixture()).asset_sha256);
});
