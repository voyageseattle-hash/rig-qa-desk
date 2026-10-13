import { DatabaseSync } from 'node:sqlite';

// Real SQLite transactions implement D1's prepared/batch shape. Test-only, no network.
export function sqliteD1(filename = ':memory:', initialize = true) {
  const sqlite = new DatabaseSync(filename);
  if (initialize) sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qa_budget (id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL, grant_id TEXT NOT NULL, attempts INTEGER NOT NULL, reserved_micro_usd INTEGER NOT NULL, in_flight_request_id TEXT);
    CREATE TABLE IF NOT EXISTS qa_requests (request_id TEXT PRIMARY KEY, user_hash TEXT NOT NULL, grant_id TEXT NOT NULL, report_sha TEXT NOT NULL, state TEXT NOT NULL, reserve_micro_usd INTEGER NOT NULL, applied INTEGER NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER, asset_sha TEXT, fixture TEXT, mode TEXT, advice_sha TEXT);
  `);
  return {
    sqlite,
    close() { sqlite.close(); },
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        runSync() { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement.runSync()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
export const grantEnv = Object.freeze({
  JUDGE_BUDGET_GRANT_ID: 'approved_test_grant', JUDGE_MAX_ATTEMPTS: '3', JUDGE_MAX_ATTEMPTS_PER_USER: '2',
  JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD: '20000', JUDGE_TOTAL_MICRO_USD: '60000',
});
