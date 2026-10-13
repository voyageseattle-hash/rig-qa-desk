# Rig QA Desk — Sites judge service

**Privately deployed and verified on October 12, 2026.** The owner authorized the hosted Site, existing Nebius server secret, exact owner allowlist and a bounded live test. One real NVIDIA response and its reviewed evidence download succeeded. Source and procedural fixtures are approved for MIT; public source/video release, shared judge access, registration, terms acceptance and contest submission remain on hold. No billing enablement occurred.

This is the independently runnable hosted guided test for the Rig QA Desk companion. ChatGPT Sites provides the Worker runtime, dispatch-owned sign-in, private runtime secrets and D1 storage. A separate Cloudflare account is not required for this Sites workflow. The existing private deployment preserves owner-only access. Shared judging access and sustained runtime costs still require an approved plan. [Official Sites documentation](https://learn.chatgpt.com/docs/sites?surface=app).

The service generates an owned 24-bone procedural GLB, performs fresh bounded structural checks, presents the affected vertex and animation sample count, and proposes human investigation through the pinned NVIDIA/Nebius adapter. It exports a measured artist Markdown handoff and, after explicit decisions, a report bound to the exact live response receipt. A prepared valid counterpart demonstrates reinspection; no asset is repaired.

The guided hosted scope is structural checks on fixed owned fixtures. It has no arbitrary upload route or built-in 3D viewer. The downloadable companion also loads owned GLBs and runs a **separate** bounded official Khronos conformance check. That official check does not run in this hosted service. No inspection certifies deformation, physics or engine behavior.

## Reproduce locally

Use Node.js 22.13 or newer (Node 24 was used for the local verification). From this directory:

```sh
npm ci --prefer-offline --no-audit --no-fund
node scripts/sync-shared.mjs --verify
node scripts/generate-validators.mjs
npm test
npm run build
```

The committed `shared/` snapshot contains eight allowlisted companion modules and schemas. Its manifest verifies every file. A standalone checkout builds from that snapshot without any parent repository or private Cast backend. In the complete public candidate repository, the sync helper can update those copies from the public companion source. Generated validators contain no runtime filesystem read, Ajv compilation or `eval`.

The initial schema migration is already committed in `drizzle/`. Generate a new migration only when changing the schema; do not rewrite applied migrations. Before first local use, apply the existing migration once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_calm_thing.sql
```

Local and hosted databases are separate. This command does not create a cloud database or deploy anything.

For a no-spend development rehearsal, copy `.dev.vars.example` to the ignored `.dev.vars`. It contains only `RIG_QA_LOCAL_MOCK="1"`. Run:

```sh
npm run dev -- --hostname 127.0.0.1 --port 4325
```

Open the printed loopback URL. **Sign in with ChatGPT** uses the Sites starter's **local simulated identity** during development; it does not create an account or contact hosted auth. The page labels all advice **MOCK**. Production builds remove this mock activation branch and reject the local simulated user.

Inspect → review the report → generate MOCK advice → choose a decision for each suggestion → acknowledge investigation-only scope → download reviewed evidence → inspect the prepared valid counterpart. Measured Markdown exports need no AI call or sign-in.

To exercise the built Worker locally with live disabled:

```sh
npm start -- --port 4326
```

This uses local Wrangler/workerd, not a deployment. It does not simulate sign-in. Never expose this direct local Worker or trust user-supplied identity headers outside Sites dispatch.

Browser tests use the complete public candidate repository's root Playwright dependency. Run `npm ci` at the companion root first, then `npm run test:browser` here. They use local simulated identity and mocked AI. On Windows they use installed Edge; on Linux/macOS install Chromium through the root Playwright setup. Browser state must be freshly initialized for each test. Tests assert the service is mock before generating advice; no paid request is made.

## Live configuration — approval required

Do not populate real values in source, `.openai/hosting.json`, demos, logs or browser storage. After exact registration/deployment/access/budget approval, configure these **server-side** runtime values through Sites settings:

| Variable | Purpose |
| --- | --- |
| `NEBIUS_API_KEY` | Existing privately configured Token Factory key |
| `NEBIUS_LIVE_ALLOWED` | Must explicitly equal `1` |
| `JUDGE_ALLOWED_USER_IDS` | Comma-separated Site-specific authenticated judge IDs |
| `JUDGE_ALLOWED_USER_HASHES` | Optional comma-separated SHA256 fingerprints of Site-specific authenticated judge IDs; exact matching only |
| `JUDGE_BUDGET_GRANT_ID` | Identifier for one explicitly approved persistent grant |
| `JUDGE_MAX_ATTEMPTS` | Global maximum number of paid attempts |
| `JUDGE_MAX_ATTEMPTS_PER_USER` | Per-judge attempt allowance |
| `JUDGE_RESERVE_PER_ATTEMPT_MICRO_USD` | Conservative reservation, at least 20,000 microUSD ($0.02) |
| `JUDGE_TOTAL_MICRO_USD` | Total approved reservation allowance |

Missing or invalid configuration disables live inference. The source contains no provider key or authorization grant values. Its hosting manifest identifies the existing private Site; a new operator must register their own Site and replace that binding through the supported Sites workflow. Never grant access to another owner's project. A reservation allowance is **not** a provider-enforced billing cap. Verify pinned-model pricing and account limits before approval; no free credits are assumed.

The first request initializes a single durable grant. Its fingerprint must remain identical across deployments; changing configuration does not reset or enlarge the existing allowance. Before sending, one atomic D1 transaction reserves the attempt, applies per-user/global limits and sets an in-flight lock. UUIDs cannot be reused, even in another spelling. Failure, absent usage and unknown outcome do not refund reservations. There are no automatic retries, fallback models or automatic lock expiry.

Only the server-generated report is sent. The model is `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` at the pinned Nebius endpoint. The Worker transport uses manual redirects; all 3xx responses are rejected, and credentials are never forwarded to a redirect destination. Hashes, findings, schema, actions and model identity are validated. Raw provider reasoning and credentials are not stored. The ledger stores reviewer hash, evidence/advice hashes, outcome and bounded token counts.

Identity is trusted only after Sites dispatch supplies it. Sign-in establishes identity, not membership. Both Site audience controls and the server-side judge allowlist need deliberate configuration. Do not deploy this Worker directly to an unprotected domain. Local test bindings use fake values and are not real credentials or a spending approval.

## Unknown outcomes and owner reconciliation

A timeout, transport failure or unusable response may leave upstream work running. Such attempts remain `unknown` and keep the global in-flight lock, including across restarts. The UI tells users not to retry automatically.

Disable live access first. Inspect the matching durable request and budget IDs; obtain provider confirmation that upstream work has finished and review usage. If completion cannot be confirmed, leave access blocked. Only after explicit owner review may an operator use a D1 transaction to mark that exact unknown request terminal and clear its matching lock. Preserve counters, reserved allowance, grant fingerprint and consumed IDs. There is no reset or reconciliation HTTP endpoint. Creating another database or grant to evade consumed allowance is not supported.

## Verification and release boundaries

The 25 service tests use real SQLite transactions shaped like D1 and the actual local Worker/D1 emulator with outbound network connections disabled and mocked provider replies. They cover success, idempotency, uncertain outcomes, redirects and exact Site identity authorization. Four browser tests use explicitly labeled local mocks. These automated tests are **not real Nebius calls**. A separate owner-authorized hosted request verified the pinned real model and reviewed download; its evidence is outside the runnable source package. Historical provider receipts remain bound to their named adapter revision.

The hosted bone-index recommendation correctly identified valid slots 0–23. The animation suggestion correctly identified the 22-versus-23 mismatch but incorrectly claimed the required output count was uncertain. The measured LINEAR count is known; only intended authoring data is unknown. That suggestion was deferred in the test review. JSON/schema acceptance does not establish factual accuracy.

The private test grant permits only two attempts and preserves consumed counters. It is not a contest judge-access arrangement. Before submission, approve an access mechanism usable by judges, a sustained inference allowance and a reviewed transition that preserves prior receipts and expenditure. Never delete the database, change fingerprints or rotate grants to bypass an exhausted test allowance.

The production route must fold `import.meta.env.DEV` to false. Reverify the final artifact, server-only key boundary, source manifest, sharing capabilities and a clean judge session before release. Dated receipts sit beside each final source bundle; earlier source/video receipts remain historical.

Source/procedural fixtures: MIT, with the included scope NOTICE. Vendored Sites build integration retains its upstream MIT license. Dependencies are pinned in the lockfile and retain their own licenses. NVIDIA model licensing is separate; no weights are redistributed or labeled MIT. Registration, runtime credential configuration, billing, access grants, publication and submission remain owner decisions.
