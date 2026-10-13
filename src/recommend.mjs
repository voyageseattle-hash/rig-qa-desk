import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { createRecommendationAdapter } from './recommend-core.mjs';
export { NEBIUS_MODEL, NEBIUS_ENDPOINT, ADVICE_LIMITATIONS, RecommendationError } from './recommend-core.mjs';

export const inspectionSchema = JSON.parse(readFileSync(new URL('../schemas/inspection.schema.json', import.meta.url), 'utf8'));
export const adviceSchema = JSON.parse(readFileSync(new URL('../schemas/advice.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: true, allErrors: false });
const adapter = createRecommendationAdapter({
  inspectionSchema, adviceSchema,
  inspectionValidator: ajv.compile(inspectionSchema),
  adviceValidator: ajv.compile(adviceSchema),
});
export const { validateInspection, validateAdvice, createMockAdvice, requestRecommendations } = adapter;
