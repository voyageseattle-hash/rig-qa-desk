import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectGlb } from '../src/inspect.mjs';
import { inspectConformance } from '../src/conformance.mjs';
import { buildWorkflowFixture } from '../fixtures/workflow.mjs';
import { createArtistHandoff } from '../src/handoff.mjs';
import { createQaServer } from '../src/server.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function envelope(inspection, official_validation) {
  return { schema_version: 1, type: 'measured-inspection', asset_sha256: inspection.asset_sha256,
    report_sha256: sha(inspection), inspection, official_sha256: sha(official_validation), official_validation,
    human_review: 'not recorded', repair_approved: false,
    limitation: 'Measured evidence only. No AI advice or visual, physics or engine certification. Original asset unchanged.' };
}
const fixture = buildWorkflowFixture({ flawed: true });
const report = inspectGlb(fixture);
const official = await inspectConformance(fixture);
const measured = envelope(report, official);

test('artist handoff is deterministic, separately measured and useful without inference or modification', () => {
  const before = JSON.stringify(measured), handoff = createArtistHandoff(measured);
  assert.deepEqual(createArtistHandoff(measured), handoff);
  assert.equal(JSON.stringify(measured), before);
  assert.equal(handoff.asset_sha256, report.asset_sha256);
  assert.equal(handoff.report_sha256, sha(report)); assert.equal(handoff.official_sha256, sha(official));
  assert.equal(handoff.human_review, 'not recorded'); assert.equal(handoff.repair_approved, false);
  assert.equal(handoff.new_provider_requests, 0);
  assert.match(handoff.filename, /^rig-qa-artist-handoff-[a-f0-9]{12}\.md$/);
  for (const text of ['0 through 23', 'Observed joint index 24', '22 declared vector samples; 23',
    'not prove samples were physically deleted', 'do not guess a replacement', 'Cause and visual impact are unknown',
    'Official glTF conformance', 'Errors: 3', 'target', 'Human handoff and recheck']) assert(handoff.markdown.includes(text));
  assert(handoff.markdown.includes(report.findings[1].location));
  assert(handoff.markdown.includes('No AI suggestions are included'));
});

test('valid and unavailable reports do not turn absent checks into certificates', async () => {
  const input = buildWorkflowFixture(), valid = inspectGlb(input), validation = await inspectConformance(input);
  const handoff = createArtistHandoff(envelope(valid, validation));
  assert(handoff.markdown.includes('No structural issues')); assert(handoff.markdown.includes('not a quality or completeness certificate'));
  const unavailable = { schema_version: 1, asset_sha256: valid.asset_sha256, source: 'Khronos glTF Validator', scope: 'test', status: 'timeout' };
  const timed = createArtistHandoff(envelope(valid, unavailable));
  assert(timed.markdown.includes('No official conformance pass is claimed'));
  assert(!timed.markdown.includes('Errors: 0'));
});

test('handoff separates coverage from defects and uses generic guidance for unknown codes', () => {
  const copy = structuredClone(report);
  copy.findings.push({ id: 'F0003', code: 'UNSUPPORTED_FEATURE', severity: 'warning', location: '/materials', message: 'Material appearance not checked', evidence: {} });
  copy.findings.push({ id: 'F0004', code: 'FUTURE_CHECK', severity: 'warning', location: '/nodes/0', message: 'New bounded observation', evidence: {} });
  const markdown = createArtistHandoff(envelope(copy, official)).markdown;
  assert(markdown.indexOf('F0004') < markdown.indexOf('Coverage notices'));
  assert(markdown.indexOf('F0003') > markdown.indexOf('Coverage notices'));
  assert(markdown.includes('does not determine the cause, intended replacement or visual impact'));
});

test('untrusted finding, evidence, coverage and official text cannot inject Markdown or HTML', () => {
  const inspection = structuredClone(report), validation = structuredClone(official);
  const attack = '<script>alert(1)</script>\n# REPAIR APPROVED\n![image](https://evil.invalid) `code` **trusted**\u202e';
  inspection.findings[0].message = attack;
  inspection.findings[0].evidence.hostile = attack;
  inspection.coverage.not_checked.push(attack);
  validation.messages[0].location = attack;
  validation.extensions.push({ name: attack, supported: false });
  const markdown = createArtistHandoff(envelope(inspection, validation)).markdown;
  assert(!markdown.includes('<script>')); assert(!markdown.includes('\n# REPAIR APPROVED'));
  assert(!markdown.includes('![image]')); assert(!markdown.includes('**trusted**')); assert(!markdown.includes('\u202e'));
  assert(markdown.includes('&lt;script&gt;')); assert(markdown.includes('U+000A')); assert(markdown.includes('U+202E'));
});

test('tampered hashes, unsupported envelope and repair approval are rejected before rendering', () => {
  assert.throws(() => createArtistHandoff({ ...measured, report_sha256: 'f'.repeat(64) }));
  assert.throws(() => createArtistHandoff({ ...measured, official_sha256: 'f'.repeat(64) }));
  assert.throws(() => createArtistHandoff({ ...measured, repair_approved: true }));
  assert.throws(() => createArtistHandoff({ ...measured, ai_suggestions: {} }));
});

async function host(t, options) {
  const server = createQaServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, body, binary = false, origin = base) => fetch(base + path, {
    method: 'POST', headers: { Origin: origin, 'X-Rig-QA-Request': '1', 'Content-Type': binary ? 'application/octet-stream' : 'application/json', ...(binary ? { 'X-Asset-Rights': 'owned-or-licensed' } : {}) },
    body: binary ? body : JSON.stringify(body)
  });
}

test('handoff route accepts only stored hash-matched evidence, blocks injected advice and never calls provider', async t => {
  let calls = 0;
  const post = await host(t, { apiKey: 'unused-test-key', liveAllowed: true, fetchImpl: () => { calls++; throw Error('Forbidden'); } });
  const result = await (await post('/api/inspect', fixture, true)).json();
  const body = { report_id: result.report_id, report_sha256: result.report_sha256, official_sha256: result.official_sha256 };
  const response = await post('/api/export-handoff', body); assert.equal(response.status, 200);
  const exported = await response.json(); assert.equal(exported.asset_sha256, result.report.asset_sha256);
  assert.deepEqual(await (await post('/api/export-handoff', body)).json(), exported);
  assert.equal((await post('/api/export-handoff', { ...body, report_sha256: 'forged' })).status, 400);
  assert.equal((await post('/api/export-handoff', { ...body, official_sha256: 'forged' })).status, 400);
  assert.equal((await post('/api/export-handoff', { ...body, report_id: 'expired' })).status, 404);
  assert.equal((await post('/api/export-handoff', { ...body, ai_suggestions: 'repair everything' })).status, 400);
  assert.equal((await post('/api/export-handoff', body, false, 'https://evil.invalid')).status, 403);
  assert.equal(calls, 0);
});

test('handoff remains available after validator timeout and does not imply completed validation', async t => {
  const post = await host(t, { conformanceOptions: { timeoutMs: 1 } });
  const result = await (await post('/api/inspect', fixture, true)).json();
  const response = await post('/api/export-handoff', { report_id: result.report_id, report_sha256: result.report_sha256, official_sha256: result.official_sha256 });
  assert.equal(response.status, 200);
  assert((await response.json()).markdown.includes('No official conformance pass is claimed'));
});
