import { Buffer } from 'node:buffer';
import { encodeGlb } from './encode.mjs';
export { encodeGlb } from './encode.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Fresh procedural triangle and two-joint rig; no imported assets or private code. */
export function buildFixture(options = {}) {
  const buffers = [], views = [];
  let length = 0;
  function append(values, componentType) {
    const size = componentType === 5121 ? 1 : 4;
    const bytes = Buffer.alloc(Math.ceil(values.length * size / 4) * 4);
    values.forEach((v, i) => { if (size === 1) bytes.writeUInt8(v, i); else bytes.writeFloatLE(v, i * 4); });
    const index = views.length;
    views.push({ buffer: 0, byteOffset: length, byteLength: values.length * size });
    length += bytes.length; buffers.push(bytes); return index;
  }
  const times = options.timeValues ?? [0, 1];
  const outputType = options.outputType ?? 'VEC3';
  const interpolation = options.interpolation ?? 'LINEAR';
  const outputCount = times.length * (interpolation === 'CUBICSPLINE' ? 3 : 1);
  const components = outputType === 'VEC4' ? 4 : outputType === 'SCALAR' ? 1 : 3;
  const positions = [-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0];
  const joints = options.jointValues ?? [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0];
  const weights = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const inverseBind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1];
  const output = new Array(outputCount * components).fill(0);
  if (components === 4) for (let i = 3; i < output.length; i += 4) output[i] = 1;
  const document = {
    asset: { version: '2.0', generator: 'Rig QA owned procedural fixture generator' },
    scene: 0, scenes: [{ nodes: [0, 2] }],
    nodes: [{ children: [1] }, { translation: [0, 1, 0] }, { mesh: 0, skin: 0 }],
    skins: [{ joints: [0, 1], skeleton: 0, inverseBindMatrices: 3 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    accessors: [
      { bufferView: append(positions, 5126), componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] },
      { bufferView: append(joints, 5121), componentType: 5121, count: 3, type: 'VEC4' },
      { bufferView: append(weights, 5126), componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: append(inverseBind, 5126), componentType: 5126, count: 2, type: 'MAT4' },
      { bufferView: append(times, 5126), componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: append(output, 5126), componentType: 5126, count: outputCount, type: outputType },
    ],
    animations: [{ samplers: [{ input: 4, output: 5, interpolation }], channels: [{ sampler: 0, target: { node: 1, path: outputType === 'VEC4' ? 'rotation' : 'translation' } }] }],
    buffers: [{ byteLength: length }], bufferViews: views,
  };
  const binary = Buffer.concat(buffers);
  if (options.mutate) options.mutate(document, binary);
  return encodeGlb(document, binary);
}

export async function writeFixtureFiles(directory = fileURLToPath(new URL('.', import.meta.url))) {
  await mkdir(directory, { recursive: true });
  const files = {
    'valid-skinned.glb': buildFixture(),
    'flawed-skinned.glb': buildFixture({ timeValues: [1, 0], jointValues: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], mutate(g, b) { g.nodes[0].children.push(0); g.animations[0].channels[0].target.node = 99; b.writeFloatLE(NaN, 0); } }),
  };
  for (const [name, bytes] of Object.entries(files)) await writeFile(resolve(directory, name), bytes);
  return Object.keys(files);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const names = await writeFixtureFiles();
  process.stdout.write(`Generated ${names.length} owned procedural GLB fixtures.\n`);
}
