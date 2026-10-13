import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectGlb } from './inspect.mjs';
import { buildFixture } from '../fixtures/generate.mjs';
import { buildWorkflowFixture } from '../fixtures/workflow.mjs';
import { workflowVisual } from './workflow-visual.mjs';
import { validateInspection, validateAdvice, createMockAdvice, requestRecommendations, NEBIUS_MODEL } from './recommend.mjs';
import { validateReview } from './review.mjs';
import { inspectConformance } from './conformance.mjs';
import { validateMeasuredExport } from './measured-export.mjs';
import { createArtistHandoff } from './handoff.mjs';

const ROOT = new URL('../', import.meta.url);
const STATIC = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['public/app.mjs', 'text/javascript; charset=utf-8']],
  ['/workflow-visual.mjs', ['public/workflow-visual.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']]
]);
const MAX_ASSET = 32 * 1024 * 1024;
const MAX_JSON = 32 * 1024;
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bad = (code, status = 400) => Object.assign(new Error(code), { code, status });
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => keys.includes(key));

async function bytes(req, limit) {
  const declared = req.headers['content-length'];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw bad('REQUEST_TOO_LARGE', 413);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw bad('REQUEST_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

async function json(req) {
  if (req.headers['content-type'] !== 'application/json') throw bad('JSON_REQUIRED', 415);
  try { return JSON.parse((await bytes(req, MAX_JSON)).toString('utf8')); }
  catch (error) { if (error.code) throw error; throw bad('INVALID_JSON'); }
}

export function createQaServer({ mock = false, apiKey = '', liveAllowed = false, fetchImpl, timeoutMs = 30000, conformanceOptions } = {}) {
  const mode = mock ? 'mock' : (liveAllowed && apiKey ? 'live' : 'offline');
  const reports = new Map();
  let busy = false;
  let inspecting = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const send = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    try {
      const port = server.address()?.port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) throw bad('LOCAL_HOST_REQUIRED', 403);
      if (req.method === 'POST' && (req.headers.origin !== `http://${req.headers.host}`
        || req.headers['x-rig-qa-request'] !== '1')) throw bad('LOCAL_ORIGIN_REQUIRED', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.search) throw bad('QUERY_NOT_SUPPORTED');
      if (req.method === 'GET' && STATIC.has(url.pathname)) {
        const [file, type] = STATIC.get(url.pathname);
        const content = await readFile(new URL(file, ROOT));
        res.writeHead(200, { 'Content-Type': type });
        res.end(content);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        send(200, { mode, model: NEBIUS_MODEL, runtime_verified: false,
          disclosure: 'Only structured measured findings are sent. No GLB bytes, names or private profile are sent.',
          publication: 'MIT license approved for independent companion and procedural fixtures. Publication remains unapproved.' });
        return;
      }
      if (req.method === 'GET' && ['/api/fixtures/valid.glb', '/api/fixtures/flawed.glb', '/api/fixtures/workflow-valid.glb', '/api/fixtures/workflow-flawed.glb'].includes(url.pathname)) {
        const fixture = url.pathname.includes('workflow-') ? buildWorkflowFixture({ flawed: url.pathname.endsWith('workflow-flawed.glb') }) : url.pathname.endsWith('flawed.glb') ? buildFixture({ timeValues: [0, 0] }) : buildFixture();
        res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
        res.end(fixture);
        return;
      }
      for (const [id, record] of reports) if (Date.now() - record.created > 30 * 60 * 1000) reports.delete(id);
      if (req.method === 'POST' && ['/api/guided-test', '/api/quality-test', '/api/workflow-test'].includes(url.pathname)) {
        const body = await json(req);
        if (!exactKeys(body, [])) throw bad('INVALID_REQUEST');
        // Fresh local inspection plus an explicitly recorded provider result.
        // This path never calls a provider, even when the server is live-enabled.
        const workflow = url.pathname === '/api/workflow-test';
        const valid_report = validateInspection(inspectGlb(workflow ? buildWorkflowFixture() : buildFixture()));
        const quality = url.pathname === '/api/quality-test';
        const report = validateInspection(inspectGlb(workflow ? buildWorkflowFixture({ flawed: true }) : buildFixture(quality
          ? { jointValues: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } : { timeValues: [0, 0] })));
        const recordingBytes = await readFile(new URL(workflow ? 'evidence/LIVE-WORKFLOW-2026-10-12.json' : quality
          ? 'evidence/LIVE-QUALITY-2026-10-12.json' : 'evidence/LIVE-VERIFICATION-2026-10-12.json', ROOT));
        const recording = JSON.parse(recordingBytes.toString('utf8'));
        if (valid_report.findings.length || report.findings.length !== (workflow ? 2 : 1) || report.findings[0].code !== (workflow || quality ? 'JOINT_INDEX_RANGE' : 'ANIMATION_TIME_ORDER')
          || workflow && report.findings[1].code !== 'ANIMATION_OUTPUT_COUNT'
          || recording.http_status !== 200 || recording.response_model !== NEBIUS_MODEL
          || digest(validateInspection(recording.inspection)) !== digest(report)) throw bad('RECORDED_EVIDENCE_MISMATCH');
        const advice = validateAdvice(report, recording.ai_suggestions);
        const metadata = { mode: 'recorded', provider: 'nebius', model: NEBIUS_MODEL, response_model: recording.response_model,
          requested_at: recording.requested_at, replayed_at: new Date().toISOString(),
          recording_evidence_sha256: createHash('sha256').update(recordingBytes).digest('hex') };
        const report_id = randomUUID(), report_sha256 = digest(report), advice_sha256 = digest(advice);
        let official = {};
        if (workflow) {
          if (inspecting) throw bad('INSPECTION_BUSY', 429);
          inspecting = true;
          try { const official_validation = await inspectConformance(buildWorkflowFixture({ flawed: true }), conformanceOptions); official = { official_validation, official_sha256: digest(official_validation) }; }
          finally { inspecting = false; }
        }
        if (reports.size >= 8) reports.delete(reports.keys().next().value);
        reports.set(report_id, { report, report_sha256, created: Date.now(), advice, metadata, advice_sha256, workflow, ...official });
        send(200, { report_id, report_sha256, report, valid_report, advice, metadata, advice_sha256, ...official,
          ...(workflow ? { visual: workflowVisual(), sample_description: 'Owned 24-bone procedural sample with two controlled export faults.',
            measured_explanation: 'Index 24 is outside valid slots 0–23. A LINEAR translation track declares 22 vector samples for 23 timestamps.',
            review_note: 'This recorded model response accurately explains both observations and proposes source/export review. Causes and repair values remain unverified. Review decisions start unset.' }
            : quality ? { sample_description: 'Flawed sample: bone index 7 with only two skin joints.',
            measured_explanation: 'Valid joint indices are 0 and 1. The measured value 7 is outside this skin joint list.',
            review_note: 'The agent checked this explanation against the measured index and joint count. This limited check is not proof of other asset properties; choose your own review decision.' }
            : { expected_times: [0, 0], sample_description: 'Flawed sample: duplicate animation times [0, 0].',
              measured_explanation: 'Zero is a valid timestamp. The error is the repeated zero: animation times must strictly increase.',
              review_note: 'The recorded model wording implies zero itself is invalid. Treat that wording as inaccurate; review the suggestion before accepting it.' }),
          new_provider_requests: 0 });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/workflow-recheck') {
        const body = await json(req);
        if (!exactKeys(body, ['report_id', 'report_sha256', 'reviewed']) || body.reviewed !== true) throw bad('PREPARED_EXPORT_REVIEW_REQUIRED');
        const record = reports.get(body.report_id);
        if (!record) throw bad('REPORT_EXPIRED', 404);
        if (!record.workflow || body.report_sha256 !== record.report_sha256) throw bad('REVIEW_EVIDENCE_MISMATCH');
        if (inspecting) throw bad('INSPECTION_BUSY', 429);
        inspecting = true;
        try {
          // Inspect a separate known authored fixture, never alter the original or
          // infer a replacement value from AI. The broken record stays untouched.
          const input = buildWorkflowFixture();
          const report = validateInspection(inspectGlb(input));
          const official_validation = await inspectConformance(input, conformanceOptions);
          send(200, { type: 'prepared-export-comparison', original_asset_sha256: record.report.asset_sha256,
            original_report_sha256: record.report_sha256, report, report_sha256: digest(report),
            official_validation, official_sha256: digest(official_validation), visual: workflowVisual({ flawed: false }),
            changes: [{ location: 'JOINTS_0 vertex 0 / component 0', before: 24, after: 0 },
              { location: '/accessors/7/count', before: 22, after: 23 }],
            provenance: 'Separately prepared owned export. Values come from the procedural authoring source, not AI. All 23 vector samples already existed in the binary data.',
            reviewed: true, original_changed: false, automatic_repair: false, new_provider_requests: 0 });
        } finally { inspecting = false; }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/inspect') {
        if (req.headers['content-type'] !== 'application/octet-stream') throw bad('BINARY_GLB_REQUIRED', 415);
        if (req.headers['x-asset-rights'] !== 'owned-or-licensed') throw bad('ASSET_RIGHTS_CONFIRMATION_REQUIRED');
        if (inspecting) throw bad('INSPECTION_BUSY', 429);
        inspecting = true;
        let report, official_validation;
        try {
          const input = await bytes(req, MAX_ASSET);
          report = validateInspection(inspectGlb(input));
          official_validation = await inspectConformance(input, conformanceOptions);
        } finally { inspecting = false; }
        const report_id = randomUUID();
        if (reports.size >= 8) reports.delete(reports.keys().next().value);
        const report_sha256 = digest(report);
        const official_sha256 = digest(official_validation);
        reports.set(report_id, { report, report_sha256, official_validation, official_sha256, created: Date.now(), advice: null });
        send(200, { report_id, report_sha256, report, official_validation, official_sha256 });
        return;
      }
      if (req.method === 'POST' && ['/api/export-inspection', '/api/export-handoff'].includes(url.pathname)) {
        const body = await json(req);
        if (!exactKeys(body, ['report_id', 'report_sha256', 'official_sha256'])) throw bad('INVALID_REQUEST');
        const record = reports.get(body.report_id);
        if (!record) throw bad('REPORT_EXPIRED', 404);
        if (!record.official_validation || body.report_sha256 !== record.report_sha256 || body.official_sha256 !== record.official_sha256) throw bad('REVIEW_EVIDENCE_MISMATCH');
        const measured = validateMeasuredExport({ schema_version: 1, type: 'measured-inspection', asset_sha256: record.report.asset_sha256,
          report_sha256: record.report_sha256, inspection: record.report,
          official_sha256: record.official_sha256, official_validation: record.official_validation,
          human_review: 'not recorded', repair_approved: false,
          limitation: 'Measured evidence only. No AI advice or visual, physics or engine certification. Original asset unchanged.' });
        send(200, url.pathname === '/api/export-handoff' ? createArtistHandoff(measured) : measured);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/recommend') {
        const body = await json(req);
        if (!exactKeys(body, ['report_id', 'approve_external_send']) || typeof body.report_id !== 'string') throw bad('INVALID_REQUEST');
        const record = reports.get(body.report_id);
        if (!record) throw bad('REPORT_EXPIRED', 404);
        if (mode === 'offline') throw bad('LIVE_ACTIVATION_NOT_APPROVED', 409);
        if (body.approve_external_send !== true) throw bad('MODEL_REQUEST_REVIEW_REQUIRED');
        if (record.advice) throw bad('ADVICE_ALREADY_REQUESTED', 409);
        if (busy) throw bad('MODEL_REQUEST_BUSY', 429);
        busy = true;
        const abort = new AbortController();
        res.on('close', () => { if (!res.writableEnded) abort.abort(); });
        try {
          const result = mode === 'mock'
            ? { advice: createMockAdvice(record.report), metadata: { mode: 'mock', provider: 'mock', model: 'none', requested_at: new Date().toISOString() } }
            : await requestRecommendations(record.report, { apiKey, fetchImpl, timeoutMs, signal: abort.signal });
          record.advice = result.advice;
          record.metadata = result.metadata;
          record.advice_sha256 = digest(result.advice);
          send(200, { ...result, advice_sha256: record.advice_sha256 });
        } finally { busy = false; }
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/review') {
        const body = await json(req);
        if (!exactKeys(body, ['report_id', 'report_sha256', 'advice_sha256', 'decisions', 'reviewed'])
          || !Array.isArray(body.decisions) || body.decisions.length > 64 || body.reviewed !== true) throw bad('HUMAN_REVIEW_REQUIRED');
        const record = reports.get(body.report_id);
        if (!record?.advice || body.report_sha256 !== record.report_sha256 || body.advice_sha256 !== record.advice_sha256) throw bad('REVIEW_EVIDENCE_MISMATCH');
        const expected = new Set(record.advice.recommendations.map((item) => item.id));
        if (body.decisions.length !== expected.size) throw bad('INCOMPLETE_REVIEW');
        for (const item of body.decisions) {
          if (!exactKeys(item, ['recommendation_id', 'decision']) || !expected.delete(item.recommendation_id)
            || !['accept', 'defer', 'reject'].includes(item.decision)) throw bad('INVALID_REVIEW_DECISION');
        }
        send(200, validateReview({ schema_version: 1, asset_sha256: record.report.asset_sha256,
          report_sha256: record.report_sha256, advice_sha256: record.advice_sha256,
          inspection: record.report, ai_suggestions: record.advice, provider: record.metadata,
          human_review: { reviewed_at: new Date().toISOString(), decisions: body.decisions, repair_approved: false },
          limitation: 'Review records suggestions only. No original asset was changed. No mesh, physics or game-readiness certification.' }));
        return;
      }
      throw bad('NOT_FOUND', 404);
    } catch (error) {
      const kinds = new Set(['auth', 'rate_limit', 'provider', 'timeout', 'malformed', 'schema', 'unsupported', 'no_credentials', 'cancelled']);
      const kind = kinds.has(error.kind) ? error.kind : undefined;
      const code = /^[A-Z0-9_]{1,80}$/.test(error.code || '') ? error.code : 'REQUEST_FAILED';
      send(error.status || (kind ? 502 : 400), { error: { code, ...(kind ? { kind } : {}), message: 'Request did not complete. Measured findings remain available; no repair was applied.' } });
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.RIG_QA_PORT || 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('RIG_QA_PORT must be 1024–65535.');
  const server = createQaServer({ mock: process.argv.includes('--mock'), apiKey: process.env.NEBIUS_API_KEY || '', liveAllowed: process.env.NEBIUS_LIVE_ALLOWED === '1' });
  server.listen(port, '127.0.0.1', () => console.log(`Rig QA Desk: http://127.0.0.1:${port} (${process.argv.includes('--mock') ? 'MOCK: no model calls' : 'live calls require explicit activation and review'})`));
}
