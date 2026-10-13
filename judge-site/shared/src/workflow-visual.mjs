import { createHash } from 'node:crypto';
import { buildWorkflowFixture } from '../fixtures/workflow.mjs';

// Only our bounded, owned fixture is decoded here. Imported assets never use this
// demonstration path. Geometry comes from the same bytes inspected by the server.
export function workflowVisual({ flawed = true } = {}) {
  const bytes = buildWorkflowFixture({ flawed });
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = bytes.subarray(28 + jsonLength);
  const values = (id, components) => {
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
    const size = a.componentType === 5121 ? 1 : 4;
    return Array.from({ length: a.count }, (_, n) => Array.from({ length: components }, (_, c) => {
      const offset = (view.byteOffset || 0) + (a.byteOffset || 0) + (n * components + c) * size;
      return size === 1 ? bin.readUInt8(offset) : bin.readFloatLE(offset);
    }));
  };
  const primitive = gltf.meshes[0].primitives[0];
  const positions = values(primitive.attributes.POSITION, 3);
  const joints = values(primitive.attributes.JOINTS_0, 4);
  const weights = values(primitive.attributes.WEIGHTS_0, 4);
  const sampler = gltf.animations[0].samplers[0];
  const output = gltf.accessors[sampler.output];
  return {
    asset_sha256: createHash('sha256').update(bytes).digest('hex'),
    kind: 'owned-workflow-rest-data',
    vertices: positions, joint_slots: gltf.skins[0].joints.length,
    vertex: 0, component: 0, joint_slot: joints[0][0], active_weight: weights[0][0],
    timestamps: values(sampler.input, 1).map(v => v[0]),
    declared_samples: output.count,
    stored_vectors: gltf.bufferViews[output.bufferView].byteLength / 12,
    channel: 0, target_node: 0, target_path: 'translation', interpolation: sampler.interpolation,
    input_accessor: sampler.input, output_accessor: sampler.output
  };
}
