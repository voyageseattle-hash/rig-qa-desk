import { createHash } from 'node:crypto';
import { buildWorkflowFixture } from '../shared/fixtures/workflow.mjs';
import { inspectGlb } from '../shared/src/inspect.mjs';
import { workflowVisual } from '../shared/src/workflow-visual.mjs';
import { requestRecommendations, validateInspection, validateAdvice, createMockAdvice, NEBIUS_MODEL } from './provider.mjs';
import { createLedger, readGrant, LedgerError, JUDGING_ENDS_AT } from './ledger.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const error = (code, status) => json({ error: code }, status);
const fresh = fixture => {
  const inspection = validateInspection(inspectGlb(buildWorkflowFixture({ flawed: fixture === 'flawed' })));
  return { inspection, report_sha256: hash(inspection) };
};
export function resolveJudgeUser(request, env, localMock = false) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId || userId.length > 160 || /[\s,\x00-\x1f]/.test(userId)) return null;
  if (localMock && userId === 'local_seedy') return userId;
  if (userId === 'local_seedy') return null;
  const accessMode = env.JUDGE_ACCESS_MODE ?? 'allowlist';
  if (!['allowlist', 'signed_in'].includes(accessMode)) return null;
  if (accessMode === 'signed_in') {
    // Only Sites dispatch may supply these identity headers. Never expose this
    // handler directly, or trust identity supplied in a request body/query.
    const email = request.headers.get('oai-authenticated-user-email');
    if (!email || email.length > 254 || !/^[^\s,@<>\x00-\x1f]+@[^\s,@<>\x00-\x1f]+$/.test(email)) return null;
    return userId;
  }
  const ids = typeof env.JUDGE_ALLOWED_USER_IDS === 'string' ? env.JUDGE_ALLOWED_USER_IDS.split(',').map(value => value.trim()).filter(Boolean) : [];
  const fingerprints = typeof env.JUDGE_ALLOWED_USER_HASHES === 'string' ? env.JUDGE_ALLOWED_USER_HASHES.split(',').map(value => value.trim()).filter(value => /^[a-f0-9]{64}$/.test(value)) : [];
  const fingerprint = createHash('sha256').update(userId).digest('hex');
  return ids.includes(userId) || fingerprints.includes(fingerprint) ? userId : null;
}
// Return only the current authenticated caller's opaque fingerprint for owner
// setup. This is a discovery value, never an authorization credential. Requests
// must still pass Sites dispatch and the server-configured access mode.
function accessFingerprint(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id || id === 'local_seedy' || id.length > 160 || /[\s,\x00-\x1f]/.test(id)) return null;
  return createHash('sha256').update(id).digest('hex');
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new Error('body_invalid');
  if (Number(request.headers.get('Content-Length')) > 2048) throw new Error('body_invalid');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body_invalid');
  let bytes = 0; const chunks = [];
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2048) { await reader.cancel(); throw new Error('body_invalid'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  if (!object(body)) throw new Error('body_invalid');
  return body;
}
const exact = (body, keys) => Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));

/** Must run behind Sites' authenticated dispatch; never expose this header boundary directly. */
export function createQaGateway({ env = {}, db, provider = requestRecommendations, localMock = false, now = Date.now } = {}) {
  if (typeof localMock !== 'boolean') throw new TypeError('localMock must be explicit boolean');
  const grant = readGrant(env);
  const keyReady = typeof env.NEBIUS_API_KEY === 'string' && env.NEBIUS_API_KEY.trim().length > 0 && env.NEBIUS_API_KEY.length <= 4096 && !/[\r\n]/.test(env.NEBIUS_API_KEY);
  const live = !localMock && env.NEBIUS_LIVE_ALLOWED === '1' && keyReady && grant !== null && Boolean(db?.prepare && db?.batch);
  const mode = localMock ? 'mock' : live ? 'live' : 'offline';
  const ledger = grant && db?.prepare && db?.batch ? createLedger(db,grant,{now}) : null;
  const windowOpen = () => { const instant=now();return Number.isFinite(instant)&&instant<Date.parse(JUDGING_ENDS_AT); };
  const reviewPath = '/api/qa/owner/review-allowance';
  return async function handle(request) {
    const url = new URL(request.url);
    const userId = resolveJudgeUser(request, env, localMock);
    if(url.pathname==='/api/qa/status'&&request.method==='GET'){
      let budget=null;try{if(ledger&&userId)budget=await ledger.status(userId);}catch(failure){return error(failure instanceof LedgerError?failure.code:'ledger_unavailable',503);}
      return json({mode:localMock?'mock':live&&windowOpen()?'live':'offline',model:NEBIUS_MODEL,access_mode:env.JUDGE_ACCESS_MODE??'allowlist',
        live_enabled:live&&windowOpen(),available_to_user:Boolean(userId)&&windowOpen()&&(localMock||(live&&Boolean(budget?.can_reserve))),
        access_fingerprint:accessFingerprint(request),ends_at:JUDGING_ENDS_AT,budget,
        limits:{max_attempts:grant?.maxAttempts??0,max_attempts_per_user:grant?.perUser??0,reserve_per_attempt_micro_usd:grant?.reserveMicroUsd??0,total_micro_usd:grant?.totalMicroUsd??0}});
    }
    if (!['/api/qa/inspect', '/api/qa/recommend',reviewPath].includes(url.pathname)) return error('not_found', 404);
    if (request.method !== 'POST') return error('method_not_allowed', 405);
    // All POSTs are same-origin, even the free procedural inspection route.
    if (request.headers.get('Origin') !== url.origin || request.headers.get('X-Rig-QA-Request') !== '1') return error('request_origin_denied', 403);
    if(url.pathname===reviewPath){
      const ownerHash=env.JUDGE_ALLOWANCE_OWNER_HASH;
      if(localMock||!userId||!hex(ownerHash)||createHash('sha256').update(userId).digest('hex')!==ownerHash)return error('owner_required',403);
      if(env.NEBIUS_LIVE_ALLOWED!=='0'||env.JUDGE_ALLOWANCE_UPDATE_APPROVED!=='1'||!ledger)return error('allowance_review_disabled',409);
      try{const body=await readBody(request);if(!exact(body,['approved'])||body.approved!==true)return error('body_invalid',400);
        let expected;try{expected=JSON.parse(env.JUDGE_ALLOWANCE_EXPECTED_STATE);}catch{return error('allowance_review_invalid',409);}
        return json(await ledger.reviewAllowance(expected));
      }catch(failure){return error(failure instanceof LedgerError?failure.code:'ledger_unavailable',failure instanceof LedgerError?409:503);}
    }
    if (url.pathname === '/api/qa/recommend' && !userId) return error('user_not_allowed', 403);
    if(url.pathname==='/api/qa/recommend'&&!windowOpen())return error('judging_window_closed',409);
    let body;
    try { body = await readBody(request); } catch { return error('body_invalid', 400); }
    if (!['flawed', 'valid'].includes(body.fixture)) return error('fixture_invalid', 400);
    if (url.pathname === '/api/qa/inspect') {
      if (!exact(body, ['fixture'])) return error('body_invalid', 400);
      return json({ ...fresh(body.fixture), mode: 'measured', fixture: body.fixture, visual: workflowVisual({ flawed: body.fixture === 'flawed' }) });
    }
    if (!exact(body, ['fixture', 'asset_sha256', 'report_sha256', 'request_id', 'approved']) || !hex(body.asset_sha256) || !hex(body.report_sha256) || !uuid(body.request_id) || body.approved !== true) return error('body_invalid', 400);
    body.request_id = body.request_id.toLowerCase(); // UUID spelling cannot bypass idempotency.
    const measured = fresh(body.fixture);
    if (body.asset_sha256 !== measured.inspection.asset_sha256 || body.report_sha256 !== measured.report_sha256) return error('inspection_mismatch', 409);
    if (!live && !localMock) return error('live_disabled', 503);
    if (localMock) return json({ ...measured, advice: createMockAdvice(measured.inspection), metadata: { provider: 'offline', model: NEBIUS_MODEL, mode: 'mock', new_provider_requests: 0 }, request_id: body.request_id });
    try { await ledger.reserve({ requestId: body.request_id, userId, reportSha: measured.report_sha256 }); }
    catch (failure) { return error(failure instanceof LedgerError ? failure.code : 'ledger_unavailable', failure instanceof LedgerError && failure.code !== 'ledger_unavailable' ? 409 : 503); }
    if(!windowOpen()){
      try{await ledger.finish(body.request_id,{outcome:'failed'});}catch{return error('ledger_unavailable',503);}
      return error('judging_window_closed',409);
    }
    let result;
    try {
      result = await provider(measured.inspection, { apiKey: env.NEBIUS_API_KEY, timeoutMs: 30000 });
      validateAdvice(measured.inspection, result?.advice);
      if (result?.metadata?.mode !== 'live' || result?.metadata?.provider !== 'nebius' || result?.metadata?.model !== NEBIUS_MODEL || result?.metadata?.response_model !== NEBIUS_MODEL) throw new Error('provider_identity');
      if (JSON.stringify(result.advice).includes(env.NEBIUS_API_KEY.trim())) throw new Error('credential_echo');
    } catch {
      // Transport timeout/error can leave upstream compute running. Conservatively
      // retain the lock for every provider failure until owner reconciliation.
      try { await ledger.finish(body.request_id, { outcome: 'unknown' }); } catch { return error('ledger_unavailable', 503); }
      return error('provider_failed', 502);
    }
    const usage = result.metadata.usage;
    const safeUsage = object(usage) && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0 && usage[key] <= 10000000) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens
      ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens } : undefined;
    try { await ledger.finish(body.request_id, { outcome: 'completed', usage: safeUsage, assetSha: measured.inspection.asset_sha256, fixture: body.fixture, adviceSha: hash(result.advice) }); } catch { return error('ledger_unavailable', 503); }
    return json({ ...measured, advice: result.advice, metadata: { provider: 'nebius', model: NEBIUS_MODEL, response_model: NEBIUS_MODEL, mode: 'live', ...(safeUsage ? { usage: safeUsage } : {}), new_provider_requests: 1 }, request_id: body.request_id });
  };
}
