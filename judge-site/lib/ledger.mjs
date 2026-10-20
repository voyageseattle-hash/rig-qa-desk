import { createHash } from 'node:crypto';

export class LedgerError extends Error {
  constructor(code) { super(code); this.name = 'LedgerError'; this.code = code; }
}
// December 15, 2026, 12:00 noon America/Los_Angeles (PST, UTC-08:00).
export const JUDGING_ENDS_AT = '2026-12-15T20:00:00Z';
const positive = value => typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value) && Number.isSafeInteger(Number(value));
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function readGrant(env) {
  const keys = ['JUDGE_MAX_ATTEMPTS', 'JUDGE_MAX_ATTEMPTS_PER_USER', 'JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD', 'JUDGE_TOTAL_MICRO_USD'];
  if (typeof env.JUDGE_BUDGET_GRANT_ID !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(env.JUDGE_BUDGET_GRANT_ID) || keys.some(key => !positive(env[key]))) return null;
  const [maxAttempts, perUser, reserveMicroUsd, totalMicroUsd] = keys.map(key => Number(env[key]));
  if (reserveMicroUsd < 20000 || perUser > maxAttempts || maxAttempts * reserveMicroUsd > totalMicroUsd) return null;
  // Retain v4's exact fingerprint: deploying the fixed cutoff with the existing
  // numbers neither replaces nor resets its initialized grant.
  const config = { grantId: env.JUDGE_BUDGET_GRANT_ID, maxAttempts, perUser, reserveMicroUsd, totalMicroUsd };
  return Object.freeze({ ...config, fingerprint: createHash('sha256').update(JSON.stringify(config)).digest('hex') });
}

// Correlated against qa_budget in both INSERT ... SELECT and UPDATE. This also
// protects against an inconsistent restore racing the initial read.
const conserved = `attempts=(SELECT COUNT(*) FROM qa_requests)
  AND reserved_micro_usd=(SELECT COALESCE(SUM(reserve_micro_usd),0) FROM qa_requests)
  AND NOT EXISTS(SELECT 1 FROM qa_requests WHERE applied IS NULL OR applied<>1 OR reserve_micro_usd IS NULL OR reserve_micro_usd<=0
    OR reserve_micro_usd<>CAST(reserve_micro_usd AS INTEGER) OR grant_id IS NULL OR grant_id<>qa_budget.grant_id
    OR state IS NULL OR state NOT IN ('reserved','unknown','completed','failed'))
  AND ((in_flight_request_id IS NULL AND NOT EXISTS(SELECT 1 FROM qa_requests WHERE state IN ('reserved','unknown')))
    OR (in_flight_request_id IS NOT NULL AND (SELECT COUNT(*) FROM qa_requests WHERE state IN ('reserved','unknown'))=1
      AND EXISTS(SELECT 1 FROM qa_requests WHERE request_id=in_flight_request_id AND state IN ('reserved','unknown'))))`;

/** Existing D1/schema only. No import, schema migration, reset or lock expiry. */
export function createLedger(db, grant, { now = Date.now } = {}) {
  if (!db?.prepare || !db?.batch || !grant || typeof now !== 'function') throw new LedgerError('ledger_unavailable');
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  const windowOpen = () => { const instant=now(); return Number.isFinite(instant) && instant < Date.parse(JUDGING_ENDS_AT); };
  async function accounting() {
    const row=await db.prepare(`SELECT b.*,r.n,r.total,r.pending,r.pending_id,r.invalid
      FROM (SELECT COUNT(*) AS n,COALESCE(SUM(reserve_micro_usd),0) AS total,
        COALESCE(SUM(CASE WHEN state IN ('reserved','unknown') THEN 1 ELSE 0 END),0) AS pending,
        MIN(CASE WHEN state IN ('reserved','unknown') THEN request_id ELSE NULL END) AS pending_id,
        COALESCE(SUM(CASE WHEN applied IS NULL OR applied<>1 OR reserve_micro_usd IS NULL OR reserve_micro_usd<=0
          OR reserve_micro_usd<>CAST(reserve_micro_usd AS INTEGER) OR grant_id IS NULL OR grant_id<>?
          OR state IS NULL OR state NOT IN ('reserved','unknown','completed','failed') THEN 1 ELSE 0 END),0) AS invalid
        FROM qa_requests) r LEFT JOIN qa_budget b ON b.id=1`).bind(grant.grantId).first();
    if(row?.id===null){if(row.n!==0)throw new LedgerError('accounting_mismatch');return null;}
    if(row&&row.grant_id!==grant.grantId)throw new LedgerError('grant_mismatch');
    if(!row || !nonnegative(row.attempts) || !nonnegative(row.reserved_micro_usd)
      || row.invalid!==0 || row.attempts!==row.n || row.reserved_micro_usd!==row.total || row.pending>1
      || row.in_flight_request_id!==(row.pending===1?row.pending_id:null))throw new LedgerError('accounting_mismatch');
    return row;
  }
  async function current(){const row=await accounting();if(row&&row.fingerprint!==grant.fingerprint)throw new LedgerError('grant_mismatch');return row;}
  async function reserve({ requestId, userId, reportSha }) {
    if(!windowOpen())throw new LedgerError('judging_window_closed');
    await current();
    if(!windowOpen())throw new LedgerError('judging_window_closed');
    const userHash = createHash('sha256').update(userId).digest('hex');
    const results = await db.batch([
      stmt('INSERT OR IGNORE INTO qa_budget (id,fingerprint,grant_id,attempts,reserved_micro_usd) VALUES (1,?,?,0,0)',grant.fingerprint,grant.grantId),
      stmt(`INSERT OR IGNORE INTO qa_requests (request_id,user_hash,grant_id,report_sha,state,reserve_micro_usd,applied)
        SELECT ?,?,?,?,'reserved',?,0 FROM qa_budget
        WHERE id=1 AND fingerprint=? AND attempts<? AND reserved_micro_usd+?<=? AND in_flight_request_id IS NULL
          AND (SELECT COUNT(*) FROM qa_requests WHERE user_hash=?)<? AND ${conserved}`,
      requestId,userHash,grant.grantId,reportSha,grant.reserveMicroUsd,grant.fingerprint,grant.maxAttempts,grant.reserveMicroUsd,grant.totalMicroUsd,userHash,grant.perUser),
      stmt(`UPDATE qa_budget SET attempts=attempts+1,reserved_micro_usd=reserved_micro_usd+?,in_flight_request_id=?
        WHERE id=1 AND changes()=1 AND EXISTS(SELECT 1 FROM qa_requests WHERE request_id=? AND applied=0 AND state='reserved')`,grant.reserveMicroUsd,requestId,requestId),
      stmt("UPDATE qa_requests SET applied=1 WHERE request_id=? AND changes()=1 AND applied=0 AND state='reserved'",requestId),
    ]);
    if(results.some(result=>result.success===false))throw new LedgerError('ledger_unavailable');
    if(Number(results[1]?.meta?.changes)===1)return;
    await current();
    if(await stmt('SELECT request_id FROM qa_requests WHERE request_id=?',requestId).first())throw new LedgerError('request_already_consumed');
    const budget=await current();
    if(budget?.in_flight_request_id)throw new LedgerError('request_in_flight');
    throw new LedgerError('allowance_exhausted');
  }
  async function finish(requestId,{outcome,usage,assetSha,fixture,adviceSha}={}) {
    await current(); // Completion remains recordable after the cutoff.
    if(!['completed','failed','unknown'].includes(outcome))throw new LedgerError('invalid_outcome');
    if(outcome==='completed'&&(!hex(assetSha)||!hex(adviceSha)||!['valid','flawed'].includes(fixture)))throw new LedgerError('invalid_receipt');
    const tokens=key=>Number.isSafeInteger(usage?.[key])&&usage[key]>=0&&usage[key]<=10000000?usage[key]:null;
    const results=await db.batch([
      stmt(`UPDATE qa_requests SET state=?,prompt_tokens=?,completion_tokens=?,asset_sha=?,fixture=?,advice_sha=?,mode='live'
        WHERE request_id=? AND state='reserved' AND applied=1 AND EXISTS(SELECT 1 FROM qa_budget WHERE id=1 AND fingerprint=? AND ${conserved})`,
      outcome,tokens('prompt_tokens'),tokens('completion_tokens'),assetSha||null,fixture||null,adviceSha||null,requestId,grant.fingerprint),
      stmt("UPDATE qa_budget SET in_flight_request_id=NULL WHERE id=1 AND changes()=1 AND in_flight_request_id=? AND EXISTS(SELECT 1 FROM qa_requests WHERE request_id=? AND state IN ('completed','failed'))",requestId,requestId),
    ]);
    if(results.some(result=>result.success===false))throw new LedgerError('ledger_unavailable');
    await current();
  }
  async function status(userId){
    const b=await current(),userHash=createHash('sha256').update(userId).digest('hex');
    const user=await stmt('SELECT COUNT(*) AS n FROM qa_requests WHERE user_hash=?',userHash).first();
    const remaining=Math.max(0,Math.min(grant.maxAttempts-(b?.attempts??0),Math.floor((grant.totalMicroUsd-(b?.reserved_micro_usd??0))/grant.reserveMicroUsd),grant.perUser-user.n));
    return {attempts:b?.attempts??0,reserved_micro_usd:b?.reserved_micro_usd??0,locked:Boolean(b?.in_flight_request_id),remaining_attempts:remaining,can_reserve:windowOpen()&&!b?.in_flight_request_id&&remaining>0,ends_at:JUDGING_ENDS_AT,reservation_is_provider_billing_cap:false};
  }
  async function reviewAllowance(expected){
    if(!windowOpen())throw new LedgerError('judging_window_closed');
    if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).sort().join(',')!=='attempts,fingerprint,in_flight_request_id,reserved_micro_usd'
      || !hex(expected.fingerprint)||!nonnegative(expected.attempts)||!nonnegative(expected.reserved_micro_usd)
      || !(expected.in_flight_request_id===null||(typeof expected.in_flight_request_id==='string'&&expected.in_flight_request_id.length>0&&expected.in_flight_request_id.length<=160)))throw new LedgerError('allowance_review_invalid');
    const b=await accounting();
    if(!windowOpen())throw new LedgerError('judging_window_closed');
    if(!b)throw new LedgerError('allowance_review_mismatch'); // Never initialize a replacement budget.
    if(b.fingerprint===grant.fingerprint)return {updated:false,already_applied:true,new_provider_requests:0};
    if(!Object.keys(expected).every(key=>b[key]===expected[key])||b.attempts>grant.maxAttempts||b.reserved_micro_usd>grant.totalMicroUsd)throw new LedgerError('allowance_review_mismatch');
    const result=await db.batch([stmt(`UPDATE qa_budget SET fingerprint=? WHERE id=1 AND fingerprint=? AND grant_id=?
      AND attempts=? AND reserved_micro_usd=? AND in_flight_request_id IS ? AND ${conserved}`,
      grant.fingerprint,expected.fingerprint,grant.grantId,expected.attempts,expected.reserved_micro_usd,expected.in_flight_request_id)]);
    if(result.some(row=>row.success===false))throw new LedgerError('ledger_unavailable');
    await current(); // Includes rejection of a partial restore racing the review.
    return {updated:Number(result[0]?.meta?.changes)===1,already_applied:Number(result[0]?.meta?.changes)!==1,new_provider_requests:0};
  }
  async function lookup(requestId){return await stmt('SELECT request_id,user_hash,grant_id,report_sha,asset_sha,fixture,advice_sha,mode,state,prompt_tokens,completion_tokens FROM qa_requests WHERE request_id=?',requestId).first();}
  return Object.freeze({reserve,finish,lookup,status,reviewAllowance});
}
