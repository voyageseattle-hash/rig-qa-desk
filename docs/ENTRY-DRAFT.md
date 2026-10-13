# Rig QA Desk — local submission draft

**Status:** Local release-candidate materials for owner review. Not published, registered or submitted. The accompanying final package/recording verification receipts are authoritative for source and video identity.

**Title:** Rig QA Desk

**Tagline:** Find rig and animation file errors before import, then review AI advice against the evidence.

**Proposed track:** Best Apps and Agents.

## Problem and audience

An artist can receive a rigged character that looks ready but contains an invalid bone reference, broken animation timing or an import-sensitive hierarchy. Those problems are hard to diagnose from a generic import failure. An AI explanation alone is also unreliable: it can sound convincing while misunderstanding a measured error.

Rig QA Desk helps artists and technical animators answer three concrete questions: what was detected, where it occurs in the file, and what to review next. Its value is a portable pre-import report with exact evidence and explicit review decisions. We have not measured production time savings or claimed that a clean report certifies a character.

The prepared workflow makes the benefit visible: a surface point references a bone that does not exist in the joint list, and an animation timeline declares one fewer movement sample than timestamps. The report locates both problems before engine import. A separately prepared corrected export is inspected again, demonstrating how an artist can verify that a source/export correction removed the detected faults.

## What we built

Load an owned or licensed self-contained GLB into a local browser interface. The companion runs bounded rig/animation checks and the pinned official Khronos glTF Validator. Their findings stay separate, with asset hashes, JSON locations and coverage status. Unsupported-feature notices are distinguished from detected issues. A non-root skinned-mesh warning includes parent/skin context and a practical target-engine review step; it does not automatically prescribe a hierarchy repair.

The user can export measured checks immediately. To request AI advice, they first review the structured findings that will be sent. A pinned NVIDIA model through Nebius Token Factory proposes prioritized next steps with evidence IDs and uncertainty. Schema, asset-hash, finding-reference and action checks reject unsupported responses. The user then accepts, defers or rejects each suggestion and exports the decision bound to the asset, inspection and advice hashes. Acceptance means accepting a review recommendation, not authorizing a repair.

Original files remain unchanged. There is no repair execution endpoint. The independent Node.js 22+ application needs no private backend, GPU, Blender or local model weights.

The owned export-workflow example includes a 48-vertex ribbon diagram with the affected vertex and invalid joint reference, and a measured 23-timestamp/22-declared-sample timeline. **Inspect prepared corrected export** explicitly inspects a separately generated valid counterpart; it does not modify the flawed bytes or run an AI repair. The known fixture authoring data supplies joint 0 and the declared count of 23. The animation sample bytes were already present. Faulty evidence and recorded recommendations are retained alongside the fresh corrected result.

## NVIDIA and Nebius implementation

The server-side adapter calls **`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`** at **`https://api.tokenfactory.nebius.com/v1/chat/completions`**. Only the server-generated companion findings are sent; GLB bytes, asset names, extras and private application profiles are omitted. Official-validator findings currently remain a separate local report and are not sent to the model.

Real requests on October 12, 2026 established authenticated runtime use of the pinned NVIDIA model on Nebius. Historical receipts distinguish the adapter used during each live request from later offline revalidation. Automated provider tests use labeled mocks. No-spend demo playback is explicitly marked **RECORDED**; it is not presented as a fresh runtime call.

The NVIDIA Nemotron Open Model License governs model use separately from the companion's MIT source license. No weights are distributed, and we do not label the model MIT or claim OSI approval. See [third-party notes](THIRD-PARTY.md) and the dated runtime receipts in `evidence/`.

## Evidence and recommendation quality

The prior bone-index test correctly explained index 7 outside a two-entry joint list. A separate timing test exposed an inaccurate explanation: zero was blamed, although the measured issue was duplicate timestamps `[0, 0]`. That wording was rejected while the valid measured finding and original model output were retained. A schema-valid response is not necessarily factually correct.

The realistic evaluation injected two export faults into a separate private production-animation copy and into an independent owned procedural counterpart: index 24 in a 24-joint list, and 22 declared translation samples for 23 timestamps. The originals remained unchanged; no private asset or derivative is distributed. The public counterpart has 24 bones and two animation tracks. Its clean baseline has no companion findings or official diagnostics; the flawed copy has two companion errors and three official diagnostics, including a consequence of the invalid active joint.

Earlier model replies questioned a measured range or used imprecise equal-to-count wording. We retained those responses and clarified the prompt. The final real response correctly states valid indices 0–23, identifies node 0's translation track and the 23-versus-22 mismatch, gives both high priority and suggests checking source/export mapping. Unknown causes and repair values remain unknown. Agent factual review passed this narrow rubric; future advice and visual behavior are not validated. The video reenacts agent review, not independent owner approval.

## New work and lessons

The independent companion was authored on October 12, 2026: bounded inspector, schemas, loopback server, UI, NVIDIA/Nebius adapter, procedural fixtures, hash-bound review export, tests and reproducible source bundle. The same day's refinement adds official conformance validation in a bounded worker, understandable hierarchy context, separate coverage notices and an inspection-only export. Dated evidence and local Git commits document this work. It does not depend on the private application from which the workflow was identified.

The later visual workflow refinement connects the evidence to a surface-point diagram and animation timeline, then lets the user explicitly re-inspect a known corrected counterpart. It demonstrates the measured before/after comparison rather than attributing a repair to the model. Revised tests, source identity and recording receipts must accompany this refinement; earlier receipts describe their own frozen source versions.

The important lesson was that precise measurements and AI prose need different trust boundaries. A useful report points to evidence and states uncertainty. A model's suggestion still needs review, even when the transport and schema are valid.

## Platform feedback draft

**Token Factory:** The OpenAI-compatible endpoint made a small server-side integration practical. Structured generation rejected the `uniqueItems` schema keyword on our initial request. We removed it from the provider grammar while retaining local enforcement. Clearer documentation of supported schema keywords and a preflight schema check would reduce trial-and-error requests. Bounded output, one request at a time and no automatic retries made costs and failures easier to control.

**NVIDIA Nemotron:** The model correctly explained one measured joint-index range error, but a separate explanation misread duplicate animation timestamps. Finding-linked structured output is useful, but does not establish factual correctness. Tests should include plausible incorrect explanations and explicit uncertainty, not only malformed JSON. Our local filter also initially misread “cannot guarantee” as a positive guarantee; that defect was fixed and regression-tested without changing the saved response.

**AI Cloud:** Not used or benchmarked. We used Token Factory for hosted inference; we have no deployment-performance or GPU-availability findings to report.

## Limits

This is structural screening plus a separate bounded conformance report. It does not evaluate deformation, anatomy, collisions, forces or game-engine behavior. External resources are refused; limits, truncation, errors and timeouts are explicit. No model output proves mesh quality or physical correctness. The application identifies itself as a review aid and preserves the original asset.

## Final evidence fields — complete before any submission

| Field | Current value / required evidence |
| --- | --- |
| Final source identity | Exact identity supplied in `SOURCE-MANIFEST.json`; do not embed its own aggregate hash in tracked source |
| Final independent package verification | Accompanying final receipt; authoring source passed 71 unit checks and 7 browser tests |
| Realistic flawed-asset test | Public fixture/report and factual assessment in `evidence/LIVE-WORKFLOW-2026-10-12.json`; private trial remains private |
| New live request | Final response: pinned Nano, HTTP 200, 7.577 seconds, 1,413 input + 1,632 output tokens; adapter hash in runtime receipt |
| Spending authorization | Current owner instruction permits this requested work below $1 total; no billing changes or automatic retry authorization |
| Final demo | Accompanying `Rig-QA-Desk-Demo-DRAFT-2026-10-12.mp4` and recording receipt/captions; earlier video is historical |
| Review provenance | Agent demonstration accepts investigation only; independent owner review pending; no repair approval |
| Public repository URL | **Not created; owner publication approval required** |
| Working build / judge access URL | **Not granted; exact free-access arrangement requires approval** |
| Public YouTube URL | **Not uploaded; owner approval required** |
| Entrant / representative details | **Owner to provide privately when entering; do not invent** |

Complete the [submission checklist](SUBMISSION-CHECKLIST.md) before treating this text as ready to submit. No private character asset, name, source path or credential belongs in public materials.
