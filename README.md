# Rig QA Desk

Find rig/export faults, review NVIDIA advice against measured evidence, and preserve a verifiable artist handoff.

## Release status — October 20, 2026

This checkout is a **new local release candidate**. It combines the frozen public companion with the approved hosted v7 source and updated documentation. It has not been pushed or published.

| Material | Verified state |
| --- | --- |
| [Public repository](https://github.com/voyageseattle-hash/rig-qa-desk) | Public MIT baseline, commit `0ae2680ff9fcf22dda45c198ce78c6dc2f1389ad`, published October 13 |
| [Working app](https://rig-qa-desk.gsprodev.chatgpt.site) | Public hosted v7, source commit `ba456c2a45ae3ed915fb52166239c51d2d9b10f4`; successful activation October 19, 05:00:33 UTC, environment revision 7 |
| [Existing public demo](https://www.youtube.com/watch?v=8gYGElZ8jDw) | October 13 publication; 169 seconds; historical hosted captures and Kokoro narration |
| New October 20 review cut | 108.513 seconds, actual local workflow and Kokoro narration; private review copy, **not approved for replacement publication** |
| Contest entry | Authenticated Devpost draft/submission status has not been verified; no final submission is authorized by this preparation |

The original public baseline identity is `15e42d8acc2bc66a527186bd3288ce365783f5d4abeb5ea5e9514031ea28ed4c`. The new candidate identity is in this checkout's `SOURCE-MANIFEST.json`. Do not attribute this candidate's changes to the still-frozen public commit. Historical receipts and dated documents remain unchanged and describe their named revisions.

## Two workflows with different coverage

| Workflow | Where computation runs | What it does |
| --- | --- | --- |
| Independent companion | Local Node.js and browser | Owned/licensed GLB inspection, bounded structural/numeric screening, **separate** official Khronos conformance validation, recorded-advice demonstration and evidence-bound exports |
| Local character/motion panel and CLI | Browser worker or local Node worker | Profile-based rest symmetry, signed hinge limits, sampled mesh stretch/collapse, foot-plane penetration, clip continuity, paired anchors and support windows; reports limits and missing rules |
| Guided hosted AI example | Sites Worker, server-side Nebius adapter and D1 | Fresh checks of fixed owned procedural fixtures, explicit NVIDIA advice request, human decisions, receipt-bound exports and prepared-counterpart reinspection |

Character files and allowance profiles in the local panel stay in the browser and do not enter the AI path. The guided server route does not accept arbitrary uploaded character bytes. The official Khronos validator runs in the independent companion; it is not performed by the hosted character panel. A zero-warning result is not a finished-character, visual-quality, contact-force or physics certificate. No workflow repairs the original asset.

## Run the independent companion

Requires Node.js 22+ and npm; no private backend, GPU, Blender or model weights.

```sh
npm ci --ignore-scripts
npm test
npm start
```

Open **http://127.0.0.1:4318**. An ambient API key alone does not enable live requests.

For a no-spend walkthrough:

```sh
npm run demo
```

Open **http://127.0.0.1:4321** and choose **Run export-workflow demo**. This freshly inspects an owned 24-bone fixture and clearly replays its saved real October 12 NVIDIA response. The demo launcher supplies no provider key and refuses new inference, irrespective of ambient live settings.

The controlled faults are joint slot 24 in a skin with valid slots 0–23, and 22 declared translation samples for 23 timestamps. All 23 sample vectors remain in the binary. Choose review decisions, acknowledge review and export. Inspecting a **separately prepared** corrected export gives two-to-zero companion findings and three-to-zero official errors on this fixture. This demonstrates a known source/export correction; the app does not choose repair values or edit the original.

For character inventory and profile-based checks:

```sh
node judge-site/scripts/inspect-character.mjs --asset owned.glb --inventory yes
node judge-site/scripts/inspect-character.mjs --asset owned.glb --profile allowances.json --other counterpart.glb --output new-report.json
```

The output is create-only. See the [profile guide](judge-site/public/quality/profile-guide.html) for units, axes, thresholds, coverage and supported data. Intentional asymmetry and squash need explicit character-specific allowances.

## Hosted access and finite allowance

The current Site is publicly viewable by URL. AI authorization requires a real ChatGPT-signed-in identity supplied by supported Sites dispatch, a valid durable allowance and an explicit request. Public viewing does not establish judge status; anyone who obtains the URL and signs in can consume the shared pool. No promotion is part of the approved arrangement.

Approved service settings: **five attempts per account, 33 globally including prior usage, $0.45 reserved per attempt, $14.85 total application reservations**. Read-only verification on **October 20, 2026 at 08:45:17 UTC** found one consumed attempt/$0.45 and no in-flight lock, leaving **32 at that observation**. Remaining allowance is not a promise about future availability.

Reservations are permanently consumed, including safe failures and missing usage; they are not reconciled down to token-price estimates. Uncertain provider outcomes also retain the single global in-flight lock until explicit owner reconciliation. No automatic retry, fallback model, lock expiry or counter reset is provided. This is an **application reservation ceiling, not a provider billing guarantee**.

New paid requests stop **December 15, 2026 at noon Pacific, `2026-12-15T20:00:00Z`**. The cutoff does not cancel work already started upstream. A finite pool or unresolved request may stop AI earlier; local checks and recorded playback remain free.

The [contest rules](https://nebiusglobalaihackathon.devpost.com/rules) require free unrestricted access through judging. Organizer acceptance of personal ChatGPT sign-in and these quotas remains unconfirmed. Neither this candidate nor the demo claims uninterrupted or unrestricted model access. Do not weaken safeguards or add funding to resolve that ambiguity without a separate decision.

## NVIDIA/Nebius and evidence boundaries

The server pins `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` through `https://api.tokenfactory.nebius.com/v1/chat/completions`. Only server-generated structured companion findings are sent; character bytes, asset names, extras and private profiles are omitted. Schema, hash, evidence-reference, action and model-identity checks do not establish factual accuracy. The reviewer can accept, defer or reject advice; acceptance authorizes investigation only.

Dated October 12 receipts in [evidence/](evidence/) document real runtime calls, including rejected wording. They are historical evidence, not new test calls or reusable spending authorization. The old below-$1 allowance is not authority for current preparation or new inference.

See [hosted setup and safeguards](judge-site/README.md), [current entry draft](docs/ENTRY-DRAFT.md), [demo plan](docs/DEMO-PLAN.md) and [submission checklist](docs/SUBMISSION-CHECKLIST.md). The new candidate's checks are recorded in its accompanying verification report. The 77 Node tests and nine owner/access browser checks from October 19 are **historical v7 evidence**, not automatically a pass for a different package.

## Source, packaging and rights

The candidate adds the approved v7 character checks, authorization, ledger protections and tests to the public baseline. The existing DB schema and applied migration remain unchanged; no production database operation is part of this candidate.

```sh
npm run bundle
npm run verify:bundle
```

The aggregate manifest excludes itself and the separate preparation-status marker to avoid self-reference. The release ZIP hash covers the complete packaged tree. Dependencies, caches, build output, credentials and local evidence paths are excluded.

MIT covers independently authored companion source and procedural fixtures; see [LICENSE](LICENSE), [NOTICE](NOTICE) and [third-party notes](docs/THIRD-PARTY.md). Private Cast Compiler code/history, private game assets/profiles/derivatives and NVIDIA weights are excluded. NVIDIA model and service licensing is separate from MIT.

This local preparation does not authorize repository publication, replacement video publication, new credentials, production changes, billing changes, registration/terms acceptance or final contest submission. Existing successful public activation is preserved.
