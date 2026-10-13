import { parentPort, workerData } from 'node:worker_threads';
import validator from 'gltf-validator';

// No paths, asset names, credentials or external-resource bytes enter this worker.
try {
  const bytes = new Uint8Array(workerData);
  const g = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer).getUint32(12, true))));
  const result = await validator.validateBytes(bytes, { format: 'glb', maxIssues: 128, writeTimestamp: false,
    externalResourceFunction: async () => { throw new Error('EXTERNAL_RESOURCE_BLOCKED'); } });
  const messages = result.issues.messages.map((item, i) => {
    const issue = { id: `K${String(i + 1).padStart(4, '0')}`, code: item.code, severity: ['error', 'warning', 'info', 'hint'][item.severity], location: item.pointer || '/', context: null };
    const match = /^\/nodes\/(\d+)$/.exec(issue.location);
    if (item.code === 'NODE_SKINNED_MESH_NON_ROOT' && match) {
      const node = Number(match[1]), mesh = g.nodes[node];
      const parents = g.nodes.flatMap((n, index) => n.children?.includes(node) ? [index] : []);
      const skin = g.skins?.[mesh.skin];
      issue.context = { node, skin: mesh.skin, parents, joint_count: skin?.joints?.length ?? 0,
        parent_scales: parents.map(p => g.nodes[p].matrix ? null : g.nodes[p].scale ?? [1, 1, 1]),
        parent_matrices: parents.map(p => g.nodes[p].matrix ?? null),
        animated_nodes: [...new Set((g.animations || []).flatMap(a => (a.channels || []).map(c => c.target?.node)).filter(n => n === node || parents.includes(n)))] };
    }
    return issue;
  });
  const supported = validator.supportedExtensions();
  parentPort.postMessage({ status: 'complete', validator_version: validator.version(), counts: {
    errors: result.issues.numErrors, warnings: result.issues.numWarnings, infos: result.issues.numInfos, hints: result.issues.numHints },
    truncated: result.issues.truncated, external_resources: 'blocked', messages,
    extensions: [...new Set([...(g.extensionsUsed || []), ...(g.extensionsRequired || [])])].map(name => ({ name, supported: supported.includes(name) })) });
} catch { parentPort.postMessage({ status: 'unavailable' }); }
