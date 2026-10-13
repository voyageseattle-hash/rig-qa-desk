import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLedger, readGrant } from '../lib/ledger.mjs';
import { sqliteD1, grantEnv } from './d1-fake.mjs';

const grant = readGrant(grantEnv);
const sha = 'a'.repeat(64);
const reserve = (ledger, requestId, userId = 'owner-a') => ledger.reserve({ requestId, userId, reportSha: sha });
const finish = (ledger, requestId, outcome = 'failed') => ledger.finish(requestId, { outcome, ...(outcome === 'completed' ? { assetSha: sha, adviceSha: 'b'.repeat(64), fixture: 'flawed' } : {}) });

test('missing/zero/unsafe/inconsistent grant config disables live rather than defaulting budget', () => {
  for (const env of [{}, { ...grantEnv, JUDGE_MAX_ATTEMPTS: '0' }, { ...grantEnv, JUDGE_TOTAL_MICRO_USD: '59999' }, { ...grantEnv, JUDGE_MAX_ATTEMPTS_PER_USER: '4' }, { ...grantEnv, JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD: '1e4' }, { ...grantEnv, JUDGE_BUDGET_GRANT_ID: 'short' }]) assert.equal(readGrant(env), null);
  assert.equal(readGrant({...grantEnv,JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD:'1'}),null);
  assert.equal(readGrant({...grantEnv,JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD:'19999'}),null);
  assert.ok(grant.fingerprint);
});
test('atomic concurrent reservation permits one in-flight only, duplicate consumed forever', async () => {
  const db = sqliteD1(), ledger = createLedger(db, grant);
  try {
    const outcomes = await Promise.allSettled([reserve(ledger, 'r1'), reserve(ledger, 'r2', 'owner-b')]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes[1].reason.code, 'request_in_flight');
    assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
    await assert.rejects(reserve(ledger, 'r1'), { code: 'request_already_consumed' });
    await finish(ledger, 'r1');
    await assert.rejects(reserve(ledger, 'r1', 'owner-b'), { code: 'request_already_consumed' });
    await reserve(ledger, 'r2', 'owner-b');
    await finish(ledger, 'r2', 'completed');
    assert.equal((await ledger.lookup('r2')).advice_sha, 'b'.repeat(64));
    assert.equal((await ledger.lookup('r2')).user_hash, createHash('sha256').update('owner-b').digest('hex'));
  } finally { db.close(); }
});
test('failure and missing usage permanently consume allowance; per-user and global limits enforced', async () => {
  const db = sqliteD1(), ledger = createLedger(db, grant);
  try {
    await reserve(ledger, 'r1'); await finish(ledger, 'r1');
    await reserve(ledger, 'r2'); await finish(ledger, 'r2', 'completed');
    await assert.rejects(reserve(ledger, 'r3'), { code: 'allowance_exhausted' });
    await reserve(ledger, 'r3', 'owner-b'); await finish(ledger, 'r3');
    await assert.rejects(reserve(ledger, 'r4', 'owner-c'), { code: 'allowance_exhausted' });
    const budget = db.sqlite.prepare('SELECT * FROM qa_budget').get();
    assert.equal(budget.attempts, 3); assert.equal(budget.reserved_micro_usd, 60000);
    assert.equal((await ledger.lookup('r2')).prompt_tokens, null);
  } finally { db.close(); }
});
test('configuration change cannot reset persistent grant', async () => {
  const db = sqliteD1();
  try {
    const first = createLedger(db, grant); await reserve(first, 'r1'); await finish(first, 'r1');
    const changed = createLedger(db, readGrant({ ...grantEnv, JUDGE_BUDGET_GRANT_ID: 'different_grant' }));
    await assert.rejects(reserve(changed, 'r2'), { code: 'grant_mismatch' });
    assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
  } finally { db.close(); }
});
test('process restart retains reserved in-flight lock and consumed IDs, requiring owner reconciliation', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'rig-qa-ledger-')), filename = join(folder, 'ledger.sqlite');
  let db = sqliteD1(filename);
  try {
    await reserve(createLedger(db, grant), 'r1'); db.close(); db = sqliteD1(filename, false);
    const restarted = createLedger(db, grant);
    await assert.rejects(reserve(restarted, 'r2'), { code: 'request_in_flight' });
    await assert.rejects(reserve(restarted, 'r1'), { code: 'request_already_consumed' });
    assert.equal(db.sqlite.prepare('SELECT attempts FROM qa_budget').get().attempts, 1);
  } finally { db.close(); rmSync(filename); rmdirSync(folder); }
});
test('explicit unknown outcome keeps persistent lock after restart with consumed budget', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'rig-qa-unknown-')), filename = join(folder, 'ledger.sqlite');
  let db = sqliteD1(filename);
  try {
    const ledger = createLedger(db, grant);
    await reserve(ledger, 'r1'); await ledger.finish('r1', { outcome: 'unknown' });
    assert.equal((await ledger.lookup('r1')).state, 'unknown');
    assert.equal(db.sqlite.prepare('SELECT in_flight_request_id FROM qa_budget').get().in_flight_request_id, 'r1');
    db.close(); db = sqliteD1(filename, false);
    const restarted = createLedger(db, grant);
    await assert.rejects(reserve(restarted, 'r2'), { code: 'request_in_flight' });
    // No finish retry can silently convert a previously unknown request to terminal.
    await restarted.finish('r1', { outcome: 'failed' });
    assert.equal((await restarted.lookup('r1')).state, 'unknown');
    await assert.rejects(reserve(restarted, 'r2'), { code: 'request_in_flight' });
    const budget = db.sqlite.prepare('SELECT * FROM qa_budget').get();
    assert.equal(budget.attempts, 1); assert.equal(budget.reserved_micro_usd, 20000);
  } finally { db.close(); rmSync(filename); rmdirSync(folder); }
});
test('transaction rollback prevents partially reserved budget', async () => {
  const db = sqliteD1();
  try {
    db.sqlite.exec('DROP TABLE qa_requests');
    await assert.rejects(reserve(createLedger(db, grant), 'r1'));
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM qa_budget').get().n, 0);
  } finally { db.close(); }
});
