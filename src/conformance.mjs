import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { inspectGlb } from './inspect.mjs';

export const conformanceSchema = JSON.parse(readFileSync(new URL('../schemas/conformance.schema.json', import.meta.url), 'utf8'));
// Conditional required keys are declared on the root schema, outside the then branch.
const check = new Ajv({ strict: true, strictRequired: false }).compile(conformanceSchema);
export const evidenceHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateConformance(value) {
  if (!check(value)) throw new Error('Invalid conformance evidence');
  return value;
}
export async function inspectConformance(input, { timeoutMs = 5000, workerUrl = new URL('./conformance-worker.mjs', import.meta.url) } = {}) {
  // Reuse bounded preflight before handing untrusted bytes to the official validator.
  const report = inspectGlb(input);
  const base = { schema_version: 1, asset_sha256: report.asset_sha256, source: 'Khronos glTF Validator',
    scope: 'glTF conformance only; no visual deformation, physics or target-engine certification' };
  const result = await new Promise(resolve => {
    let done = false, timer, worker;
    const finish = async value => { if (done) return; done = true; clearTimeout(timer);
      try { await worker.terminate(); resolve(value); } catch { resolve({ status: 'unavailable' }); } };
    try {
      worker = new Worker(workerUrl, { workerData: Uint8Array.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input), env: {}, execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 } });
    } catch { resolve({ status: 'unavailable' }); return; }
    timer = setTimeout(() => finish({ status: 'timeout' }), timeoutMs);
    worker.once('message', finish);
    worker.once('error', () => finish({ status: 'unavailable' }));
    worker.once('exit', () => finish({ status: 'unavailable' }));
  });
  try { return validateConformance({ ...base, ...result }); }
  catch { return validateConformance({ ...base, status: 'unavailable' }); }
}
