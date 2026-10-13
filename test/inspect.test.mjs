import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectGlb, InputError, LIMITS } from '../src/inspect.mjs';
import { buildFixture, encodeGlb } from '../fixtures/generate.mjs';

const inspectMutation = mutate => inspectGlb(buildFixture({ mutate }));
const has = (report, code) => report.findings.some(f => f.code === code);
const throwsCode = (fn, code) => assert.throws(fn, error => error instanceof InputError && error.code === code);

test('fresh skinned animated fixture is structurally clean, deterministic, and immutable', () => {
  const bytes = buildFixture(), before = Buffer.from(bytes), report = inspectGlb(bytes);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.summary, { nodes: 3, skins: 1, animations: 1 });
  assert.deepEqual(report, inspectGlb(bytes));
  assert.deepEqual(bytes, before);
  assert.equal(report.asset_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(report.schema_version, 1);
  assert.equal(report.inspector_version, '1.0.0');
  assert.ok(report.coverage.not_checked.includes('evaluated_deformation'));
});
test('accepts ArrayBuffer and views with a nonzero byte offset', () => {
  const bytes = buildFixture(), container = Buffer.concat([Buffer.alloc(9), bytes, Buffer.alloc(5)]);
  assert.deepEqual(inspectGlb(container.subarray(9, 9 + bytes.length)).findings, []);
  assert.deepEqual(inspectGlb(Uint8Array.from(bytes).buffer).findings, []);
});
test('typed input/header/chunk and UTF-8 errors', () => {
  throwsCode(() => inspectGlb('filename.glb'), 'INPUT_TYPE');
  throwsCode(() => inspectGlb(Buffer.alloc(3)), 'GLB_HEADER');
  throwsCode(() => inspectGlb(Buffer.alloc(LIMITS.assetBytes + 1)), 'ASSET_LIMIT');
  for (const [offset, value] of [[0, 0], [4, 1], [8, 999]]) {
    const bytes = buildFixture(); bytes.writeUInt32LE(value, offset);
    throwsCode(() => inspectGlb(bytes), 'GLB_HEADER');
  }
  const badChunk = buildFixture(); badChunk.writeUInt32LE(0xffffffff, 12);
  throwsCode(() => inspectGlb(badChunk), 'GLB_CHUNK');
  const badJSON = buildFixture(); badJSON[20] = 0xff;
  throwsCode(() => inspectGlb(badJSON), 'JSON_PARSE');
});
test('typed shape/depth/count rejection and JSON limit', () => {
  throwsCode(() => inspectGlb(encodeGlb({ asset: { version: '1.0' } })), 'JSON_SHAPE');
  throwsCode(() => inspectMutation(g => { g.nodes = {}; }), 'JSON_SHAPE');
  throwsCode(() => inspectMutation(g => { g.nodes = Array(8193).fill({}); }), 'JSON_SHAPE');
  throwsCode(() => inspectMutation(g => { let item = {}; g.extras = item; for (let i = 0; i < 70; i++) item = item.next = {}; }), 'JSON_LIMIT');
  throwsCode(() => inspectGlb(encodeGlb({ asset: { version: '2.0' }, extras: 'a'.repeat(LIMITS.jsonBytes) })), 'JSON_LIMIT');
});
test('hierarchy cycles, dangling and multiple parent references are errors', () => {
  assert.ok(has(inspectMutation(g => { g.nodes[1].children = [0]; }), 'NODE_CYCLE'));
  assert.ok(has(inspectMutation(g => { g.nodes[0].children.push(99); }), 'INVALID_REFERENCE'));
  assert.ok(has(inspectMutation(g => { g.nodes[2].children = [1]; }), 'MULTIPLE_PARENTS'));
  assert.ok(has(inspectMutation(g => { g.nodes[0].children.push(1); }), 'DUPLICATE_CHILD'));
});
test('skin joints and inverse bind references/shapes are checked', () => {
  assert.ok(has(inspectMutation(g => { g.skins[0].joints.push(99); }), 'INVALID_REFERENCE'));
  assert.ok(has(inspectMutation(g => { g.skins[0].joints.push(1); }), 'DUPLICATE_JOINT'));
  assert.ok(has(inspectMutation(g => { g.skins[0].inverseBindMatrices = 0; }), 'INVERSE_BIND_SHAPE'));
  assert.ok(has(inspectMutation(g => { g.nodes[2].skin = 99; }), 'INVALID_REFERENCE'));
  assert.ok(has(inspectMutation(g => { delete g.nodes[2].mesh; }), 'SKIN_WITHOUT_MESH'));
});
test('joint indices are relative to each skin even when a mesh is instanced', () => {
  const report = inspectMutation(g => { g.skins.push({ joints: [0] }); g.nodes.push({ mesh: 0, skin: 1 }); });
  const failures = report.findings.filter(f => f.code === 'JOINT_INDEX_RANGE');
  assert.equal(failures.length, 1); assert.equal(failures[0].location, '/nodes/3');
  assert.equal(failures[0].evidence.skin, 1);
  assert.ok(has(inspectGlb(buildFixture({ jointValues: [8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })), 'JOINT_INDEX_RANGE'));
});
test('missing/type/count skin attributes are screened', () => {
  assert.ok(has(inspectMutation(g => { delete g.meshes[0].primitives[0].attributes.JOINTS_0; }), 'MISSING_JOINTS'));
  assert.ok(has(inspectMutation(g => { g.accessors[1].normalized = true; }), 'JOINT_ACCESSOR_SHAPE'));
  assert.ok(has(inspectMutation(g => { g.accessors[2].count = 2; }), 'SKIN_ATTRIBUTE_SHAPE'));
  assert.ok(has(inspectMutation(g => { g.accessors[2].componentType = 5121; }), 'SKIN_ATTRIBUTE_SHAPE'));
});
test('finite transform shapes and matrix/TRS exclusivity are screened', () => {
  assert.ok(has(inspectMutation(g => { g.nodes[1].translation = [0, null, 0]; }), 'NONFINITE_OR_SHAPE'));
  assert.ok(has(inspectMutation(g => { g.nodes[1].matrix = Array(16).fill(0); }), 'TRANSFORM_CONFLICT'));
  assert.ok(has(inspectMutation(g => { g.nodes[0].rotation = [0, 0, 1]; }), 'NONFINITE_OR_SHAPE'));
});
test('NaN and infinity binary evidence are finite JSON labels', () => {
  for (const [value, expected] of [[NaN, 'NaN'], [Infinity, '+Infinity'], [-Infinity, '-Infinity']]) {
    const report = inspectMutation((g, bytes) => { bytes.writeFloatLE(value, 0); });
    const f = report.findings.find(f => f.code === 'NONFINITE_BINARY');
    assert.equal(f.evidence.value, expected);
    assert.equal(JSON.parse(JSON.stringify(report)).findings[0].evidence.value, expected);
  }
});
test('buffer/view/accessor bounds, alignment, count, and stride are checked before reading', () => {
  const cases = [
    [g => { g.buffers[0].byteLength += 100; }, 'BUFFER_BOUNDS'],
    [g => { g.bufferViews[0].byteLength = 999999; }, 'BUFFER_VIEW_BOUNDS'],
    [g => { g.accessors[0].byteOffset = 2; }, 'ACCESSOR_ALIGNMENT'],
    [g => { g.accessors[0].count = 4; }, 'ACCESSOR_BOUNDS'],
    [g => { g.bufferViews[0].byteStride = 4; }, 'ACCESSOR_STRIDE'],
    [g => { g.bufferViews[0].byteStride = 7; }, 'ACCESSOR_STRIDE'],
    [g => { g.accessors[0].count = Number.MAX_SAFE_INTEGER; }, 'UNSUPPORTED_FEATURE'],
    [g => { g.accessors[0].count = 1e30; }, 'ACCESSOR_SHAPE'],
    [g => { g.accessors[0].type = 'constructor'; }, 'ACCESSOR_SHAPE'],
    [g => { g.accessors[0].componentType = '__proto__'; }, 'ACCESSOR_SHAPE'],
  ];
  for (const [mutate, code] of cases) assert.ok(has(inspectMutation(mutate), code), code);
});
test('matrix layout supports padded byte MAT3 columns', () => {
  const report = inspectMutation((g, bytes) => {
    const offset = g.bufferViews[0].byteOffset;
    g.accessors[0] = { bufferView: 0, componentType: 5121, count: 3, type: 'MAT3' };
    bytes.fill(0, offset, offset + 36);
  });
  assert.equal(has(report, 'ACCESSOR_BOUNDS'), false);
  assert.equal(has(report, 'ACCESSOR_ALIGNMENT'), false);
});
test('non-joint animation target nodes are valid', () => {
  const report = inspectMutation(g => { g.animations[0].channels[0].target.node = 2; });
  assert.deepEqual(report.findings, []);
});
test('animation node, sampler, and accessor references are checked', () => {
  for (const mutate of [
    g => { g.animations[0].channels[0].target.node = 123; },
    g => { g.animations[0].channels[0].sampler = 123; },
    g => { g.animations[0].samplers[0].input = 123; },
    g => { g.animations[0].samplers[0].output = 123; },
  ]) assert.ok(has(inspectMutation(mutate), 'INVALID_REFERENCE'));
});
test('animation times must be finite nonnegative and strictly increasing', () => {
  for (const times of [[0, 0], [1, 0], [-1, 0], [0, NaN], [0, Infinity]]) assert.ok(has(inspectGlb(buildFixture({ timeValues: times })), 'ANIMATION_TIME_ORDER'));
  assert.ok(has(inspectMutation(g => { g.accessors[4].type = 'VEC2'; }), 'ANIMATION_INPUT_SHAPE'));
});
test('LINEAR STEP and CUBICSPLINE output shapes/counts are checked', () => {
  for (const interpolation of ['LINEAR', 'STEP', 'CUBICSPLINE']) assert.deepEqual(inspectGlb(buildFixture({ interpolation })).findings, []);
  assert.deepEqual(inspectGlb(buildFixture({ outputType: 'VEC4' })).findings, []);
  assert.ok(has(inspectMutation(g => { g.accessors[5].count = 1; }), 'ANIMATION_OUTPUT_COUNT'));
  assert.ok(has(inspectMutation(g => { g.animations[0].channels[0].target.path = 'rotation'; }), 'ANIMATION_OUTPUT_SHAPE'));
  assert.ok(has(inspectMutation(g => { g.animations[0].samplers[0].interpolation = 'CUBICSPLINE'; }), 'ANIMATION_OUTPUT_COUNT'));
  assert.ok(has(inspectMutation(g => { g.nodes[1].matrix = Array(16).fill(0); delete g.nodes[1].translation; }), 'ANIMATED_MATRIX_NODE'));
});
test('URI, sparse, compression, morph, and unknown path are explicitly uncovered', () => {
  const cases = [
    [g => { g.buffers[0].uri = 'https://localhost/private'; }, 'external_or_data_uri_buffers'],
    [g => { g.images = [{ uri: 'file:///secrets' }]; }, 'external_or_data_uri_images'],
    [g => { g.accessors[0].sparse = {}; }, 'sparse_accessors'],
    [g => { g.extensionsUsed = ['KHR_draco_mesh_compression']; g.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} }; }, 'gltf_extensions'],
    [g => { g.bufferViews[0].extensions = { EXT_meshopt_compression: {} }; }, 'gltf_extensions'],
    [g => { g.animations[0].channels[0].target.path = 'weights'; }, 'morph_animation'],
    [g => { g.animations[0].channels[0].target.path = 'constructor'; }, 'unknown_animation_path'],
  ];
  for (const [mutate, coverage] of cases) { const report = inspectMutation(mutate); assert.ok(report.coverage.not_checked.includes(coverage)); assert.ok(has(report, 'UNSUPPORTED_FEATURE')); }
});
test('finding truncation is explicit and hostile metadata is never echoed', () => {
  const secret = '<script>location.href="https://evil"</script>LOCAL_PRIVATE_NAME';
  const report = inspectMutation(g => { g.nodes = Array.from({ length: 200 }, () => ({ name: secret, children: [9999] })); g.animations[0].channels[0].target.path = secret; g.buffers[0].uri = secret; });
  assert.equal(report.findings.length, LIMITS.findings);
  assert.ok(report.coverage.not_checked.includes('additional_findings_truncated'));
  assert.equal(JSON.stringify(report).includes(secret), false);
  report.findings.forEach((f, i) => assert.equal(f.id, `F${String(i + 1).padStart(4, '0')}`));
});
test('unsupported morph animation is not assigned TRS output count rules', () => {
  const report = inspectMutation(g => { g.animations[0].channels[0].target.path = 'weights'; g.accessors[5].count = 3; g.accessors[5].type = 'SCALAR'; });
  assert.ok(report.coverage.not_checked.includes('morph_animation'));
  assert.equal(has(report, 'ANIMATION_OUTPUT_COUNT'), false);
});
test('scalar work budget prevents repeated or oversized decoding', () => {
  const binary = Buffer.alloc(LIMITS.accessorCount * 9 * 4);
  const document = { asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }], bufferViews: [{ buffer: 0, byteLength: binary.length }], accessors: [{ bufferView: 0, componentType: 5126, count: LIMITS.accessorCount, type: 'MAT3' }] };
  const report = inspectGlb(encodeGlb(document, binary));
  assert.ok(report.coverage.not_checked.includes('binary_scalar_work_limit'));
  assert.ok(has(report, 'UNSUPPORTED_FEATURE'));
});
test('matrix final trailing column padding is optional', () => {
  const binary = Buffer.alloc(12), document = { asset: { version: '2.0' }, buffers: [{ byteLength: 11 }], bufferViews: [{ buffer: 0, byteLength: 11 }], accessors: [{ bufferView: 0, componentType: 5121, count: 1, type: 'MAT3' }] };
  assert.deepEqual(inspectGlb(encodeGlb(document, binary)).findings, []);
});
test('unknown chunks are uncovered, duplicate or misplaced known chunks are typed errors', () => {
  const original = buildFixture(), extended = Buffer.concat([original, Buffer.alloc(8)]);
  extended.writeUInt32LE(extended.length, 8); extended.writeUInt32LE(0x77777777, original.length + 4);
  assert.ok(inspectGlb(extended).coverage.not_checked.includes('unknown_glb_chunks'));
  extended.writeUInt32LE(0x4e4f534a, original.length + 4);
  throwsCode(() => inspectGlb(extended), 'GLB_CHUNK');
  extended.writeUInt32LE(0x004e4942, original.length + 4);
  throwsCode(() => inspectGlb(extended), 'GLB_CHUNK');
});

test('falsy JSON roots cannot hide duplicate JSON chunks', () => {
  const valid = encodeGlb({ asset: { version: '2.0' } });
  // Drop the fixture encoder's optional empty BIN so JSON duplication is the
  // only structural defect, rather than an incorrectly positioned BIN chunk.
  const validJsonChunk = valid.subarray(12, valid.length - 8);
  for (const root of ['null', 'false', '0', '""']) {
    const length = Math.ceil(root.length / 4) * 4, firstChunk = Buffer.alloc(8 + length, 0x20);
    firstChunk.writeUInt32LE(length, 0); firstChunk.writeUInt32LE(0x4e4f534a, 4); firstChunk.write(root, 8);
    const duplicate = Buffer.concat([valid.subarray(0, 12), firstChunk, validJsonChunk]);
    duplicate.writeUInt32LE(duplicate.length, 8);
    throwsCode(() => inspectGlb(duplicate), 'GLB_CHUNK');
  }
});
test('nested malformed animation/mesh objects produce safe findings, not native exceptions', () => {
  const report = inspectMutation(g => { g.animations[0].samplers = [null]; g.animations[0].channels = [false]; g.meshes[0].primitives = [null]; });
  assert.ok(has(report, 'INVALID_SHAPE'));
  assert.doesNotThrow(() => JSON.stringify(report));
});

test('hostile object-valued lookup keys and lengths never trigger coercion exceptions', () => {
  const hostile = () => ({ toString: 1, valueOf: 1 });
  const mutations = [
    [g => { g.accessors[0].componentType = hostile(); }, 'ACCESSOR_SHAPE'],
    [g => { g.accessors[0].type = hostile(); }, 'ACCESSOR_SHAPE'],
    [g => { g.accessors[0].byteOffset = hostile(); }, 'ACCESSOR_ALIGNMENT'],
    [g => { g.accessors[3].count = hostile(); }, 'INVERSE_BIND_SHAPE'],
    [g => { g.buffers[0].byteLength = hostile(); }, 'BUFFER_BOUNDS'],
    [g => { g.animations[0].channels[0].target.path = hostile(); }, 'UNSUPPORTED_FEATURE'],
    [g => { g.animations[0].samplers[0].input = hostile(); }, 'INVALID_REFERENCE'],
    [g => { g.animations[0].samplers[0].output = hostile(); }, 'INVALID_REFERENCE'],
    [g => { g.accessors[4].count = hostile(); }, 'ACCESSOR_SHAPE'],
    ...['JOINTS_0', 'WEIGHTS_0', 'POSITION'].map(key => [g => { g.meshes[0].primitives[0].attributes[key] = hostile(); }, 'INVALID_REFERENCE']),
  ];
  for (const [mutate, code] of mutations) {
    const report = inspectMutation(mutate);
    assert.ok(has(report, code), code);
    assert.doesNotThrow(() => JSON.stringify(report));
  }
  assert.ok(has(inspectMutation(g => { g.accessors[0].componentType = '5126'; }), 'ACCESSOR_SHAPE'));
});

test('mesh instancing visits are bounded even for missing or unavailable joint data', () => {
  for (const attributes of [{ JOINTS_0: 0, WEIGHTS_0: 1 }, {}, { JOINTS_0: 0, WEIGHTS_0: 1, unavailable: true }]) {
    const unavailable = attributes.unavailable === true;
    const primitiveAttributes = { ...attributes }; delete primitiveAttributes.unavailable;
    const binary = Buffer.alloc(20);
    const document = {
      asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }],
      bufferViews: [{ buffer: 0, byteLength: 4 }, { buffer: 0, byteOffset: 4, byteLength: 16 }],
      accessors: [{ bufferView: 0, componentType: 5121, count: 1, type: 'VEC4', ...(unavailable ? { sparse: {} } : {}) }, { bufferView: 1, componentType: 5126, count: 1, type: 'VEC4' }],
      skins: [{ joints: [0] }], nodes: Array.from({ length: 256 }, () => ({ mesh: 0, skin: 0 })),
      meshes: [{ primitives: Array.from({ length: 256 }, () => ({ attributes: primitiveAttributes })) }],
    };
    const report = inspectGlb(encodeGlb(document, binary));
    assert.ok(report.coverage.not_checked.includes('joint_instance_visit_limit'));
    if (!unavailable && Object.keys(attributes).length) {
      assert.equal(report.findings.length, 1);
      assert.equal(report.findings[0].location, `/nodes/${Math.floor(LIMITS.jointInstances / 256)}`);
    }
  }
});

test('joint scalar budget exits subsequent mesh instances after marking incomplete coverage', () => {
  const count = 200000, jointBytes = count * 4, binary = Buffer.alloc(jointBytes + count * 16);
  const document = {
    asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteLength: jointBytes }, { buffer: 0, byteOffset: jointBytes, byteLength: count * 16 }],
    accessors: [{ bufferView: 0, componentType: 5121, count, type: 'VEC4' }, { bufferView: 1, componentType: 5126, count, type: 'VEC4' }],
    skins: [{ joints: [0] }], nodes: [{ mesh: 0, skin: 0 }, { mesh: 0, skin: 0 }, { mesh: 0, skin: 0 }, { mesh: 1, skin: 0 }],
    meshes: [{ primitives: [{ attributes: { JOINTS_0: 0, WEIGHTS_0: 1 } }] }, { primitives: [{ attributes: {} }] }],
  };
  const report = inspectGlb(encodeGlb(document, binary));
  assert.ok(report.coverage.not_checked.includes('joint_instance_work_limit'));
  assert.equal(has(report, 'MISSING_JOINTS'), false);
  assert.equal(report.findings.filter(finding => finding.code === 'UNSUPPORTED_FEATURE').length, 1);
});
