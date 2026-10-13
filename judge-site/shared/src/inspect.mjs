import { createHash } from 'node:crypto';

export const LIMITS = Object.freeze({ assetBytes: 32 * 1024 * 1024, jsonBytes: 4 * 1024 * 1024, nodes: 8192, accessors: 4096, accessorCount: 262144, scalarWork: 2000000, jointInstances: 50000, findings: 128 });
export class InputError extends Error {
  constructor(code, message) { super(message); this.name = 'InputError'; this.code = code; }
}
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const uint = v => Number.isSafeInteger(v) && v >= 0;
const fail = (code, message) => { throw new InputError(code, message); };
const CT = { 5120: [1, 'getInt8'], 5121: [1, 'getUint8'], 5122: [2, 'getInt16'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'] };
const TYPES = { SCALAR: [1, 1], VEC2: [1, 2], VEC3: [1, 3], VEC4: [1, 4], MAT2: [2, 2], MAT3: [3, 3], MAT4: [4, 4] };
const label = v => Number.isFinite(v) ? v : Number.isNaN(v) ? 'NaN' : v > 0 ? '+Infinity' : '-Infinity';

function parse(bytes) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!(bytes instanceof Uint8Array)) fail('INPUT_TYPE', 'Expected GLB bytes.');
  if (bytes.byteLength > LIMITS.assetBytes) fail('ASSET_LIMIT', 'Asset exceeds the 32 MiB inspection limit.');
  if (bytes.byteLength < 20) fail('GLB_HEADER', 'GLB header or first chunk is incomplete.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67 || v.getUint32(4, true) !== 2 || v.getUint32(8, true) !== bytes.byteLength) fail('GLB_HEADER', 'Expected a complete version 2 GLB with an exact declared length.');
  let json, bin, jsonSeen = false, unknown = false, chunk = 0;
  for (let offset = 12; offset < bytes.byteLength;) {
    if (++chunk > 64) fail('CHUNK_LIMIT', 'GLB chunk count exceeds the inspection limit.');
    if (offset + 8 > bytes.byteLength) fail('GLB_CHUNK', 'GLB chunk header is incomplete.');
    const length = v.getUint32(offset, true), type = v.getUint32(offset + 4, true);
    if (length % 4 !== 0 || offset + 8 + length > bytes.byteLength) fail('GLB_CHUNK', 'GLB chunk length is unaligned or outside the asset.');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (chunk === 1 && type !== 0x4e4f534a) fail('GLB_CHUNK', 'The first GLB chunk must contain JSON.');
    if (type === 0x4e4f534a) {
      if (jsonSeen) fail('GLB_CHUNK', 'GLB contains more than one JSON chunk.');
      jsonSeen = true;
      if (length > LIMITS.jsonBytes) fail('JSON_LIMIT', 'GLB JSON exceeds the 4 MiB inspection limit.');
      try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
      catch { fail('JSON_PARSE', 'GLB JSON is invalid UTF-8 or invalid JSON.'); }
    } else if (type === 0x004e4942) {
      if (bin || chunk !== 2) fail('GLB_CHUNK', 'The optional BIN chunk must occur once immediately after JSON.');
      bin = data;
    } else unknown = true;
    offset += 8 + length;
  }
  if (!object(json) || !object(json.asset) || json.asset.version !== '2.0') fail('JSON_SHAPE', 'Expected a glTF 2.0 JSON object with asset metadata.');
  // Traverse iteratively: hostile nesting must not exhaust the JS call stack.
  let work = 0;
  const pending = [[json, 0]];
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++work > 100000 || depth > 64) fail('JSON_LIMIT', 'JSON structure exceeds the bounded inspection limit.');
    if (item && typeof item === 'object') {
      const values = Object.values(item);
      if (work + pending.length + values.length > 100000) fail('JSON_LIMIT', 'JSON structure exceeds the bounded inspection limit.');
      for (const child of values) pending.push([child, depth + 1]);
    }
  }
  for (const key of ['nodes', 'skins', 'animations', 'accessors', 'bufferViews', 'buffers', 'meshes', 'scenes', 'images']) {
    if (json[key] === undefined) json[key] = [];
    if (!Array.isArray(json[key]) || json[key].length > (key === 'nodes' ? LIMITS.nodes : key === 'accessors' ? LIMITS.accessors : 8192) || json[key].some(x => !object(x))) fail('JSON_SHAPE', 'A glTF collection has an invalid shape or exceeds its object limit.');
  }
  return { bytes, json, bin: bin ?? new Uint8Array(), unknown };
}

/** Pure bounded screening. No filesystem, network, decoding extensions, or repairs. */
export function inspectGlb(input) {
  const { bytes, json: g, bin, unknown } = parse(input);
  const report = { schema_version: 1, asset_sha256: createHash('sha256').update(bytes).digest('hex'), byte_length: bytes.byteLength, inspector_version: '1.0.0', coverage: { checked: ['glb_structure', 'node_skin_references', 'node_cycles', 'accessor_layout', 'finite_supported_values', 'joint_indices_per_skin_instance', 'animation_references_shapes_times'], not_checked: ['physical_anatomical_correctness', 'evaluated_deformation', 'runtime_engine_behavior', 'full_gltf_schema_conformance', 'texture_material_content', 'weight_normalization', 'quaternion_normalization'] }, summary: { nodes: g.nodes.length, skins: g.skins.length, animations: g.animations.length }, findings: [] };
  const omit = what => { if (!report.coverage.not_checked.includes(what)) report.coverage.not_checked.push(what); };
  const finding = (code, severity, location, message, evidence = {}) => {
    if (report.findings.length >= LIMITS.findings) { omit('additional_findings_truncated'); return; }
    const safeEvidence = Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, typeof value === 'number' ? label(value) : value]));
    report.findings.push({ id: `F${String(report.findings.length + 1).padStart(4, '0')}`, code, severity, location, message, evidence: safeEvidence });
  };
  const unsupported = (location, what) => { omit(what); finding('UNSUPPORTED_FEATURE', 'warning', location, 'This feature is outside inspection coverage.'); };
  const ref = (value, list, location) => {
    if (!uint(value) || value >= list.length) { finding('INVALID_REFERENCE', 'error', location, 'Reference does not identify an existing object.'); return false; }
    return true;
  };
  const array = (value, location, allowEmpty = false) => {
    if (!Array.isArray(value) || (!allowEmpty && !value.length)) { finding('INVALID_SHAPE', 'error', location, 'Expected an array with a supported shape.'); return []; }
    return value;
  };
  if (unknown) unsupported('/', 'unknown_glb_chunks');
  if (g.asset.minVersion !== undefined && g.asset.minVersion !== '2.0') unsupported('/asset/minVersion', 'other_minimum_version');
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (g[key] !== undefined && (!Array.isArray(g[key]) || g[key].some(x => typeof x !== 'string'))) fail('JSON_SHAPE', 'Extension declarations must be string arrays.');
    if (g[key]?.length) unsupported(`/${key}`, 'gltf_extensions');
  }
  const scan = [g];
  while (scan.length) {
    const item = scan.pop();
    if (object(item) && item.extensions !== undefined) unsupported('/', 'gltf_extensions');
    if (item && typeof item === 'object') for (const child of Object.values(item)) if (child && typeof child === 'object') scan.push(child);
  }
  const compressed = view => object(view.extensions) && ('EXT_meshopt_compression' in view.extensions);
  const bufferOK = g.buffers.map((b, i) => {
    if ('uri' in b) { unsupported(`/buffers/${i}/uri`, 'external_or_data_uri_buffers'); return false; }
    if (i !== 0 || !uint(b.byteLength) || b.byteLength > bin.length || bin.length - b.byteLength > 3) { finding('BUFFER_BOUNDS', 'error', `/buffers/${i}`, 'Embedded buffer length is invalid or inconsistent with the BIN chunk.'); return false; }
    return true;
  });
  g.images.forEach((im, i) => { if ('uri' in im) unsupported(`/images/${i}/uri`, 'external_or_data_uri_images'); });
  const views = g.bufferViews.map((b, i) => {
    const p = `/bufferViews/${i}`;
    if (!ref(b.buffer, g.buffers, `${p}/buffer`)) return null;
    const offset = b.byteOffset ?? 0;
    if (!uint(offset) || !uint(b.byteLength) || b.byteLength === 0 || !uint(g.buffers[b.buffer].byteLength) || !Number.isSafeInteger(offset + b.byteLength) || offset + b.byteLength > g.buffers[b.buffer].byteLength) { finding('BUFFER_VIEW_BOUNDS', 'error', p, 'Buffer view lies outside its declared buffer.'); return null; }
    if (b.byteStride !== undefined && (!uint(b.byteStride) || b.byteStride < 4 || b.byteStride > 252 || b.byteStride % 4)) { finding('ACCESSOR_STRIDE', 'error', `${p}/byteStride`, 'Byte stride must be a multiple of four between 4 and 252.'); return null; }
    if (!bufferOK[b.buffer] || compressed(b)) { omit('unavailable_binary_accessors'); return null; }
    return { ...b, offset };
  });
  let scalarWork = 0;
  const decoded = new Map();
  const accessors = g.accessors.map((a, i) => {
    const p = `/accessors/${i}`, ct = typeof a.componentType === 'number' && Object.hasOwn(CT, a.componentType) ? CT[a.componentType] : null, shape = typeof a.type === 'string' && Object.hasOwn(TYPES, a.type) ? TYPES[a.type] : null;
    if (!ct || !shape || !uint(a.count) || a.count === 0) { finding('ACCESSOR_SHAPE', 'error', p, 'Accessor component type, shape, or count is invalid.'); return null; }
    if (a.count > LIMITS.accessorCount) { unsupported(p, 'accessor_count_limit'); return null; }
    if (a.normalized !== undefined && (typeof a.normalized !== 'boolean' || a.normalized && [5125, 5126].includes(a.componentType))) finding('ACCESSOR_SHAPE', 'error', `${p}/normalized`, 'Accessor normalization is invalid for its component type.');
    for (const key of ['min', 'max']) if (a[key] !== undefined && (!Array.isArray(a[key]) || a[key].length !== shape[0] * shape[1] || a[key].some(v => typeof v !== 'number' || !Number.isFinite(v)))) finding('NONFINITE_OR_SHAPE', 'error', `${p}/${key}`, 'Accessor bounds must contain finite numbers with the declared shape.');
    if (a.sparse !== undefined) { unsupported(`${p}/sparse`, 'sparse_accessors'); return null; }
    if (a.bufferView === undefined) { unsupported(p, 'accessors_without_buffer_view'); return null; }
    if (!ref(a.bufferView, views, `${p}/bufferView`)) return null;
    const view = views[a.bufferView];
    if (!view) return null;
    const [size, method] = ct, [columns, rows] = shape;
    const columnBytes = columns > 1 ? Math.ceil(rows * size / 4) * 4 : rows * size;
    const elementBytes = columns * columnBytes, offset = a.byteOffset ?? 0, stride = view.byteStride ?? elementBytes;
    // glTF allows omission of trailing padding after the final matrix column.
    const lastElementBytes = (columns - 1) * columnBytes + rows * size;
    if (!uint(offset) || offset % size || (view.offset + offset) % size || (columns > 1 && (view.offset + offset) % 4)) { finding('ACCESSOR_ALIGNMENT', 'error', p, 'Accessor data does not satisfy component or matrix alignment.'); return null; }
    if (stride < elementBytes || stride % size) { finding('ACCESSOR_STRIDE', 'error', p, 'Accessor stride is smaller than its element or is misaligned.'); return null; }
    const end = offset + (a.count - 1) * stride + lastElementBytes;
    if (!Number.isSafeInteger(end) || end > view.byteLength || view.offset + end > bin.length) { finding('ACCESSOR_BOUNDS', 'error', p, 'Accessor data lies outside the buffer view or BIN chunk.'); return null; }
    return { ...a, start: view.offset + offset, stride, columns, rows, columnBytes, size, method };
  });
  const read = index => {
    if (decoded.has(index)) return decoded.get(index);
    const a = accessors[index];
    if (!a) return null;
    const cost = a.count * a.columns * a.rows;
    if (scalarWork + cost > LIMITS.scalarWork) { unsupported(`/accessors/${index}`, 'binary_scalar_work_limit'); decoded.set(index, null); return null; }
    scalarWork += cost;
    const v = new DataView(bin.buffer, bin.byteOffset, bin.byteLength), values = new Array(cost);
    let nonfinite = false, k = 0;
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.columns; c++) for (let r = 0; r < a.rows; r++) {
      const value = v[a.method](a.start + i * a.stride + c * a.columnBytes + r * a.size, true);
      values[k++] = value;
      if (!Number.isFinite(value) && !nonfinite) { finding('NONFINITE_BINARY', 'error', `/accessors/${index}`, 'Supported accessor contains a nonfinite numeric value.', { element: i, component: c * a.rows + r, value: label(value) }); nonfinite = true; }
    }
    decoded.set(index, values); return values;
  };
  for (let i = 0; i < accessors.length; i++) read(i);
  let edges = 0;
  const children = g.nodes.map((n, i) => {
    const p = `/nodes/${i}`;
    for (const [key, length] of [['translation', 3], ['scale', 3], ['rotation', 4], ['matrix', 16]]) if (n[key] !== undefined && (!Array.isArray(n[key]) || n[key].length !== length || n[key].some(v => typeof v !== 'number' || !Number.isFinite(v)))) finding('NONFINITE_OR_SHAPE', 'error', `${p}/${key}`, 'Node transform must contain finite numbers with the expected shape.');
    if (n.matrix !== undefined && ['translation', 'scale', 'rotation'].some(key => n[key] !== undefined)) finding('TRANSFORM_CONFLICT', 'error', p, 'A node cannot define both a matrix and TRS transforms.');
    if (n.weights !== undefined) unsupported(`${p}/weights`, 'morph_targets');
    if (n.skin !== undefined) { ref(n.skin, g.skins, `${p}/skin`); if (n.mesh === undefined) finding('SKIN_WITHOUT_MESH', 'error', p, 'A skinned node must identify a mesh.'); }
    if (n.mesh !== undefined) ref(n.mesh, g.meshes, `${p}/mesh`);
    const list = n.children === undefined ? [] : array(n.children, `${p}/children`);
    edges += list.length;
    if (edges > 50000) fail('WORK_LIMIT', 'Node edge count exceeds the inspection limit.');
    const valid = [], unique = new Set();
    list.forEach((child, j) => { if (ref(child, g.nodes, `${p}/children/${j}`)) { if (unique.has(child)) finding('DUPLICATE_CHILD', 'error', `${p}/children/${j}`, 'Node child reference is duplicated.'); else { unique.add(child); valid.push(child); } } });
    return valid;
  });
  const parents = new Uint16Array(g.nodes.length);
  children.forEach((list, i) => list.forEach(child => { if (++parents[child] === 2) finding('MULTIPLE_PARENTS', 'error', `/nodes/${i}/children`, 'A node is referenced by more than one parent.'); }));
  const state = new Uint8Array(g.nodes.length);
  for (let i = 0; i < g.nodes.length; i++) {
    if (state[i]) continue;
    const stack = [[i, 0]]; state[i] = 1;
    while (stack.length) {
      const frame = stack[stack.length - 1], list = children[frame[0]];
      if (frame[1] >= list.length) { state[frame[0]] = 2; stack.pop(); continue; }
      const child = list[frame[1]++];
      if (state[child] === 1) finding('NODE_CYCLE', 'error', `/nodes/${frame[0]}/children`, 'Node hierarchy contains a cycle.', { node: frame[0], child });
      else if (!state[child]) { state[child] = 1; stack.push([child, 0]); }
    }
  }
  g.scenes.forEach((s, i) => { if (s.nodes !== undefined) array(s.nodes, `/scenes/${i}/nodes`, true).forEach((node, j) => ref(node, g.nodes, `/scenes/${i}/nodes/${j}`)); });
  if (g.scene !== undefined) ref(g.scene, g.scenes, '/scene');
  g.skins.forEach((s, i) => {
    const p = `/skins/${i}`, joints = array(s.joints, `${p}/joints`), seen = new Set();
    joints.forEach((node, j) => { ref(node, g.nodes, `${p}/joints/${j}`); if (seen.has(node)) finding('DUPLICATE_JOINT', 'error', `${p}/joints/${j}`, 'Skin joint reference is duplicated.'); seen.add(node); });
    if (s.skeleton !== undefined) ref(s.skeleton, g.nodes, `${p}/skeleton`);
    if (s.inverseBindMatrices !== undefined && ref(s.inverseBindMatrices, g.accessors, `${p}/inverseBindMatrices`)) {
      const a = g.accessors[s.inverseBindMatrices];
      if (a.type !== 'MAT4' || a.componentType !== 5126 || !uint(a.count) || a.count < joints.length) finding('INVERSE_BIND_SHAPE', 'error', `${p}/inverseBindMatrices`, 'Inverse bind matrices require FLOAT MAT4 values for every joint.');
    }
  });
  let primitives = 0;
  g.meshes.forEach((m, mi) => {
    array(m.primitives, `/meshes/${mi}/primitives`).forEach((p, pi) => {
      if (++primitives > 8192) fail('WORK_LIMIT', 'Primitive count exceeds the inspection limit.');
      if (!object(p) || !object(p.attributes)) { finding('INVALID_SHAPE', 'error', `/meshes/${mi}/primitives/${pi}`, 'Mesh primitive attributes must be an object.'); return; }
      if (p.targets !== undefined || m.weights !== undefined) unsupported(`/meshes/${mi}/primitives/${pi}`, 'morph_targets');
      if (Object.keys(p.attributes).some(key => /^JOINTS_/.test(key) && key !== 'JOINTS_0')) unsupported(`/meshes/${mi}/primitives/${pi}/attributes`, 'additional_joint_attribute_sets');
      for (const a of Object.values(p.attributes)) ref(a, g.accessors, `/meshes/${mi}/primitives/${pi}/attributes`);
      if (p.indices !== undefined) ref(p.indices, g.accessors, `/meshes/${mi}/primitives/${pi}/indices`);
    });
  });
  // Mesh instancing: JOINTS indices refer to each instance's skin list, not node IDs.
  let jointWork = 0, jointInstances = 0;
  jointInstancesLoop: for (let ni = 0; ni < g.nodes.length; ni++) {
    const n = g.nodes[ni];
    if (!uint(n.mesh) || !g.meshes[n.mesh] || !uint(n.skin) || !g.skins[n.skin]) continue;
    const joints = g.skins[n.skin].joints;
    if (!Array.isArray(joints)) continue;
    const ps = g.meshes[n.mesh].primitives;
    if (!Array.isArray(ps)) continue;
    for (let pi = 0; pi < ps.length; pi++) {
      if (++jointInstances > LIMITS.jointInstances) { unsupported(`/nodes/${ni}`, 'joint_instance_visit_limit'); break jointInstancesLoop; }
      const p = ps[pi];
      if (!object(p) || !object(p.attributes)) continue;
      const loc = `/nodes/${ni}`, index = p.attributes.JOINTS_0;
      if (index === undefined) { finding('MISSING_JOINTS', 'error', loc, 'Skinned mesh primitive has no JOINTS_0 attribute.', { primitive: pi }); continue; }
      if (!uint(index)) continue; // Primitive reference validation already reports malformed indices.
      const a = g.accessors[index];
      if (!a) continue;
      if (a.type !== 'VEC4' || ![5121, 5123].includes(a.componentType) || a.normalized === true) { finding('JOINT_ACCESSOR_SHAPE', 'error', loc, 'Joint indices require unnormalized unsigned byte or unsigned short VEC4 values.', { primitive: pi }); continue; }
      const position = uint(p.attributes.POSITION) ? g.accessors[p.attributes.POSITION] : undefined, weights = uint(p.attributes.WEIGHTS_0) ? g.accessors[p.attributes.WEIGHTS_0] : undefined;
      if (!weights || weights.type !== 'VEC4' || ![5121, 5123, 5126].includes(weights.componentType) || weights.componentType !== 5126 && weights.normalized !== true || weights.count !== a.count || position && position.count !== a.count) finding('SKIN_ATTRIBUTE_SHAPE', 'error', loc, 'Skin attribute counts or weight shapes are inconsistent.', { primitive: pi });
      const values = read(index);
      if (!values) { omit('joint_indices_unavailable'); continue; }
      if ((jointWork += values.length) > LIMITS.scalarWork) { unsupported(loc, 'joint_instance_work_limit'); break jointInstancesLoop; }
      const bad = values.findIndex(v => v >= joints.length);
      if (bad >= 0) finding('JOINT_INDEX_RANGE', 'error', loc, 'A joint index exceeds the joint list of this mesh instance skin.', { primitive: pi, skin: n.skin, element: Math.floor(bad / 4), component: bad % 4, value: values[bad], joint_count: joints.length });
    }
  }
  let animationWork = 0;
  const timeChecked = new Set();
  g.animations.forEach((anim, ai) => {
    const p = `/animations/${ai}`, samplers = array(anim.samplers, `${p}/samplers`), channels = array(anim.channels, `${p}/channels`);
    animationWork += samplers.length + channels.length;
    if (animationWork > 50000) fail('WORK_LIMIT', 'Animation object count exceeds the inspection limit.');
    samplers.forEach((s, si) => {
      const loc = `${p}/samplers/${si}`;
      if (!object(s)) { finding('INVALID_SHAPE', 'error', loc, 'Animation sampler must be an object.'); return; }
      const inputOK = ref(s.input, g.accessors, `${loc}/input`);
      ref(s.output, g.accessors, `${loc}/output`);
      const interpolation = s.interpolation ?? 'LINEAR';
      if (!['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation)) unsupported(`${loc}/interpolation`, 'unknown_animation_interpolation');
      if (inputOK) {
        const a = g.accessors[s.input];
        if (a.componentType !== 5126 || a.type !== 'SCALAR' || a.normalized === true) finding('ANIMATION_INPUT_SHAPE', 'error', `${loc}/input`, 'Animation input requires unnormalized FLOAT SCALAR times.');
        else if (!timeChecked.has(s.input)) {
          timeChecked.add(s.input);
          const times = read(s.input);
          if (!times) omit('animation_times_unavailable');
          else for (let j = 0; j < times.length; j++) if (!Number.isFinite(times[j]) || times[j] < 0 || j > 0 && times[j] <= times[j - 1]) { finding('ANIMATION_TIME_ORDER', 'error', `${loc}/input`, 'Animation times must be finite, nonnegative, and strictly increasing.', { element: j, value: label(times[j]) }); break; }
        }
      }
    });
    channels.forEach((c, ci) => {
      const loc = `${p}/channels/${ci}`;
      if (!object(c) || !object(c.target)) { finding('INVALID_SHAPE', 'error', loc, 'Animation channel and target must be objects.'); return; }
      const samplerOK = ref(c.sampler, samplers, `${loc}/sampler`);
      if (c.target.node === undefined) unsupported(`${loc}/target`, 'animation_target_without_node');
      else if (ref(c.target.node, g.nodes, `${loc}/target/node`) && g.nodes[c.target.node].matrix !== undefined) finding('ANIMATED_MATRIX_NODE', 'error', `${loc}/target/node`, 'TRS animation cannot target a node with a matrix transform.');
      const outputShapes = { translation: 'VEC3', scale: 'VEC3', rotation: 'VEC4' };
      const expected = typeof c.target.path === 'string' && Object.hasOwn(outputShapes, c.target.path) ? outputShapes[c.target.path] : null;
      if (!expected) { unsupported(`${loc}/target/path`, c.target.path === 'weights' ? 'morph_animation' : 'unknown_animation_path'); return; }
      if (samplerOK && object(samplers[c.sampler])) {
        const sampler = samplers[c.sampler], a = uint(sampler.output) ? g.accessors[sampler.output] : undefined, inputAccessor = uint(sampler.input) ? g.accessors[sampler.input] : undefined;
        if (a && (a.type !== expected || a.componentType !== 5126 || a.normalized === true)) finding('ANIMATION_OUTPUT_SHAPE', 'error', `${loc}/target/path`, 'Animation output must use the FLOAT vector shape required by the target path.');
        const interpolation = sampler.interpolation ?? 'LINEAR';
        if (inputAccessor && uint(inputAccessor.count) && a && ['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation)) {
          const factor = interpolation === 'CUBICSPLINE' ? 3 : 1;
          if (a.count !== inputAccessor.count * factor) finding('ANIMATION_OUTPUT_COUNT', 'error', `${p}/samplers/${c.sampler}/output`, 'Animation output count does not match input count and interpolation.', { expected: inputAccessor.count * factor, actual: uint(a.count) ? a.count : 0, channel: ci, target_node: uint(c.target.node) ? c.target.node : null, target_path: c.target.path, input_accessor: sampler.input, output_accessor: sampler.output, interpolation });
        }
      }
    });
  });
  return report;
}
