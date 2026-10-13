import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { inspectionSchema, adviceSchema, validateAdvice } from './recommend.mjs';
const schema = JSON.parse(readFileSync(new URL('../schemas/review.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true });
ajv.addSchema(inspectionSchema).addSchema(adviceSchema);
const validator = ajv.compile(schema);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateReview(value) {
  const fail = () => { throw Object.assign(new Error('Review export does not match its evidence.'), { code: 'REVIEW_SCHEMA' }); };
  if (!validator(value)) fail();
  validateAdvice(value.inspection, value.ai_suggestions);
  if (value.asset_sha256 !== value.inspection.asset_sha256 || sha(value.inspection) !== value.report_sha256 || sha(value.ai_suggestions) !== value.advice_sha256) fail();
  const ids = new Set(value.ai_suggestions.recommendations.map(item => item.id));
  if (value.human_review.decisions.length !== ids.size) fail();
  for (const decision of value.human_review.decisions) if (!ids.delete(decision.recommendation_id)) fail();
  return value;
}
