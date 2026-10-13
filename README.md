# Rig QA Desk

An independently runnable, read-only GLB rig/animation QA companion prepared for a possible **Nebius × NVIDIA Global AI Hackathon** entry. It does not import Cast Compiler code, invoke its IPC, use its database, or require its installed executable.

**Private hosted release candidate, October 12, 2026.** The owner approved **MIT** for this independent source and its procedural fixtures. See [LICENSE](LICENSE) and [scope exclusions](NOTICE). Private Cast Compiler and NVIDIA weights are excluded. The ChatGPT Sites guided service is deployed privately; its existing server-side Nebius key, exact owner allowlist and bounded test budget were approved. One hosted real NVIDIA response and the reviewed download were verified. Public source/video release, shared judge access, registration, terms acceptance and contest submission remain on hold. No billing enablement was performed. Historical provider evidence below describes its named revision and test, not every later build.

## Run independently

Requires **Node.js 22 or newer** and npm. No GPU, Blender, Docker, Python, private backend or model weights are required.

```sh
npm ci --ignore-scripts
npm test
npm start
```

Open **http://127.0.0.1:4318**. The default is offline inspection. An ambient API key alone does not enable live requests.

For the owner acceptance test, click **Run guided test**. It freshly inspects the owned valid and duplicate-time fixtures, then replays the saved real NVIDIA response from October 12. No key or provider call is needed, even on a live-enabled server. The UI labels this **RECORDED** and explains that zero itself is valid while duplicate timestamps are the measured error. Read the result, choose defer/reject/accept, acknowledge review and export if desired. Exports retain `mode: recorded`, the original request time, playback time and evidence-file hash. A new test or asset selection clears prior decisions. Feedback can be given in chat: whether the issue and distinction between measurements and AI wording are clear. No 3D editing is necessary.

For the prepared demo, run **`npm run demo`** and open **http://127.0.0.1:4321**. This launcher ignores ambient live activation and credentials, and refuses new provider requests. Click **Run export-workflow demo** for fresh local inspection and official validation of a 24-bone procedural sample with two controlled export faults, followed by its recorded real NVIDIA recommendations. The visual evidence shows the 48-vertex ribbon, the affected surface point and its invalid bone reference, plus the animation timeline with 23 timestamps but only 22 declared translation samples. Review decisions start unset. The original bone-index demo and timing counterexample remain available, with their historical evidence preserved. See the [final demo script and recording runbook](docs/DEMO-PLAN.md).

Click **Inspect prepared corrected export** to check a separately generated valid counterpart. This example restores the known authoring reference to joint 0 and the translation accessor's declared count to 23. All animation sample bytes were already present; no motion values are invented or generated. Fresh companion and official validation produce zero findings on this prepared sample, while the faulty report and recorded advice remain available. The app does not repair an uploaded asset: this is an explicit comparison against known fixture authoring data, illustrating the artist's inspect → correct in the source project → re-export → inspect again workflow.

For a separate simulated-advice rehearsal:

```sh
npm run demo:mock
```

Mock advice is simulated. It does **not** satisfy the contest's NVIDIA/Nebius runtime requirement. The user interface, export metadata and tests identify mock responses explicitly; no silent fallback is used.

To generate the owned procedural GLB files locally:

```sh
npm run fixtures
```

The UI can also load its procedural fixtures directly, without generating files. The valid fixture has a skinned triangle and an animation. The timing-error UI fixture has duplicate animation times. `flawed-skinned.glb` from the generator additionally exercises reference, cycle, non-finite and joint-index errors. No existing game asset is distributed.

## Workflow

1. Choose an owned or licensed self-contained GLB and confirm permission to inspect it.
2. Run deterministic checks. Findings have stable IDs, JSON/accessor locations, measured evidence and the original asset SHA256.
3. Review coverage. Sparse accessors, compressed or unknown extensions, morph animation and external resources are explicitly outside this small inspector's coverage. Unsupported does not mean passed.
4. Review what would be sent, then request model advice. Only the server-generated structured report is sent; GLB bytes, names, extras and private Cast profiles are omitted.
5. Accept, defer or reject each suggestion. Export the review, bound to asset, inspection and advice hashes. Accepting a suggestion does not approve or execute an asset repair.

Original assets are never written. Upload bytes exist only during inspection, then are discarded; at most eight structured reports remain in process memory for 30 minutes. Reloading/restarting may require reinspection. There is no repair endpoint or execution tool.

### Readable artist handoff

**Export artist handoff** downloads a Markdown investigation sheet without an AI request. It includes the exact asset and measured-report hashes, affected vertex/channel/accessor locations, measured observations and practical source investigation/re-export/recheck steps. Coverage notices and official conformance findings remain separate. Human review is explicitly **not recorded** and repair approval is **false**; this export contains no AI suggestions. Keep the measured JSON alongside it when checking the evidence.

The companion has no built-in 3D character renderer. A separately prepared local video presentation may animate a permitted original and place measured findings over it; camera moves/highlights are presentation overlays, not measured deformation symptoms. Private characters and their recordings stay outside the source package and require a separate rights/public-use decision before an external demo.

### Official validation and useful local reports (October 12 refinement)

Asset uploads now also run the pinned official Khronos `gltf-validator@2.0.0-dev.3.10` locally. Its result is separate from the original companion report and from AI suggestions, with its own asset hash, evidence hash, validator version, status, issue counts and JSON pointers. Validation has a five-second deadline, a terminable worker with a 192 MiB old-generation budget, one upload inspection at a time and a 128-message cap. Timed-out, unavailable and truncated results are explicit; they are not passes. External file and URL resources are always refused. Embedded-resource validation remains local. The existing GLB/JSON/collection limits apply before this worker runs.

For a non-root skinned mesh, the UI shows the mesh/skin/parent indices, parent scale, joint count and whether animation channels target the mesh or immediate parent. The next step is to check size, placement and animation in the target engine. A hierarchy warning is not proof of a broken rig and does not justify automatic reparenting or applying scale. Imported asset names and validator diagnostic text are omitted from the new evidence; the UI uses text nodes.

Companion unsupported-feature notices are grouped separately from structural issues. Declared extensions are named with official-validator support status; this does not certify rendered material appearance. The original companion JSON and historical recorded NVIDIA reports remain unchanged. AI requests and reviewed AI exports still use only companion findings; official findings are not yet sent to the model.

**Export measured checks** saves both measured reports and their hashes without a provider request. It explicitly records human review as **not recorded** and repair approval as **false**. This is separate from the existing reviewed-AI export. Private Cast assets used for evaluation are never included in the runnable source bundle.

## Measured checks and limitations

The inspector screens GLB container shape, node/skin/accessor references, hierarchy cycles, supported accessor layouts and finite values, joint indices for each associated skin instance, and animation target/sampler shape, output counts and nonnegative strictly increasing times. LINEAR, STEP and CUBICSPLINE are supported for translation, rotation and scale where their numeric accessors are supported. Nonjoint animation targets are valid.

The companion inspector is a bounded structural screen. The separate official validator adds its own conformance checks, including supported numeric normalization diagnostics. Neither evaluates anatomical correctness, visual mesh quality, bone-tail lengths, evaluated deformation, contact forces, collisions, engine behavior or physical correctness. Findings do not certify a character for a game. AI text remains unverified even after JSON/schema/evidence-reference validation.

Bounds include 32 MiB assets, 4 MiB JSON, depth/collection/work budgets, at most 128 findings, a bounded provider response and a 30-second provider deadline. Truncation and skipped checks appear in coverage. Imported strings and provider output are treated as data and rendered with text nodes. The server binds loopback and validates Host/Origin and explicit request headers.

## NVIDIA model and Nebius verification

On **October 12, 2026**, the live [Nebius model catalog](https://tokenfactory.nebius.com/models/catalog/text2text/nvidia%2FNVIDIA-Nemotron-3-Nano-30B-A3B) listed the public endpoint routing key **`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`**, FP8, 262K context. The adapter pins this exact ID and the generic endpoint `https://api.tokenfactory.nebius.com/v1/chat/completions`; it does not pin a processing region or switch models on failure. Catalog availability is distinct from account access and successful inference.

The hosted model's linked [NVIDIA FP8 model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8) identifies the governing [NVIDIA Nemotron Open Model License](https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-nemotron-open-model-license/). Nebius's catalog still links the older generic NVIDIA license label; the model card is the more specific upstream license evidence. The adapter distributes no weights. This custom model license is separate from the companion's MIT source license; do not label NVIDIA weights MIT or claim OSI approval.

Nebius documents [structured JSON output](https://docs.tokenfactory.nebius.com/ai-models-inference/json). On October 12, an authenticated read-only model-list request accepted the privately configured key and listed the exact pinned model. The first separately approved request returned HTTP 400. The owner then approved up to three additional requests with a combined $0.02 limit. The diagnostic identified unsupported `uniqueItems` in the generation grammar. The adapter omits that keyword only from the provider grammar and still enforces it locally. A second response used an action inconsistent with its timing finding and was rejected. The final request returned **HTTP 200 in 5.902 seconds** from the exact pinned model; strict local validation passed and the UI displayed the linked recommendation. Generation constraints now narrow finding IDs, asset hash and action choices to the actual report; per-finding applicability remains checked locally. There were no automatic retries or model switches. See [original attempt](evidence/LIVE-ATTEMPT-2026-10-12.json) and [successful runtime evidence](evidence/LIVE-VERIFICATION-2026-10-12.json).

The accepted advice still has a factual wording limitation: it describes the zero timestamp as violating the timing rule. Zero itself is permitted; the fixture's error is duplicate times `[0, 0]`. Its supported review action and evidence link pass the protocol, but schema validity does not establish prose accuracy. The owner reviewed the guided result and explicitly directed **defer** on October 12. The agent recorded that instruction in the UI and exported the hash-bound review; see [owner decision](evidence/OWNER-DECISION-2026-10-12.json) and [review export](evidence/OWNER-REVIEW-2026-10-12.json). The owner subsequently asked the agent to align the best path forward. Exercising that delegated judgment, the agent changed the decision to **reject the inaccurate explanation**, kept the valid measured timing finding and exported the revised review; see [resolution provenance](evidence/REVIEW-RESOLUTION-2026-10-12.json). The initial deferral remains in history. Each new session still leaves decisions unset. Neither decision approves advice or authorizes repair. The original live receipt retains its historical pending-review state; the separate owner record completes the audit trail. At catalog rates the two HTTP-success responses together estimate $0.00068856; actual provider charges, including rejected requests, were not verified from an invoice.

After that approval, keep an existing key in a private environment variable, never in source, browser storage, logs, screenshots or a demo. Set `NEBIUS_API_KEY` and `NEBIUS_LIVE_ALLOWED=1` outside this repository, restart `npm start`, and explicitly review/approve the findings in the UI. The adapter makes one bounded request, has no automatic retries, and never executes suggested commands. Token limits constrain output size; they do **not** guarantee a dollar spending cap. Recheck provider pricing before approved live verification.

## Additional recommendation-quality check

The owner approved **one** further request capped at $0.02 on October 12. The owned sample has two skin joint entries and a measured index of 7. The pinned model returned HTTP 200 in **6.287 seconds**, with **1,115 input and 1,256 output tokens**. Its explanation correctly describes the measured range violation and preserves uncertainty about other properties. Agent review is limited to that explanation; it does not prove future advice or mesh/physical quality. See [quality receipt](evidence/LIVE-QUALITY-2026-10-12.json).

The original adapter mistakenly rejected the uncertainty wording “cannot guarantee” as a positive guarantee. The narrow fix permits that denial while still rejecting positive and mixed guarantee claims. The unchanged real response was revalidated **offline** against the corrected adapter, with a mock transport regression test. No new live request after this fix was made. The receipt records both historical live and corrected validation hashes; they must not be conflated. Estimated token cost was **$0.00036834** at the verified catalog rates; invoice charges remain unverified. This approval is consumed, with no automatic retry.

The primary **Run bone-index demo** does fresh inspections and replays that response without a key or inference call. It starts with no review decision or acknowledgment selected. The accepted protocol and agent fact check do not substitute for the owner's review. The timing case and its original response/history remain separate. No repair is executed.

## Tests and reproducible draft bundle

### Sites judge service

`judge-site/` is the independently runnable ChatGPT Sites guided service, with fresh owned-fixture structural inspection, server-side NVIDIA/Nebius advice, explicit review/export and persistent D1 request reservations. Its private hosted runtime has passed the measured → real advice → reviewed download → prepared-counterpart reinspection workflow. It includes an independently buildable shared-source snapshot; no private backend is required. Read [its setup and release boundaries](judge-site/README.md).

Development rehearsals explicitly use local simulated sign-in and **MOCK** advice. The production build cannot activate that mock branch. Live requests remain disabled without approved secrets, allowlisted Site identities and a durable grant. Unknown provider outcomes retain consumed allowance and the in-flight lock. The current owner-only two-attempt grant is a test allowance, not a sustained contest judging arrangement. Its immutable counters cannot be reset or expanded by editing environment values. Broader access and a separately reviewed budget transition need approval before submission.

Hosted guided checks and the Node application's official conformance report have different scopes: the hosted test does not run the Khronos validator or accept arbitrary uploads. It does not perform repairs or guarantee visual/physical quality. Historical real-request and recording receipts remain bound to their own source revisions; accompanying final manifests and verification receipts identify current source.

### Final export-workflow evaluation

On October 12, the owner authorized this test and final materials with total new spending below $1. A private production-animation copy and a separate owned procedural counterpart each received two deliberately injected faults: active joint index 24 for24 joints (valid 0–23), and a LINEAR translation output accessor declaring22 samples for23 timestamps. Original assets stayed unchanged; no private geometry, names, profiles or derivatives enter the source bundle or video. These are simulated export faults, not naturally observed production defects.

Four separately initiated live requests used the pinned Nano model, with no automatic retries or model switch. Earlier responses exposed uncertainty that contradicted the measured range, and imprecise equal-to-count wording. Those responses remain in a separate audit history. The prompt now preserves measured numeric facts while restricting uncertainty to cause, impact and intended repair data. Animation count evidence includes target node/path and accessor indices without asset names.

The final public procedural response correctly explains both faults, gives both high priority, identifies node 0's translation channel and recommends source/export review. It returned HTTP 200 in 7.577 seconds, with 1,413 input and 1,632 output tokens. The tested adapter hash is bound in [runtime evidence](evidence/LIVE-WORKFLOW-2026-10-12.json). All four calls estimate **$0.00184668** at verified published token rates; an invoice was not verified. The agent's narrow factual assessment is not a guarantee of future advice. Human decisions in a fresh UI remain unset; demonstration review is agent-authored and never approves repair.

The owned baseline produces0 companion findings and0 official diagnostics. The controlled flawed sample produces2 companion errors and3 official diagnostics, including a weight-sum consequence of the invalid joint reference. Exact fresh fixture/report hashes are checked before recorded playback. Automated tests remain mocked/recorded and make no paid calls.

The visual workflow refinement makes those numeric failures concrete without claiming rendered breakage. It highlights vertex 0's active reference to absent joint 24 and shows the missing declared timeline slot. The user can then inspect the independently prepared corrected counterpart to confirm that these supported findings are gone. Zero findings means these checks found no issue in this sample; it does not prove visual deformation, engine behavior or physical correctness. No fresh provider request is needed for the comparison.

```sh
npm test
npm run test:browser
npm run bundle
npm run verify:bundle
```

Browser tests run the independent server in **mock mode**. On Windows they use installed Microsoft Edge. On Linux/macOS install the test browser first with `npx playwright install chromium`. Automated tests cover valid/flawed fixtures, numeric/timing/reference errors, unsupported features, schema and evidence validation, unsupported recommendations, provider 401/429/5xx, timeouts, malformed/oversized responses, prompt injection, read-only review and credential redaction. They cannot establish real provider acceptance.

The bundle is an allowlisted complete source snapshot in `dist/`, with MIT `LICENSE`, scope `NOTICE`, pinned `package-lock.json` and `SOURCE-MANIFEST.json`. No `.env`, `node_modules`, private app, profile, log or repository history is exported. Run `npm ci` in a copy of this bundle outside the Cast repository to reproduce tests. Verify the manifest **before** installing dependencies into that copy. The bundled draft marker records remaining publication/access/submission gates. Guided playback is not a fresh runtime call or substitute for clearly labeled real-runtime evidence.

See [scope and release decision](docs/SCOPE-2026-10-12.md), [demo plan](docs/DEMO-PLAN.md), and [new-work evidence](evidence/NEW-WORK-2026-10-12.json).
