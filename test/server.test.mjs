import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createQaServer } from '../src/server.mjs';
import { buildFixture } from '../fixtures/generate.mjs';
import { validateReview } from '../src/review.mjs';
import { validateMeasuredExport } from '../src/measured-export.mjs';

async function host(t, options = { mock: true }) {
  const server = createQaServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, binary = false, extra = {}) => fetch(base + path, {
    method: 'POST', headers: { Origin: base, 'X-Rig-QA-Request': '1', 'Content-Type': binary ? 'application/octet-stream' : 'application/json', ...(binary ? { 'X-Asset-Rights': 'owned-or-licensed' } : {}), ...extra }, body: binary ? body : JSON.stringify(body)
  });
  const inspect = async (fixture = buildFixture({ timeValues: [0, 0] })) => (await post('/api/inspect', fixture, true)).json();
  return { base, post, inspect };
}

test('prepared export recheck requires reviewed workflow evidence, freshly checks separate bytes, preserves broken report and never calls provider', async t => {
  let calls = 0;
  const { base, post, inspect } = await host(t, { apiKey: 'not-transmitted', liveAllowed: true, fetchImpl: () => { calls++; throw Error('No provider request'); } });
  const before = await (await post('/api/workflow-test', {})).json();
  assert.equal(before.visual.asset_sha256, before.report.asset_sha256);
  const body = { report_id: before.report_id, report_sha256: before.report_sha256, reviewed: true };
  assert.equal((await post('/api/workflow-recheck', { ...body, reviewed: false })).status, 400);
  assert.equal((await post('/api/workflow-recheck', { ...body, report_sha256: 'forged' })).status, 400);
  assert.equal((await post('/api/workflow-recheck', { ...body, report_id: 'expired' })).status, 404);
  assert.equal((await post('/api/workflow-recheck', { ...body, repair: true })).status, 400);
  const other = await inspect();
  assert.equal((await post('/api/workflow-recheck', { report_id: other.report_id, report_sha256: other.report_sha256, reviewed: true })).status, 400);
  const after = await (await post('/api/workflow-recheck', body)).json();
  assert.equal(after.type, 'prepared-export-comparison'); assert.equal(after.report.findings.length, 0);
  assert.equal(after.official_validation.status, 'complete'); assert.equal(after.official_validation.counts.errors, 0);
  assert.equal(after.official_validation.messages.length, 0);
  assert.notEqual(after.report.asset_sha256, before.report.asset_sha256);
  assert.equal(after.visual.asset_sha256, after.report.asset_sha256);
  assert.equal(after.original_asset_sha256, before.report.asset_sha256);
  assert.equal(after.original_changed, false); assert.equal(after.automatic_repair, false); assert.equal(after.new_provider_requests, 0);
  for (const [path, expected] of [['workflow-flawed', before.report.asset_sha256], ['workflow-valid', after.report.asset_sha256]]) {
    const bytes = Buffer.from(await (await fetch(`${base}/api/fixtures/${path}.glb`)).arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  }
  const unchanged = await (await post('/api/export-inspection', { report_id: before.report_id, report_sha256: before.report_sha256, official_sha256: before.official_sha256 })).json();
  assert.deepEqual(unchanged.inspection, before.report); assert.equal(unchanged.official_validation.counts.errors, 3);
  assert.equal(calls, 0);
});

test('prepared recheck timeout remains explicit and cannot become a conformance pass', async t => {
  const { post } = await host(t, { conformanceOptions: { timeoutMs: 1 } });
  const before = await (await post('/api/workflow-test', {})).json();
  const after = await (await post('/api/workflow-recheck', { report_id: before.report_id, report_sha256: before.report_sha256, reviewed: true })).json();
  assert.equal(after.report.findings.length, 0); assert.equal(after.official_validation.status, 'timeout');
});

test('inspection-only export binds both measured sources and does not imply review or inference', async t => {
  let calls = 0;
  const { post, inspect } = await host(t, { apiKey: 'never-transmitted', fetchImpl: () => { calls++; } });
  const result = await inspect();
  assert.equal(result.official_validation.status, 'complete');
  const body = { report_id: result.report_id, report_sha256: result.report_sha256, official_sha256: result.official_sha256 };
  const exported = await (await post('/api/export-inspection', body)).json();
  assert.equal(exported.type, 'measured-inspection');
  assert.equal(validateMeasuredExport(exported), exported);
  assert.throws(() => validateMeasuredExport({ ...exported, repair_approved: true }));
  assert.throws(() => validateMeasuredExport({ ...exported, official_sha256: 'a'.repeat(64) }));
  const forged = structuredClone(exported); forged.official_validation.asset_sha256 = 'b'.repeat(64); forged.official_sha256 = createHash('sha256').update(JSON.stringify(forged.official_validation)).digest('hex');
  assert.throws(() => validateMeasuredExport(forged));
  assert.equal(exported.human_review, 'not recorded');
  assert.equal(exported.repair_approved, false);
  const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(sha(exported.inspection), exported.report_sha256);
  assert.equal(sha(exported.official_validation), exported.official_sha256);
  assert.equal(exported.asset_sha256, exported.official_validation.asset_sha256);
  assert.equal((await post('/api/export-inspection', { ...body, official_sha256: 'tampered' })).status, 400);
  assert.equal((await post('/api/export-inspection', { ...body, report_sha256: 'tampered' })).status, 400);
  assert.equal((await post('/api/export-inspection', { ...body, reviewed: true })).status, 400);
  assert.equal(calls, 0);
});

test('export-workflow demo replays hash-matched real advice, includes official evidence and leaves review unset', async t => {
  let calls = 0;
  const { post } = await host(t, { apiKey: 'not-transmitted', liveAllowed: true, fetchImpl: () => { calls++; throw Error('Forbidden live call'); } });
  const response = await post('/api/workflow-test', {}); assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.valid_report.findings.length, 0);
  assert.deepEqual(result.report.findings.map(f => f.code), ['JOINT_INDEX_RANGE', 'ANIMATION_OUTPUT_COUNT']);
  assert.equal(result.official_validation.counts.errors, 3);
  assert.equal(result.metadata.mode, 'recorded'); assert.equal(result.new_provider_requests, 0);
  assert(result.advice.recommendations[0].rationale.includes('0‑23'));
  assert(result.advice.recommendations[1].rationale.includes('node 0'));
  assert(result.advice.recommendations.every(r => r.priority === 'high'));
  const exportResponse = await post('/api/export-inspection', { report_id: result.report_id, report_sha256: result.report_sha256, official_sha256: result.official_sha256 });
  assert.equal(validateMeasuredExport(await exportResponse.json()).human_review, 'not recorded');
  const reviewed = await post('/api/review', { report_id: result.report_id, report_sha256: result.report_sha256, advice_sha256: result.advice_sha256,
    decisions: result.advice.recommendations.map(r => ({ recommendation_id: r.id, decision: 'defer' })), reviewed: true });
  assert.equal(validateReview(await reviewed.json()).human_review.repair_approved, false);
  assert.equal((await post('/api/workflow-test', { approve_external_send: true })).status, 400);
  assert.equal(calls, 0);
});

test('bounded validation stays responsive, blocks concurrent uploads and exposes timeout separately', async t => {
  const { base, post } = await host(t);
  const pending = post('/api/inspect', buildFixture(), true);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await fetch(base + '/api/status')).status, 200);
  assert.equal((await post('/api/inspect', buildFixture(), true)).status, 429);
  assert.equal((await pending).status, 200);
  const timed = await host(t, { conformanceOptions: { timeoutMs: 1 } });
  const result = await timed.inspect();
  assert.equal(result.official_validation.status, 'timeout');
  assert(result.report.findings.length > 0);
  assert.equal((await timed.post('/api/export-inspection', { report_id: result.report_id, report_sha256: result.report_sha256, official_sha256: result.official_sha256 })).status, 200);
});

test('bone-index demo freshly measures its recording, never calls provider, and requires separate review', async t => {
  let calls = 0;
  const { post } = await host(t, { apiKey: 'fake-key', liveAllowed: true, fetchImpl: async () => { calls++; throw Error('No provider call allowed'); } });
  const result = await (await post('/api/quality-test', {})).json();
  assert.equal(result.valid_report.findings.length, 0);
  assert.equal(result.report.findings[0].code, 'JOINT_INDEX_RANGE');
  assert.equal(result.report.findings[0].evidence.value, 7);
  assert.equal(result.metadata.mode, 'recorded');
  assert.equal(result.advice.recommendations[0].action, 'review_numeric_data');
  assert.equal(result.new_provider_requests, 0);
  assert.equal(calls, 0);
  assert.equal((await post('/api/quality-test', { report: {} })).status, 400);
  const exported = await (await post('/api/review', { report_id: result.report_id, report_sha256: result.report_sha256, advice_sha256: result.advice_sha256, decisions: [{ recommendation_id: 'R0001', decision: 'accept' }], reviewed: true })).json();
  assert.equal(validateReview(exported), exported);
  assert.equal(exported.provider.mode, 'recorded');
  assert.equal(exported.human_review.repair_approved, false);
});

test('independent inspection → labeled mock advice → hash-bound human review; original unchanged', async t => {
  const { base, post, inspect } = await host(t);
  const original = buildFixture({ timeValues: [0, 0] });
  const hash = () => createHash('sha256').update(original).digest('hex');
  const initial = hash();
  const inspection = await inspect(original);
  assert.equal(inspection.report.asset_sha256, initial);
  assert(inspection.report.findings.some(item => item.code === 'ANIMATION_TIME_ORDER'));
  const result = await post('/api/recommend', { report_id: inspection.report_id, approve_external_send: true });
  assert.equal(result.status, 200);
  const advice = await result.json();
  assert.equal(advice.metadata.mode, 'mock');
  assert.equal(advice.metadata.model, 'none');
  const decisions = advice.advice.recommendations.map(item => ({ recommendation_id: item.id, decision: 'defer' }));
  const body = { report_id: inspection.report_id, report_sha256: inspection.report_sha256, advice_sha256: advice.advice_sha256, decisions, reviewed: true };
  const reviewed = await (await post('/api/review', body)).json();
  assert.equal(reviewed.asset_sha256, initial);
  assert.equal(reviewed.human_review.repair_approved, false);
  assert.deepEqual(reviewed.human_review.decisions, decisions);
  assert.equal(validateReview(reviewed), reviewed);
  assert.throws(() => validateReview({ ...reviewed, human_review: { ...reviewed.human_review, repair_approved: true } }), /Review export/);
  assert.throws(() => validateReview({ ...reviewed, provider: { ...reviewed.provider, mode: 'live' } }), /Review export/);
  assert.throws(() => validateReview({ ...reviewed, report_sha256: 'a'.repeat(64) }), /Review export/);
  assert.equal(hash(), initial);
  assert.equal((await post('/api/review', { ...body, report_sha256: 'f'.repeat(64) })).status, 400);
  assert.equal((await post('/api/review', { ...body, decisions: [] })).status, 400);
  assert.equal((await post('/api/review', { ...body, decisions: decisions.map(item => ({ ...item, decision: 'apply' })) })).status, 400);
  assert.equal((await post('/api/review', { ...body, reviewed: false })).status, 400);
  assert.equal((await post('/api/recommend', { report_id: inspection.report_id, approve_external_send: true })).status, 409);
  assert.equal((await (await fetch(base + '/api/status')).json()).mode, 'mock');
});

test('offline mode never sends a provider request, even with an ambient key', async t => {
  let calls = 0;
  const { post, inspect } = await host(t, { apiKey: 'fixture-secret-never-sent', fetchImpl: () => { calls++; } });
  const inspection = await inspect();
  assert.equal((await post('/api/recommend', { report_id: inspection.report_id, approve_external_send: true })).status, 409);
  assert.equal(calls, 0);
});

test('guided test runs fresh fixtures and recorded NVIDIA advice without fetch or automatic human review', async t => {
  let calls = 0;
  const { post } = await host(t, { apiKey: 'fake-never-transmitted', liveAllowed: true, fetchImpl: () => { calls++; throw new Error('No paid call permitted'); } });
  const response = await post('/api/guided-test', {});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.valid_report.findings.length, 0);
  assert.deepEqual(result.expected_times, [0, 0]);
  assert.equal(result.report.findings[0].code, 'ANIMATION_TIME_ORDER');
  assert.equal(result.metadata.mode, 'recorded');
  assert.equal(result.new_provider_requests, 0);
  assert.equal(calls, 0);
  assert.equal((await post('/api/guided-test', { approve_external_send: true })).status, 400);
  assert.equal((await post('/api/recommend', { report_id: result.report_id, approve_external_send: true })).status, 409);
  const reviewBody = { report_id: result.report_id, report_sha256: result.report_sha256, advice_sha256: result.advice_sha256,
    decisions: result.advice.recommendations.map(item => ({ recommendation_id: item.id, decision: 'defer' })), reviewed: true };
  const review = await (await post('/api/review', reviewBody)).json();
  assert.equal(validateReview(review), review);
  assert.equal(review.provider.mode, 'recorded');
  assert.equal(review.human_review.repair_approved, false);
  assert.throws(() => validateReview({ ...review, provider: { ...review.provider, mode: 'live' } }), /Review export/);
  const missingProvenance = structuredClone(review); delete missingProvenance.provider.recording_evidence_sha256;
  assert.throws(() => validateReview(missingProvenance), /Review export/);
  assert.equal(calls, 0);
});

test('local boundary blocks cross-origin, missing rights, wrong content type, injected report and repair endpoint', async t => {
  const { base, post, inspect } = await host(t);
  assert.equal((await post('/api/inspect', buildFixture(), true, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await post('/api/inspect', buildFixture(), true, { 'X-Asset-Rights': '' })).status, 400);
  assert.equal((await post('/api/inspect', {}, false)).status, 415);
  const inspection = await inspect();
  assert.equal((await post('/api/recommend', { report_id: inspection.report_id, approve_external_send: true, report: { malicious: true } })).status, 400);
  assert.equal((await post('/api/recommend', { report_id: inspection.report_id, approve_external_send: false })).status, 400);
  assert.equal((await post('/api/repair', {})).status, 404);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/status', { headers: { Host: 'attacker.invalid' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(base + '/api/status?key=secret')).status, 400);
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
});

test('fixture endpoint uses self-contained owned GLB bytes; malformed uploads do not crash server', async t => {
  const { base, post } = await host(t);
  const valid = await fetch(base + '/api/fixtures/valid.glb');
  assert.equal(valid.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(Buffer.from(await valid.arrayBuffer()).subarray(0, 4).toString(), 'glTF');
  assert.equal((await post('/api/inspect', Buffer.from('bad'), true)).status, 400);
  assert.equal((await fetch(base + '/api/status')).status, 200);
});

test('mock provider errors reach UI as sanitized typed failures and preserve measured report', async t => {
  const secret = 'NEVER-LOG-THIS-FIXTURE-SECRET';
  const { post, inspect } = await host(t, { apiKey: secret, liveAllowed: true, fetchImpl: async () => new Response(JSON.stringify({ error: secret }), { status: 401 }) });
  const inspection = await inspect();
  const response = await post('/api/recommend', { report_id: inspection.report_id, approve_external_send: true });
  assert.equal(response.status, 502);
  const error = await response.text();
  assert(error.includes('NEBIUS_AUTH'));
  assert(!error.includes(secret));
  assert.equal(inspection.report.asset_sha256.length, 64);
});
