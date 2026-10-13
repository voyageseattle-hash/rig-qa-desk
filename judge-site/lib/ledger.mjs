import { createHash } from 'node:crypto';

export class LedgerError extends Error {
  constructor(code) { super(code); this.name = 'LedgerError'; this.code = code; }
}
const positive = value => typeof value === 'string' && /^[1-9]\d{0,8}$/.test(value) && Number.isSafeInteger(Number(value));
export function readGrant(env) {
  const keys = ['JUDGE_MAX_ATTEMPTS', 'JUDGE_MAX_ATTEMPTS_PER_USER', 'JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD', 'JUDGE_TOTAL_MICRO_USD'];
  if (typeof env.JUDGE_BUDGET_GRANT_ID !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(env.JUDGE_BUDGET_GRANT_ID) || keys.some(key => !positive(env[key]))) return null;
  const [maxAttempts, perUser, reserveMicroUsd, totalMicroUsd] = keys.map(key => Number(env[key]));
  // A conservative reservation for this small pinned-model workflow. It is an
  // allowance, not a provider-enforced billing cap; verify pricing before live.
  if (reserveMicroUsd < 20000 || perUser > maxAttempts || maxAttempts * reserveMicroUsd > totalMicroUsd) return null;
  const config = { grantId: env.JUDGE_BUDGET_GRANT_ID, maxAttempts, perUser, reserveMicroUsd, totalMicroUsd };
  return Object.freeze({ ...config, fingerprint: createHash('sha256').update(JSON.stringify(config)).digest('hex') });
}

/** D1 batch is a single transaction. No schema creation, reset, or expired-lock release. */
export function createLedger(db, grant) {
  if (!db?.prepare || !db?.batch || !grant) throw new LedgerError('ledger_unavailable');
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  async function reserve({ requestId, userId, reportSha }) {
    const userHash = createHash('sha256').update(userId).digest('hex');
    const results = await db.batch([
      stmt('INSERT OR IGNORE INTO qa_budget (id, fingerprint, grant_id, attempts, reserved_micro_usd) VALUES (1, ?, ?, 0, 0)', grant.fingerprint, grant.grantId),
      stmt(`INSERT OR IGNORE INTO qa_requests (request_id, user_hash, grant_id, report_sha, state, reserve_micro_usd, applied)
        SELECT ?, ?, ?, ?, 'reserved', ?, 0 FROM qa_budget
        WHERE id = 1 AND fingerprint = ? AND attempts < ? AND reserved_micro_usd + ? <= ? AND in_flight_request_id IS NULL
          AND (SELECT count(*) FROM qa_requests WHERE user_hash = ?) < ?`,
      requestId, userHash, grant.grantId, reportSha, grant.reserveMicroUsd, grant.fingerprint,
      grant.maxAttempts, grant.reserveMicroUsd, grant.totalMicroUsd, userHash, grant.perUser),
      stmt(`UPDATE qa_budget SET attempts = attempts + 1, reserved_micro_usd = reserved_micro_usd + ?, in_flight_request_id = ?
        WHERE id = 1 AND EXISTS (SELECT 1 FROM qa_requests WHERE request_id = ? AND applied = 0 AND state = 'reserved')`, grant.reserveMicroUsd, requestId, requestId),
      stmt("UPDATE qa_requests SET applied = 1 WHERE request_id = ? AND applied = 0 AND state = 'reserved'", requestId),
    ]);
    if (results.some(result => result.success === false)) throw new LedgerError('ledger_unavailable');
    if (Number(results[1]?.meta?.changes) === 1) return;
    const existing = await stmt('SELECT request_id FROM qa_requests WHERE request_id = ?', requestId).first();
    if (existing) throw new LedgerError('request_already_consumed');
    const budget = await stmt('SELECT fingerprint, in_flight_request_id FROM qa_budget WHERE id = 1').first();
    if (budget?.fingerprint !== grant.fingerprint) throw new LedgerError('grant_mismatch');
    if (budget?.in_flight_request_id) throw new LedgerError('request_in_flight');
    throw new LedgerError('allowance_exhausted');
  }
  async function finish(requestId, { outcome, usage, assetSha, fixture, adviceSha } = {}) {
    if (!['completed', 'failed', 'unknown'].includes(outcome)) throw new LedgerError('invalid_outcome');
    if (outcome === 'completed' && (!/^[a-f0-9]{64}$/.test(assetSha || '') || !/^[a-f0-9]{64}$/.test(adviceSha || '') || !['valid', 'flawed'].includes(fixture))) throw new LedgerError('invalid_receipt');
    const tokens = key => Number.isSafeInteger(usage?.[key]) && usage[key] >= 0 && usage[key] <= 10000000 ? usage[key] : null;
    const results = await db.batch([
      stmt("UPDATE qa_requests SET state = ?, prompt_tokens = ?, completion_tokens = ?, asset_sha = ?, fixture = ?, advice_sha = ?, mode = 'live' WHERE request_id = ? AND state = 'reserved' AND applied = 1", outcome, tokens('prompt_tokens'), tokens('completion_tokens'), assetSha || null, fixture || null, adviceSha || null, requestId),
      // A cancelled local request does not prove the upstream generation stopped.
      // Unknown outcomes deliberately retain this lock with no automatic expiry.
      stmt("UPDATE qa_budget SET in_flight_request_id = NULL WHERE id = 1 AND in_flight_request_id = ? AND EXISTS (SELECT 1 FROM qa_requests WHERE request_id = ? AND state IN ('completed', 'failed'))", requestId, requestId),
    ]);
    if (results.some(result => result.success === false)) throw new LedgerError('ledger_unavailable');
  }
  async function lookup(requestId) {
    return await stmt('SELECT request_id, user_hash, grant_id, report_sha, asset_sha, fixture, advice_sha, mode, state, prompt_tokens, completion_tokens FROM qa_requests WHERE request_id = ?', requestId).first();
  }
  return Object.freeze({ reserve, finish, lookup });
}
