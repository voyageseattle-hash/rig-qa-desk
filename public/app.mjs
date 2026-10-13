import { renderWorkflowVisual } from './workflow-visual.mjs';
const $ = (id) => document.getElementById(id);
let config = { mode: 'offline' }, selected = null, inspection = null, advice = null;
let working = false, selectionEpoch = 0;
let comparison = null;
const decisions = new Map();
const errors = { ASSET_RIGHTS_CONFIRMATION_REQUIRED: 'Confirm that you own the asset or have permission to inspect it.', REPORT_EXPIRED: 'This report expired. Inspect the asset again.', LIVE_ACTIVATION_NOT_APPROVED: 'Live inference is not enabled. Deterministic checks remain available.', REQUEST_TOO_LARGE: 'The file or request exceeds the supported size limit.', MODEL_REQUEST_BUSY: 'A model request is already running. No additional request was sent.' };
const text = (tag, value, className) => { const item = document.createElement(tag); item.textContent = value; if (className) item.className = className; return item; };
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
async function api(path, body, binary = false) {
  const headers = { 'Content-Type': binary ? 'application/octet-stream' : 'application/json', 'X-Rig-QA-Request': '1' };
  if (binary) headers['X-Asset-Rights'] = 'owned-or-licensed';
  const response = await fetch(path, { method: 'POST', headers, body: binary ? body : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(errors[data.error?.code] || `${data.error?.code || 'Request failed'}: ${data.error?.message || 'The request did not complete.'}`);
  return data;
}
function refresh() {
  $('prepared-reviewed').disabled = working || !inspection?.visual;
  $('prepared-recheck').disabled = working || !inspection?.visual || !$('prepared-reviewed').checked;
  $('export-comparison').disabled = working || !comparison;
  $('export-inspection').disabled = working || !inspection?.official_validation;
  $('export-handoff').disabled = working || !inspection?.official_validation;
  for (const id of ['asset', 'valid-fixture', 'flawed-fixture', 'rights', 'guided-test', 'quality-test', 'workflow-test']) $(id).disabled = working;
  $('inspect').disabled = working || !selected || !$('rights').checked;
  $('send-approval').disabled = working || !inspection || config.mode === 'offline' || !!advice;
  $('recommend').disabled = working || !inspection || config.mode === 'offline' || !$('send-approval').checked || !!advice;
  $('human-reviewed').disabled = working || !advice;
  for (const select of $('recommendations').querySelectorAll('select')) select.disabled = working;
  $('export').disabled = working || !advice || !$('human-reviewed').checked || decisions.size !== advice.advice.recommendations.length;
}
function resetReport() {
  inspection = null; advice = null; decisions.clear();
  comparison = null; $('workflow-visual').hidden = true; $('corrected-result').hidden = true; $('prepared-reviewed').checked = false;
  $('fault-visual').replaceChildren(); $('corrected-visual').replaceChildren();
  $('guided-result').hidden = true;
  $('inspection').hidden = true; $('advice').hidden = true; $('empty').hidden = false;
  $('official').hidden = true;
  $('inspection-export-note').textContent = 'Save evidence without an AI request. This does not record human review or authorize repairs.';
  $('handoff-export-note').textContent = 'A readable Markdown handoff with measured locations and source investigation steps. No AI advice or repair approval.';
  $('send-approval').checked = false; $('human-reviewed').checked = false;
  $('result-status').textContent = 'Awaiting checks'; $('model-label').textContent = 'Not requested';
  $('request-status').textContent = 'No provider request sent';
  $('export-note').textContent = 'Report exports bind review decisions to the asset, inspection and advice hashes.';
  renderMode();
  refresh();
}
function renderInspection(result) {
  inspection = result;
  if (result.visual && result.visual.asset_sha256 === result.report.asset_sha256) {
    renderWorkflowVisual($('fault-visual'), result.visual);
    $('workflow-visual').hidden = false;
  }
  $('empty').hidden = true; $('inspection').hidden = false;
  const report = inspection.report;
  $('asset-hash').textContent = report.asset_sha256;
  const metrics = $('metrics'); metrics.replaceChildren();
  for (const [label, count] of [...Object.entries(report.summary), ['structural issues', report.findings.filter(f => f.code !== 'UNSUPPORTED_FEATURE').length], ['coverage notices', report.findings.filter(f => f.code === 'UNSUPPORTED_FEATURE').length]]) {
    const metric = text('div', '', 'metric'); metric.append(text('strong', count), text('span', label)); metrics.append(metric);
  }
  $('coverage').textContent = 'Results apply only to the listed supported checks. Unsupported or unavailable checks are not passes.';
  $('coverage-json').textContent = JSON.stringify(report.coverage, null, 2);
  $('report-json').textContent = JSON.stringify(report, null, 2);
  const issues = report.findings.filter(f => f.code !== 'UNSUPPORTED_FEATURE');
  $('result-status').textContent = issues.length ? `${issues.length} structural issue(s)` : 'No issues in companion checks';
  renderOfficial(result.official_validation);
  const findings = $('findings'); findings.replaceChildren();
  const notices = report.findings.filter(f => f.code === 'UNSUPPORTED_FEATURE');
  if (notices.length) {
    const card = text('article', '', 'finding');
    card.append(text('h3', 'Companion coverage notices'), text('p', 'These describe checks the companion does not perform; they are not detected rig defects. The official check has its own scope and results above.'));
    for (const f of notices) { const line = text('p', `${f.id} · ${f.location}`); line.id = f.id; card.append(line); }
    findings.append(card);
  }
  for (const finding of issues) {
    const card = text('article', '', `finding ${finding.severity}`); card.id = finding.id;
    card.append(text('span', `${finding.id} · ${finding.severity}`, 'severity'), text('h3', finding.code), text('p', finding.message), text('p', finding.location, 'location'));
    const details = document.createElement('details'); details.append(text('summary', 'Measured evidence'), text('pre', JSON.stringify(finding.evidence, null, 2))); card.append(details); findings.append(card);
  }

}
// This explicit action inspects a separate authored fixture; it is not a repair.
$('prepared-reviewed').addEventListener('change', refresh);
$('prepared-recheck').addEventListener('click', async () => {
  if (working || !inspection?.visual || !$('prepared-reviewed').checked) return;
  const captured = inspection; error(''); working = true; refresh();
  try {
    const result = await api('/api/workflow-recheck', { report_id: captured.report_id, report_sha256: captured.report_sha256, reviewed: true });
    if (inspection?.report_id !== captured.report_id) return;
    if (result.original_asset_sha256 !== captured.report.asset_sha256 || result.visual.asset_sha256 !== result.report.asset_sha256) throw new Error('Comparison evidence does not match these assets.');
    renderWorkflowVisual($('corrected-visual'), result.visual, true);
    comparison = { ...result, original_inspection: captured.report, original_official_validation: captured.official_validation };
    const official = result.official_validation;
    $('comparison-status').textContent = `Companion issues: ${captured.report.findings.length} → ${result.report.findings.length}. ` + (official.status === 'complete' && captured.official_validation.status === 'complete' ? `Official errors: ${captured.official_validation.counts.errors} → ${official.counts.errors}.` : `Official check: ${official.status}; no conformance pass is claimed.`) + ' Original broken example unchanged. No AI request or automatic repair.';
    $('comparison-hashes').textContent = `Broken SHA256: ${result.original_asset_sha256}\nPrepared corrected SHA256: ${result.report.asset_sha256}`;
    $('comparison-provenance').textContent = result.provenance + ' Zero findings apply only to these measured checks; visual quality still needs review.';
    $('comparison-json').textContent = JSON.stringify(comparison, null, 2); $('corrected-result').hidden = false;
  } catch (cause) { error(cause.message); }
  finally { working = false; refresh(); }
});
$('export-comparison').addEventListener('click', () => {
  if (!working && comparison) downloadJson(comparison, `rig-qa-comparison-${comparison.original_asset_sha256.slice(0, 12)}.json`);
});
function renderOfficial(value) {
  $('official').hidden = !value;
  if (!value) return;
  $('official-json').textContent = JSON.stringify(value, null, 2);
  const cards = $('official-findings'); cards.replaceChildren();
  if (value.status !== 'complete') {
    $('official-status').textContent = value.status === 'timeout' ? 'Official validation timed out. Companion checks remain available; this is not a pass.' : 'Official validation unavailable. Companion checks remain available; this is not a pass.';
    return;
  }
  $('official-status').textContent = `Khronos ${value.validator_version}: ${value.counts.errors} error(s), ${value.counts.warnings} warning(s), ${value.counts.infos} notice(s), ${value.counts.hints} hint(s).${value.truncated ? ' Issue list truncated; additional issues may exist.' : ''} External resources are blocked. This checks file conformance, not visual quality.`;
  for (const issue of value.messages) {
    const card = text('article', '', `finding ${issue.severity}`); card.id = issue.id;
    card.append(text('span', `${issue.id} · ${issue.severity} · official measured finding`, 'severity'));
    if (issue.code === 'NODE_SKINNED_MESH_NON_ROOT' && issue.context) {
      const c = issue.context;
      card.append(text('h3', 'Check the character’s import size and placement'),
        text('p', `Skinned mesh node ${c.node} sits under parent node(s) ${c.parents.join(', ')}. Parent scale (rounded for display): ${c.parent_scales.map(s => s ? s.map(n => Number(n.toPrecision(6))).join(' × ') : 'matrix transform; scale not decomposed').join('; ')}. Skin ${c.skin} has ${c.joint_count} joints. ${c.animated_nodes.length ? 'Mesh or parent animation channels are present.' : 'No animation channels target this mesh or its immediate parent.'}`),
        text('p', 'Next: play the animation in your target engine and verify size, position and joint motion. This hierarchy warning does not prove the rig is broken. Do not automatically reparent the mesh or apply scale.'));
    } else {
      card.append(text('h3', issue.code.replaceAll('_', ' ')), text('p', 'Review the referenced data in your 3D editor. This measured conformance issue does not authorize a repair.'));
    }
    card.append(text('p', `${issue.code} · ${issue.location}`, 'location'));
    if (issue.context) { const details = document.createElement('details'); details.append(text('summary', 'Parent transform evidence'), text('pre', JSON.stringify(issue.context, null, 2))); card.append(details); }
    cards.append(card);
  }
  if (value.extensions.length) cards.append(text('p', 'Declared extensions: ' + value.extensions.map(e => `${e.name} (${e.supported ? 'supported by official validator' : 'unsupported by official validator'})`).join(', ') + '. Extension validation does not certify rendered material appearance.'));
}
function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-inspection').addEventListener('click', async () => {
  if (working || !inspection?.official_validation) return;
  const captured = inspection; error(''); working = true; refresh();
  try {
    const result = await api('/api/export-inspection', { report_id: captured.report_id, report_sha256: captured.report_sha256, official_sha256: captured.official_sha256 });
    if (inspection?.report_id !== captured.report_id) return;
    downloadJson(result, `rig-qa-measured-${captured.report.asset_sha256.slice(0, 12)}.json`);
    $('inspection-export-note').textContent = 'Measured evidence exported. Human review has not been recorded; original asset unchanged.';
  } catch (cause) { error(cause.message); }
  finally { working = false; refresh(); }
});
$('export-handoff').addEventListener('click', async () => {
  if (working || !inspection?.official_validation) return;
  const captured = inspection; error(''); working = true; refresh();
  try {
    const result = await api('/api/export-handoff', { report_id: captured.report_id, report_sha256: captured.report_sha256, official_sha256: captured.official_sha256 });
    if (inspection?.report_id !== captured.report_id) return;
    const url = URL.createObjectURL(new Blob([result.markdown], { type: 'text/markdown; charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('handoff-export-note').textContent = 'Artist handoff exported: measured findings, coverage and source investigation steps. Human review is not recorded; original asset unchanged. No new model request.';
  } catch (cause) { error(cause.message); }
  finally { working = false; refresh(); }
});
function renderAdvice(result) {
  advice = result;
  if (advice.metadata.mode === 'recorded') {
    $('mode-banner').textContent = 'RECORDED NVIDIA REVIEW · Fresh local checks with a saved real model response. This guided test makes no new provider request.';
    $('mode-banner').classList.remove('live');
  }
  $('advice').hidden = false;
  $('model-label').textContent = advice.metadata.mode === 'mock' ? 'MOCK · no model call' : advice.metadata.mode === 'recorded' ? 'RECORDED · NVIDIA' : 'Nebius · NVIDIA';
  $('request-status').textContent = advice.metadata.mode === 'mock' ? 'Mock response used; no provider request sent' : advice.metadata.mode === 'recorded' ? 'Recorded real NVIDIA response · no new provider request' : `Runtime call: ${advice.metadata.model}`;
  $('advice-summary').textContent = advice.advice.summary;
  $('advice-json').textContent = JSON.stringify(advice.advice, null, 2);
  $('limitations').replaceChildren(...advice.advice.limitations.map((item) => text('li', item)));
  const recommendations = $('recommendations'); recommendations.replaceChildren();
  for (const item of advice.advice.recommendations) {
    const card = text('article', '', 'recommendation');
    card.append(text('span', `${item.id} · ${item.priority} priority · AI suggestion`, 'priority'), text('h3', item.action.replaceAll('_', ' ')), text('p', item.rationale));
    const links = text('div', '', 'evidence-links');
    for (const id of item.finding_ids) { const link = text('a', id); link.href = `#${id}`; links.append(link); }
    card.append(links, text('p', `Uncertainty: ${item.uncertainty}`));
    const label = text('label', 'Your decision: '); const select = document.createElement('select'); select.setAttribute('aria-label', `Review ${item.id}`);
    for (const [value, description] of [['', 'Review required'], ['accept', 'Accept suggestion'], ['defer', 'Defer for investigation'], ['reject', 'Reject suggestion']]) { const option = text('option', description); option.value = value; select.append(option); }
    select.addEventListener('change', () => { if (select.value) decisions.set(item.id, select.value); else decisions.delete(item.id); $('human-reviewed').checked = false; refresh(); });
    label.append(select); card.append(label); recommendations.append(card);
  }

}
async function fixture(name) {
  const epoch = ++selectionEpoch;
  selected = null; $('rights').checked = false;
  $('asset-name').textContent = 'Loading owned fixture…'; resetReport();
  error('');
  try {
    const response = await fetch(`/api/fixtures/${name}.glb`);
    if (!response.ok) throw new Error('Fixture could not be loaded.');
    const loaded = await response.arrayBuffer();
    if (epoch !== selectionEpoch) return;
    selected = loaded;
    $('asset').value = ''; $('asset-name').textContent = `${name}.glb · owned procedural fixture`;
    $('rights').checked = true;
    resetReport();
  } catch (cause) { error(cause.message); }
}
$('valid-fixture').addEventListener('click', () => fixture('valid'));
$('flawed-fixture').addEventListener('click', () => fixture('flawed'));
$('asset').addEventListener('change', async () => {
  const epoch = ++selectionEpoch;
  error(''); selected = null; $('rights').checked = false; resetReport();
  const file = $('asset').files[0];
  $('asset-name').textContent = file?.name || 'No asset selected';
  if (!file) return;
  if (file.size > 32 * 1024 * 1024) { error('GLB files must be at most 32 MiB.'); return; }
  const loaded = await file.arrayBuffer();
  if (epoch !== selectionEpoch) return;
  selected = loaded; refresh();
});
for (const id of ['rights', 'send-approval', 'human-reviewed']) $(id).addEventListener('change', refresh);
$('inspect').addEventListener('click', async () => {
  const epoch = selectionEpoch;
  error(''); resetReport(); working = true; refresh();
  try {
    const result = await api('/api/inspect', selected, true);
    if (epoch !== selectionEpoch) { working = false; refresh(); return; }
    renderInspection(result);
  } catch (cause) { inspection = null; error(cause.message); }
  working = false; refresh();
});
$('recommend').addEventListener('click', async () => {
  const requestedId = inspection.report_id;
  error(''); working = true; refresh(); $('recommend').textContent = 'Preparing review advice…';
  try {
    const result = await api('/api/recommend', { report_id: requestedId, approve_external_send: true });
    if (inspection?.report_id !== requestedId) { working = false; refresh(); return; }
    renderAdvice(result);
  } catch (cause) { error(cause.message); }
  working = false; $('recommend').textContent = config.mode === 'mock' ? 'Generate mock advice' : 'Ask Nemotron on Nebius'; refresh();
});
async function runRecordedTest(endpoint) {
  const epoch = ++selectionEpoch;
  error(''); selected = null; $('asset').value = ''; $('rights').checked = false;
  resetReport(); working = true; refresh();
  try {
    const result = await api(endpoint, {});
    if (epoch !== selectionEpoch) return;
    renderInspection(result); renderAdvice(result);
    $('asset-name').textContent = 'Owned guided-test fixture · fresh local checks';
    $('guided-valid').textContent = 'Valid sample: ' + result.valid_report.findings.length + ' findings in checked scope.';
    $('guided-flawed').textContent = result.sample_description + ' ' + result.measured_explanation;
    $('guided-note').textContent = 'Recorded response from ' + result.metadata.requested_at.slice(0, 10) + '; no new provider request. Review note: ' + result.review_note;
    $('guided-result').hidden = false;
  } catch (cause) { resetReport(); error(cause.message); }
  finally { working = false; refresh(); }
}
$('guided-test').addEventListener('click', () => runRecordedTest('/api/guided-test'));
$('quality-test').addEventListener('click', () => runRecordedTest('/api/quality-test'));
$('workflow-test').addEventListener('click', () => runRecordedTest('/api/workflow-test'));
$('export').addEventListener('click', async () => {
  if (working || !inspection || !advice) return;
  const capturedInspection = inspection, capturedAdvice = advice;
  const capturedDecisions = [...decisions].map(([recommendation_id, decision]) => ({ recommendation_id, decision }));
  error(''); working = true; refresh();
  try {
    const review = await api('/api/review', { report_id: capturedInspection.report_id, report_sha256: capturedInspection.report_sha256, advice_sha256: capturedAdvice.advice_sha256, decisions: capturedDecisions, reviewed: true });
    if (inspection?.report_id !== capturedInspection.report_id || advice?.advice_sha256 !== capturedAdvice.advice_sha256) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `rig-qa-review-${capturedInspection.report.asset_sha256.slice(0, 12)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('export-note').textContent = 'Reviewed report exported. The original asset was not changed.';
  } catch (cause) { error(cause.message); }
  finally { working = false; refresh(); }
});
function renderMode() {
  const mock = config.mode === 'mock', live = config.mode === 'live';
  $('mode-banner').textContent = mock ? 'MOCK REHEARSAL · Newly requested suggestions are simulated. The guided test separately replays a labeled real NVIDIA response.' : live ? 'LIVE MODE · Explicit model requests may be billed. Review what is sent before each request.' : 'OFFLINE INSPECTION · Guided testing uses a recorded NVIDIA response. No new provider request is made.';
  $('mode-banner').classList.toggle('live', live);
}
try {
  config = await (await fetch('/api/status')).json();
  const mock = config.mode === 'mock', live = config.mode === 'live';
  renderMode();
  $('provider-note').textContent = `${config.model}. Only structured findings leave this machine; the original GLB stays local. Live token limits do not guarantee a currency cap.`;
  $('send-label').textContent = mock ? 'I understand these suggestions use a labeled mock, not a real model.' : 'I approve sending these measured findings to Nebius. A live request may be billed.';
  $('recommend').textContent = mock ? 'Generate mock advice' : live ? 'Ask Nemotron on Nebius' : 'Live model activation pending';
} catch { error('The local server is unavailable.'); }
refresh();
