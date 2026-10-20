# Rig QA Desk — hosted service source

## Current state and this candidate

The [existing Site](https://rig-qa-desk.gsprodev.chatgpt.site) is publicly viewable. Hosted **v7**, source commit `ba456c2a45ae3ed915fb52166239c51d2d9b10f4`, succeeded October 19, 2026 at 05:00:33 UTC with environment revision 7. Paid AI is enabled only behind the safeguards below. The earlier owner-only, two-attempt test arrangement is historical.

This directory in the **new unpublished local candidate** contains all 160 tracked v7 source/test files plus documentation corrections. The 78-file native deployment artifact is compiled output, not a 78-file source tree. No redeployment, runtime setting change, migration or database reset is requested by this preparation.

## Coverage

The local character panel accepts self-contained GLBs in a terminable browser worker. Profiles supply explicit rest symmetry, signed hinge limits, sampled linear-blend stretch/collapse, floor/foot checks, within-clip motion, clip seams, paired grip/release anchors and support windows. Missing rules, unselected clips, unsupported data, sampling and work limits remain visible. Raw character bytes and profiles are not sent to the server or NVIDIA.

The separate guided service creates fixed owned 24-bone procedural fixtures, measures supported structural errors, requests NVIDIA investigation advice only after an explicit click, records human decisions, exports receipt-bound evidence, and reinspects a prepared counterpart. It does not accept arbitrary uploaded characters on its server AI route. The companion's official Khronos conformance check does not run here. No output certifies anatomy, visual mesh quality, contact forces, physics or engine behavior, and no automatic repair is executed.

The same local character implementation has a CLI:

```sh
node scripts/inspect-character.mjs --asset owned.glb --inventory yes
node scripts/inspect-character.mjs --asset owned.glb --profile allowances.json --other counterpart.glb --output new-report.json
```

Input assets and existing output paths are never overwritten. The character worker has a 15-second deadline and a 192 MiB old-generation budget. See [profile guide](public/quality/profile-guide.html).

## Reproduce without inference spending

Use Node.js 22.13+ (Node 24 was used for v7 verification).

```sh
npm ci --prefer-offline --no-audit --no-fund
node scripts/sync-shared.mjs --verify
node scripts/generate-validators.mjs
npm test
npm run build
```

The committed eight-file `shared/` snapshot verifies independently of the parent repository. In the full candidate it remains byte-identical to the allowlisted companion sources. Generated validators contain no runtime Ajv compilation or `eval`.

The existing schema is in `db/schema.ts`; the original migration and journal in `drizzle/` are unchanged. For an empty **local** database only, apply the committed migration:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_calm_thing.sql
```

This is not a production migration instruction. Do not replay it against the existing hosted database.

For a labeled mock rehearsal, copy `.dev.vars.example` to ignored `.dev.vars` and run:

```sh
npm run dev -- --hostname 127.0.0.1 --port 4325
```

Development sign-in uses the starter's simulated local identity and advice is labeled MOCK. Production folds `import.meta.env.DEV` to false and rejects `local_seedy`. Browser tests use simulated identities and mocked transport; they do not demonstrate real non-owner judge acceptance. The production local preview uses `npm start -- --port 4326`; never expose its direct Worker as a trusted identity boundary.

## Signed-in authorization and durable reservations

Supported Sites dispatch must supply authenticated ID and email. `JUDGE_ACCESS_MODE` defaults to `allowlist`; approved production uses `signed_in`. That mode accepts real signed-in visitors rather than verifying contest-judge membership. Anonymous, malformed and local simulation identities are denied; request bodies and queries cannot choose identity or mode. The Site-specific authenticated ID owns quota and response receipts. Changing email does not create another allowance. Public Site sharing and AI authorization are separate controls. Robots/noindex settings discourage indexing, not access.

Current approved runtime values are **33 global attempts including history, five per user, 450000 micro-USD ($0.45) per reservation and 14850000 micro-USD ($14.85) total**. At the read-only October 20, 08:45:17 UTC observation, one attempt/$0.45 was used, no request was in flight and 32 global attempts remained. This dated observation is not a future-availability promise.

Before provider dispatch, the existing D1 ledger atomically conserves receipt totals, reserves capacity, enforces per-user/global limits and installs a single global in-flight lock. UUIDs cannot be reused, including different spelling. Grant fingerprints and counters survive restarts and deployments. Partial/inconsistent restores fail closed.

No reservation is refunded or reconciled down to actual token usage, including failures and missing usage. Token counts and price estimates are evidence, not a payment settlement. Timeouts/transport failures/unusable responses may leave upstream work running; they retain the reservation and uncertain lock. There are no automatic retries, fallback models or lock expiry. The ceiling is an **application limit, not a provider invoice guarantee**.

New paid requests are rejected at **December 15, 2026 noon Pacific (`2026-12-15T20:00:00Z`)**, including a second check before dispatch. Already-started upstream work is not cancelled by that deadline. The pool or an uncertain lock can stop new AI earlier. Local measurements stay free.

The historical two-attempt grant was transitioned in place after explicit owner review. Its consumed attempt/$0.45 and receipt were preserved. The maintenance endpoint still requires the exact owner hash, paid-off state and approved expected state; its temporary owner/configuration gates were removed from production after acknowledgment. This documentation is not authority to invoke maintenance, clear locks, reset counters or enlarge the grant.

## Runtime configuration and operations

Keep the existing provider key and other real runtime values out of source, screenshots and browser storage. This candidate changes none of them.

| Variable | Role |
| --- | --- |
| `NEBIUS_API_KEY` | Existing private server-side provider key |
| `NEBIUS_LIVE_ALLOWED` | Explicit live gate; approved current value is 1 |
| `JUDGE_ACCESS_MODE` | Default allowlist; approved current mode signed_in |
| `JUDGE_ALLOWED_USER_IDS`, `JUDGE_ALLOWED_USER_HASHES` | Exact identity allowlist when that mode is selected |
| `JUDGE_BUDGET_GRANT_ID` | Existing immutable approved grant identity |
| `JUDGE_MAX_ATTEMPTS`, `JUDGE_MAX_ATTEMPTS_PER_USER` | Global and per-user attempt limits |
| `JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD`, `JUDGE_TOTAL_MICRO_USD` | Per-attempt and cumulative application reservations |

Missing/invalid configuration disables inference. The hosting manifest identifies the existing Site; an independent operator must obtain a separately authorized binding and configuration for their own deployment. Copying this source is not authority to use another owner's Site, key, database or budget.

The provider is pinned to `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` on Nebius Token Factory. One bounded call is made without automatic retry. Redirects are rejected. Only the generated structured report is sent; validation checks model identity, hashes, schema, evidence references and applicable actions. Secrets/raw provider reasoning are not stored in receipts.

For uncertain outcomes, disable live access before owner reconciliation, match the exact durable request to provider completion evidence and preserve all consumed accounting. If completion is uncertain, leave the lock. No production reconciliation or lock change is performed here. Creating a new database or grant to evade consumed capacity is not supported.

## Verification and remaining release decisions

Historical v7 preparation passed **77 Node tests**, including actual local Worker+D1 execution with outbound transport mocked, plus TypeScript/build checks. A separate nine-check owner/access UI rehearsal used synthetic local identities and an intercepted local maintenance request. Those October 19 results are historical v7 evidence; they are not automatically fresh checks of this new candidate. Fresh candidate results belong in the accompanying verification report.

The October 20 demo preparation separately verified 209 frozen companion files, actual local inspection/review/download/recheck, browser playback, captions and audio levels with zero provider requests. Its new review video is unapproved for replacement public upload.

No independent real non-owner paid acceptance is claimed. Organizer approval of personal ChatGPT sign-in and finite quotas under the rules' unrestricted-access language remains unresolved. Eligibility, rights, exact registration/submission agreements and the authenticated Devpost entry status require review. No source publication, new credentials, access/budget/billing changes, replacement upload or final submission is authorized by this candidate.

Source/procedural fixtures remain MIT. Upstream dependency/vendor licenses and NVIDIA model/service terms are separate; no weights or private Cast assets/code/profiles/history are distributed.
