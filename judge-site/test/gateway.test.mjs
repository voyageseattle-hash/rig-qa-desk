import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createQaGateway, resolveJudgeUser } from '../lib/gateway.mjs';
import { createMockAdvice, requestRecommendations, NEBIUS_MODEL } from '../lib/provider.mjs';
import { sqliteD1, grantEnv } from './d1-fake.mjs';

const base = 'https://judge.example';
const env = { ...grantEnv, JUDGE_ALLOWED_USER_IDS: 'owner-a,owner-b', NEBIUS_LIVE_ALLOWED: '1', NEBIUS_API_KEY: 'TEST_ONLY_NOT_A_REAL_KEY' };
const request = (path, body, headers = {}, method = 'POST') => new Request(base + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', 'X-Rig-QA-Request': '1', 'oai-authenticated-user-id': 'owner-a', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const inspect = async (handler, fixture = 'flawed') => (await handler(request('/api/qa/inspect', { fixture }))).json();
const bodyFor = measured => ({ fixture: measured.fixture, asset_sha256: measured.inspection.asset_sha256, report_sha256: measured.report_sha256, request_id: randomUUID(), approved: true });
const answer = report => ({ advice: createMockAdvice(report), metadata: { provider: 'nebius', mode: 'live', model: NEBIUS_MODEL, response_model: NEBIUS_MODEL, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } } });

test('default offline; env fake mode cannot activate mock; status reveals availability without secrets', async () => {
  let calls = 0;
  const handler = createQaGateway({ env: { RIG_QA_LOCAL_MOCK: '1', NEBIUS_API_KEY: env.NEBIUS_API_KEY }, provider: () => { calls++; } });
  const response = await handler(request('/api/qa/status', undefined, {}, 'GET'));
  const text = await response.text(); const status = JSON.parse(text);
  assert.equal(status.mode, 'offline'); assert.equal(status.available_to_user, false); assert.equal(status.live_enabled, false);
  assert.equal(status.limits.max_attempts, 0); assert.ok(!text.includes(env.NEBIUS_API_KEY)); assert.ok(!text.includes('owner-a')); assert.equal(calls, 0);
});
test('owned valid and deliberately flawed fixtures freshly inspected; visual identity matches measured bytes', async () => {
  const handler = createQaGateway();
  const valid = await inspect(handler, 'valid'), flawed = await inspect(handler);
  assert.equal(valid.inspection.findings.filter(row => row.severity === 'error').length, 0);
  assert.equal(flawed.inspection.findings.filter(row => row.severity === 'error').length, 2);
  assert.equal(flawed.visual.asset_sha256, flawed.inspection.asset_sha256);
  assert.equal(flawed.visual.joint_slot, 24); assert.equal(flawed.visual.joint_slots, 24);
  assert.equal(flawed.visual.timestamps.length, 23); assert.equal(flawed.visual.declared_samples, 22); assert.equal(flawed.visual.stored_vectors, 23);
  assert.notEqual(valid.report_sha256, flawed.report_sha256);
});
test('production denies missing/unknown/local simulation IDs even in allowlist; local explicit mock never calls provider', async () => {
  const db = sqliteD1(); let calls = 0;
  const handler = createQaGateway({ db, env: { ...env, JUDGE_ALLOWED_USER_IDS: 'owner-a,local_seedy' }, provider: () => { calls++; } });
  try {
    const measured = await inspect(handler), body = bodyFor(measured);
    for (const id of ['', 'unknown', 'local_seedy', 'owner-a,owner-b']) {
      const res = await handler(request('/api/qa/recommend', body, { 'oai-authenticated-user-id': id })); assert.equal(res.status, 403);
    }
    assert.equal(calls, 0);
    const mock = createQaGateway({ localMock: true, provider: () => { calls++; } });
    const res = await mock(request('/api/qa/recommend', body, { 'oai-authenticated-user-id': 'local_seedy' }));
    assert.equal(res.status, 200); const result = await res.json();
    assert.equal(result.metadata.mode, 'mock'); assert.equal(result.metadata.new_provider_requests, 0); assert.equal(calls, 0);
    assert.equal(resolveJudgeUser(request('/api/qa/status', undefined, { 'oai-authenticated-user-id': 'local_seedy' }, 'GET'), env), null);
  } finally { db.close(); }
});
test('same-origin marker, approval, strict bounded body and fresh hash enforced before reservations/provider', async () => {
  const db = sqliteD1(); let calls = 0;
  const handler = createQaGateway({ db, env, provider: async report => { calls++; return answer(report); } });
  try {
    const measured = await inspect(handler), body = bodyFor(measured);
    for (const headers of [{ Origin: 'https://attacker.example' }, { Origin: '' }, { 'X-Rig-QA-Request': '' }]) assert.equal((await handler(request('/api/qa/recommend', body, headers))).status, 403);
    for (const bad of [{ ...body, approved: false }, { ...body, report: measured.inspection }, { ...body, request_id: 'nope' }, { ...body, fixture: 'private-character' }, { ...body, asset_sha256: 'x'.repeat(3000) }]) assert.equal((await handler(request('/api/qa/recommend', bad))).status, 400);
    assert.equal((await handler(request('/api/qa/recommend', { ...body, asset_sha256: 'a'.repeat(64) }))).status, 409);
    assert.equal((await handler(request('/api/qa/recommend', body, { 'Content-Type': 'text/plain' }))).status, 400);
    assert.equal(calls, 0); assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM qa_budget').get().n, 0);
  } finally { db.close(); }
});
test('live call succeeds once, sanitized persistent receipt only, duplicate never calls provider again', async () => {
  const db = sqliteD1(); let calls = 0;
  const handler = createQaGateway({ db, env, provider: async (report, options) => {
    calls++; assert.equal(options.apiKey, env.NEBIUS_API_KEY); assert.equal(options.timeoutMs, 30000);
    return { ...answer(report), rawResponse: 'do not retain me' };
  } });
  try {
    const measured = await inspect(handler), body = bodyFor(measured);
    const status = await (await handler(request('/api/qa/status', undefined, {}, 'GET'))).json(); assert.equal(status.available_to_user, true);
    const res = await handler(request('/api/qa/recommend', body)); assert.equal(res.status, 200);
    const text = await res.text(); assert.ok(!text.includes('do not retain me')); assert.ok(!text.includes(env.NEBIUS_API_KEY));
    const row = db.sqlite.prepare('SELECT * FROM qa_requests').get();
    assert.equal(row.state, 'completed'); assert.equal(row.prompt_tokens, 100); assert.equal(row.fixture, 'flawed'); assert.equal(row.asset_sha, body.asset_sha256); assert.match(row.advice_sha, /^[a-f0-9]{64}$/);
    const persisted = JSON.stringify(row); assert.ok(!persisted.includes('recommendations')); assert.ok(!persisted.includes(env.NEBIUS_API_KEY)); assert.ok(!persisted.includes('owner-a'));
    assert.equal((await handler(request('/api/qa/recommend', body))).status, 409); assert.equal(calls, 1);
    assert.equal((await handler(request('/api/qa/recommend', { ...body, request_id: body.request_id.toUpperCase() }))).status, 409); assert.equal(calls, 1);
    const recreated = createQaGateway({ db, env, provider: async () => { calls++; } });
    assert.equal((await recreated(request('/api/qa/recommend', body))).status, 409); assert.equal(calls, 1);
  } finally { db.close(); }
});
test('real adapter timeout against hanging mocked fetch consumes one reservation and never retries', async () => {
  const db = sqliteD1(); let calls = 0;
  const handler = createQaGateway({ db, env, provider: (report, options) => requestRecommendations(report, {
    ...options, timeoutMs: 5, fetchImpl: async () => { calls++; return new Promise(() => {}); },
  }) });
  try {
    const measured = await inspect(handler), body = bodyFor(measured);
    assert.equal((await handler(request('/api/qa/recommend', body))).status, 502);
    assert.equal(calls, 1); assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
    assert.equal(db.sqlite.prepare('SELECT state FROM qa_requests').get().state, 'unknown');
    assert.equal((await handler(request('/api/qa/recommend', body))).status, 409); assert.equal(calls, 1);
    const blocked = await handler(request('/api/qa/recommend', { ...body, request_id: randomUUID() }));
    assert.equal(blocked.status, 409); assert.equal((await blocked.json()).error, 'request_in_flight');
    assert.equal(calls, 1); assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
  } finally { db.close(); }
});
test('provider errors/malformed/unsupported advice consume attempts with no secret logs or automatic retries', async () => {
  for (const behavior of [async () => { throw new Error('private key ' + env.NEBIUS_API_KEY); }, async () => ({ advice: {} }), async report => { const result = answer(report); result.advice.recommendations[0].action = 'repair_asset'; return result; }, async report => { const result = answer(report); result.metadata.response_model = 'another-expensive-model'; return result; }]) {
    const db = sqliteD1(); let calls = 0;
    const handler = createQaGateway({ db, env, provider: async (...args) => { calls++; return behavior(...args); } });
    try {
      const measured = await inspect(handler), body = bodyFor(measured);
      const response = await handler(request('/api/qa/recommend', body)); assert.equal(response.status, 502); const text = await response.text(); assert.equal(text, '{"error":"provider_failed"}');
      assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
      assert.equal(db.sqlite.prepare('SELECT state FROM qa_requests').get().state, 'unknown');
      assert.equal((await handler(request('/api/qa/recommend', body))).status, 409); assert.equal(calls, 1);
      const blocked = await handler(request('/api/qa/recommend', { ...body, request_id: randomUUID() }));
      assert.equal(blocked.status, 409); assert.equal((await blocked.json()).error, 'request_in_flight');
      assert.equal(calls, 1); assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
    } finally { db.close(); }
  }
});
test('missing usage remains consumed without invented usage and concurrent request locked', async () => {
  const db = sqliteD1(); let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = createQaGateway({ db, env, provider: async report => { calls++; await gate; const result = answer(report); delete result.metadata.usage; return result; } });
  try {
    const measured = await inspect(handler), body = bodyFor(measured);
    const first = handler(request('/api/qa/recommend', body));
    // Wait for the reservation/provider boundary, without sleep or any network.
    while (calls === 0) await new Promise(resolve => setImmediate(resolve));
    const second = await handler(request('/api/qa/recommend', { ...body, request_id: randomUUID() })); assert.equal(second.status, 409);
    release(); const response = await first; assert.equal(response.status, 200); assert.equal((await response.json()).metadata.usage, undefined);
    assert.equal(calls, 1); assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
  } finally { release(); db.close(); }
});
