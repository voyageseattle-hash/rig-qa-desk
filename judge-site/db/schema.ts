import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One durable grant. A deployment/configuration change cannot reset allowance.
export const qaBudget = sqliteTable('qa_budget', {
  id: integer('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  grantId: text('grant_id').notNull(),
  attempts: integer('attempts').notNull(),
  reservedMicroUsd: integer('reserved_micro_usd').notNull(),
  inFlightRequestId: text('in_flight_request_id'),
});
export const qaRequests = sqliteTable('qa_requests', {
  requestId: text('request_id').primaryKey(),
  userHash: text('user_hash').notNull(),
  grantId: text('grant_id').notNull(),
  reportSha: text('report_sha').notNull(),
  assetSha: text('asset_sha'),
  fixture: text('fixture'),
  mode: text('mode'),
  adviceSha: text('advice_sha'),
  state: text('state').notNull(),
  reserveMicroUsd: integer('reserve_micro_usd').notNull(),
  applied: integer('applied').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
});
