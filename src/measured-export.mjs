import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { inspectionSchema, validateInspection } from './recommend.mjs';
import { conformanceSchema, validateConformance, evidenceHash } from './conformance.mjs';
const ajv = new Ajv({ strict: true, strictRequired: false });
ajv.addSchema(inspectionSchema).addSchema(conformanceSchema, 'https://rig-qa.local/schemas/conformance.schema.json');
const check = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/measured-export.schema.json', import.meta.url), 'utf8')));
export function validateMeasuredExport(value) {
  if (!check(value)) throw Object.assign(new Error('Invalid measured export'), { code: 'MEASURED_EXPORT_SCHEMA' });
  validateInspection(value.inspection); validateConformance(value.official_validation);
  if (value.asset_sha256 !== value.inspection.asset_sha256 || value.asset_sha256 !== value.official_validation.asset_sha256
    || evidenceHash(value.inspection) !== value.report_sha256 || evidenceHash(value.official_validation) !== value.official_sha256) {
    throw Object.assign(new Error('Measured evidence mismatch'), { code: 'MEASURED_EXPORT_SCHEMA' });
  }
  return value;
}
