import inspectionSchema from '../shared/schemas/inspection.schema.json' with { type: 'json' };
import adviceSchema from '../shared/schemas/advice.schema.json' with { type: 'json' };
import { inspectionValidator, adviceValidator } from './schema-validators.mjs';
import { createRecommendationAdapter } from '../shared/src/recommend-core.mjs';

export { NEBIUS_MODEL, NEBIUS_ENDPOINT, ADVICE_LIMITATIONS, RecommendationError } from '../shared/src/recommend-core.mjs';
export { inspectionSchema, adviceSchema };
const adapter = createRecommendationAdapter({ inspectionSchema, adviceSchema, inspectionValidator, adviceValidator });
export const { validateInspection, validateAdvice, createMockAdvice } = adapter;
// Workerd supports manual redirects, not Node's redirect:'error'. The core
// rejects every non-2xx status, so manual mode never follows redirects or sends
// credentials to a redirect target. Explicit mock transports remain untouched.
const workerFetch = (url, init) => globalThis.fetch(url, { ...init, redirect: 'manual' });
export function requestRecommendations(report, options = {}) {
  return adapter.requestRecommendations(report, { ...options, fetchImpl: options.fetchImpl === undefined ? workerFetch : options.fetchImpl });
}
