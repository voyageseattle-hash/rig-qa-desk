import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as nodeProvider from '../src/recommend.mjs';
import * as workerProvider from '../judge-site/lib/provider.mjs';
import { createRecommendationAdapter } from '../src/recommend-core.mjs';

// All provider transports in this file are mocks; no credentials or network.
const recorded = JSON.parse(readFileSync(new URL('../evidence/LIVE-QUALITY-2026-10-12.json', import.meta.url), 'utf8'));
const report = () => structuredClone(recorded.inspection);
const advice = () => structuredClone(recorded.ai_suggestions);
const response = value => new Response(JSON.stringify(value), { status: 200 });
const envelope = () => ({ model: nodeProvider.NEBIUS_MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(advice()) } }], usage: { prompt_tokens: 5, total_tokens: 10, unknown: 'discard' } });
const observedError = fn => {
  try { fn(); assert.fail('Expected rejection'); }
  catch (error) { assert.ok(error instanceof nodeProvider.RecommendationError || error instanceof workerProvider.RecommendationError); return [error.kind, error.code, error.message]; }
};

test('portable core and standalone validators require no runtime code generation or filesystem', () => {
  const core = readFileSync(new URL('../src/recommend-core.mjs', import.meta.url), 'utf8');
  const standalone = readFileSync(new URL('../judge-site/lib/schema-validators.mjs', import.meta.url), 'utf8');
  for (const source of [core, standalone]) assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(|node:fs|\brequire\s*\(/);
  assert.throws(() => createRecommendationAdapter({}), TypeError);
  assert.deepEqual(workerProvider.inspectionSchema, nodeProvider.inspectionSchema);
  assert.deepEqual(workerProvider.adviceSchema, nodeProvider.adviceSchema);
  assert.equal(workerProvider.RecommendationError.name, nodeProvider.RecommendationError.name);
});

test('standalone validator generation is reproducible from authoritative schemas', () => {
  const target = new URL('../judge-site/lib/schema-validators.mjs', import.meta.url);
  const before = readFileSync(target);
  execFileSync(process.execPath, [fileURLToPath(new URL('../judge-site/scripts/generate-validators.mjs', import.meta.url))]);
  assert.deepEqual(readFileSync(target), before);
});

test('Node and Worker validators agree on bounded evidence, malformed shapes and Unicode limits', () => {
  assert.deepEqual(workerProvider.createMockAdvice(report()), nodeProvider.createMockAdvice(report()));
  const mutations = [
    value => { value.extra = true; },
    value => { value.findings[0].evidence.number = Infinity; },
    value => { value.findings.push(structuredClone(value.findings[0])); },
    value => { value.findings[0].message = '😀'.repeat(601); },
    value => { value.findings[0].evidence.payload = 'x'.repeat(257); },
    value => { value.coverage.checked = ['x'.repeat(257)]; },
    value => { value.findings[0].location = '/invalid~escape'; },
  ];
  for (const mutate of mutations) {
    const value = report(); mutate(value);
    assert.deepEqual(observedError(() => workerProvider.validateInspection(value)), observedError(() => nodeProvider.validateInspection(value)));
  }
});

test('Node and Worker request payload, pinned model, grammar and sanitized response are identical', async () => {
  const payloads = [], results = [];
  for (const provider of [nodeProvider, workerProvider]) {
    results.push(await provider.requestRecommendations(report(), { apiKey: 'fake-offline-key', fetchImpl: async (url, options) => {
      payloads.push({ url, method: options.method, redirect: options.redirect, headers: options.headers, body: options.body });
      return response(envelope());
    } }));
  }
  assert.deepEqual(payloads[1], payloads[0]);
  assert.deepEqual(results[1].advice, results[0].advice);
  for (const result of results) { assert.equal(result.metadata.mode, 'live'); delete result.metadata.requested_at; }
  assert.deepEqual(results[1].metadata, results[0].metadata);
});

test('Worker preserves fail-closed advice scope and credential redaction', async () => {
  for (const mutate of [
    value => { value.asset_sha256 = 'f'.repeat(64); },
    value => { value.recommendations[0].finding_ids = ['F9999']; },
    value => { value.recommendations[0].rationale = 'The rig is fully verified.'; },
    value => { value.recommendations[0].action = 'repair_mesh'; },
    value => { value.limitations.push(value.limitations[0]); },
  ]) {
    const value = advice(); mutate(value);
    assert.deepEqual(observedError(() => workerProvider.validateAdvice(report(), value)), observedError(() => nodeProvider.validateAdvice(report(), value)));
  }
  let calls = 0;
  await assert.rejects(workerProvider.requestRecommendations(report(), { fetchImpl: async () => { calls++; } }), { code: 'NEBIUS_NO_CREDENTIALS' });
  assert.equal(calls, 0);
  await assert.rejects(workerProvider.requestRecommendations(report(), { apiKey: 'fake-offline-key', fetchImpl: async () => { throw new Error('fake-offline-key diagnostic'); } }), error => error.code === 'NEBIUS_PROVIDER' && !error.message.includes('fake-offline-key'));
});

test('default Worker transport uses manual redirects, rejects 3xx and never follows a credential-bearing redirect', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response('', { status: 302, headers: { Location: 'https://untrusted.invalid/' } });
  };
  await assert.rejects(workerProvider.requestRecommendations(report(), { apiKey: 'fake-offline-key' }), { code: 'NEBIUS_PROVIDER' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, nodeProvider.NEBIUS_ENDPOINT);
  assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer fake-offline-key');
});

test('Worker preserves timeout, malformed-response, wrong-model and provider-error behavior without retries', async () => {
  await assert.rejects(workerProvider.requestRecommendations(report(), { apiKey: 'fake-offline-key', timeoutMs: 5, fetchImpl: async () => new Promise(() => {}) }), { code: 'NEBIUS_TIMEOUT' });
  for (const [fetchImpl, code] of [
    [async () => new Response('not JSON'), 'NEBIUS_MALFORMED'],
    [async () => response({ ...envelope(), model: 'different' }), 'ADVICE_UNSUPPORTED'],
    [async () => new Response('hidden provider diagnostics', { status: 401 }), 'NEBIUS_AUTH'],
    [async () => new Response('hidden provider diagnostics', { status: 429 }), 'NEBIUS_RATE_LIMIT'],
    [async () => new Response('hidden provider diagnostics', { status: 500 }), 'NEBIUS_PROVIDER'],
  ]) {
    let calls = 0;
    await assert.rejects(workerProvider.requestRecommendations(report(), { apiKey: 'fake-offline-key', fetchImpl: async (...args) => { calls++; return fetchImpl(...args); } }), { code });
    assert.equal(calls, 1);
  }
});
