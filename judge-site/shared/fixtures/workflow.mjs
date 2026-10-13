import { Buffer } from 'node:buffer';
import { encodeGlb } from './encode.mjs';

/** Owned procedural ribbon rig: 24 bones, 48 vertices, two 23-frame tracks.
 * An export-workflow test, not a production character or visual-quality benchmark.
 * Faults simulate stale joint mapping and a missing declared animation sample.
 */
export function buildWorkflowFixture({ flawed = false } = {}) {
  const buffers = [], views = [], accessors = []; let length = 0;
  function accessor(values, componentType, type, components, bounds, target) {
    const size = componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4;
    const data = Buffer.alloc(Math.ceil(values.length * size / 4) * 4);
    values.forEach((value, i) => componentType === 5121 ? data.writeUInt8(value, i) : componentType === 5123 ? data.writeUInt16LE(value, i * 2) : data.writeFloatLE(value, i * 4));
    const bufferView = views.length;
    views.push({ buffer: 0, byteOffset: length, byteLength: values.length * size, ...(target ? { target } : {}) });
    length += data.length; buffers.push(data);
    accessors.push({ bufferView, componentType, count: values.length / components, type, ...bounds });
    return accessors.length - 1;
  }
  const positions = [], normals = [], joints = [], weights = [], indices = [], inverse = [];
  for (let bone = 0; bone < 24; bone++) {
    for (const x of [-0.03, 0.03]) { positions.push(x, bone / 23, 0); normals.push(0, 0, 1); joints.push(bone, 0, 0, 0); weights.push(1, 0, 0, 0); }
    inverse.push(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-bone/23,0,1);
    if (bone < 23) { const v = bone * 2; indices.push(v, v+1, v+2, v+1, v+3, v+2); }
  }
  if (flawed) joints[0] = 24; // Active weight1; valid slots0..23.
  const position = accessor(positions, 5126, 'VEC3', 3, { min: [Math.fround(-0.03),0,0], max: [Math.fround(0.03),1,0] }, 34962);
  const normal = accessor(normals, 5126, 'VEC3', 3, {}, 34962);
  const joint = accessor(joints, 5121, 'VEC4', 4, {}, 34962);
  const weight = accessor(weights, 5126, 'VEC4', 4, {}, 34962);
  const index = accessor(indices, 5123, 'SCALAR', 1, {}, 34963);
  const bind = accessor(inverse, 5126, 'MAT4', 16, {});
  const times = Array.from({ length: 23 }, (_, i) => i / 24);
  const input = accessor(times, 5126, 'SCALAR', 1, { min: [0], max: [Math.fround(22 / 24)] });
  const translation = accessor(times.flatMap(t => [0, 0.03 * Math.sin(t * Math.PI), 0]), 5126, 'VEC3', 3, {});
  const rotation = accessor(times.flatMap(t => [0, 0, Math.sin(t * 0.15), Math.cos(t * 0.15)]), 5126, 'VEC4', 4, {});
  if (flawed) accessors[translation].count = 22; // Bytes preserved; declared sample missing.
  const nodes = Array.from({ length: 24 }, (_, i) => ({ translation: [0, i ? 1 / 23 : 0, 0], ...(i < 23 ? { children: [i + 1] } : {}) }));
  nodes.push({ mesh: 0, skin: 0 });
  return encodeGlb({ asset: { version: '2.0', generator: 'Rig QA Desk owned workflow fixture' },
    scene: 0, scenes: [{ nodes: [0, 24] }], nodes,
    skins: [{ joints: Array.from({ length: 24 }, (_, i) => i), skeleton: 0, inverseBindMatrices: bind }],
    meshes: [{ primitives: [{ attributes: { POSITION: position, NORMAL: normal, JOINTS_0: joint, WEIGHTS_0: weight }, indices: index }] }],
    animations: [{ samplers: [{ input, output: translation, interpolation: 'LINEAR' }, { input, output: rotation, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }, { sampler: 1, target: { node: 12, path: 'rotation' } }] }],
    accessors, bufferViews: views, buffers: [{ byteLength: length }] }, Buffer.concat(buffers));
}
