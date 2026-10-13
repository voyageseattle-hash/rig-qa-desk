import { validateMeasuredExport } from './measured-export.mjs';

// Imported text is data. Keep every value on one Markdown line, disable HTML,
// links, images and formatting, and expose controls rather than interpreting them.
function literal(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    char => ` [U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}] `)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#!|~]/g, '\\$&');
}
const rank = { error: 0, warning: 1, info: 2, hint: 3 };
const ordered = items => [...items].sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));

function investigation(finding) {
  const e = finding.evidence;
  if (finding.code === 'JOINT_INDEX_RANGE') {
    const measured = Number.isInteger(e.joint_count) && e.joint_count > 0 && Number.isFinite(e.value)
      ? `Observed joint index ${e.value}; this skin has ${e.joint_count} joints, so valid slots are 0 through ${e.joint_count - 1}. ` : '';
    return measured + 'Review this mesh instance’s skin mapping and the indicated vertex/component in the authoring source. Determine the intended joint from the source rig; do not guess a replacement from this report. Re-export a separate copy, then inspect it again. Cause and visual impact are unknown.';
  }
  if (finding.code === 'ANIMATION_OUTPUT_COUNT') {
    const measured = Number.isInteger(e.actual) && Number.isInteger(e.expected)
      ? `Observed ${e.actual} declared vector samples; ${e.expected} are required for this track’s timestamps and interpolation. ` : '';
    return measured + 'Review the indicated animation channel, target, input/output accessors and interpolation in the authoring/export pipeline. Compare the declared count with the actual source samples. This mismatch alone does not prove samples were physically deleted. Do not insert, duplicate or discard values automatically. Re-export a separate copy and inspect it again; cause and intended values are unknown.';
  }
  return 'Investigate the cited data location in the authoring source or exporter. This finding does not determine the cause, intended replacement or visual impact. Review any proposed correction, export a separate copy and rerun inspection.';
}

export function createArtistHandoff(measured) {
  validateMeasuredExport(measured);
  const report = measured.inspection, official = measured.official_validation;
  const issues = ordered(report.findings.filter(item => item.code !== 'UNSUPPORTED_FEATURE'));
  const notices = report.findings.filter(item => item.code === 'UNSUPPORTED_FEATURE');
  const lines = ['# Rig QA Desk — artist investigation handoff', '',
    'Inspection-only handoff. Human review: **not recorded**. Repair approved: **false**.',
    'No AI suggestions are included. No provider request or asset modification was made by this export.', '',
    '## Asset and evidence identity', '',
    `- Asset SHA256: ${measured.asset_sha256}`,
    `- Companion report SHA256: ${measured.report_sha256}`,
    `- Official validation SHA256: ${measured.official_sha256}`,
    `- File size: ${report.byte_length} bytes. Nodes: ${report.summary.nodes}; skins: ${report.summary.skins}; animations: ${report.summary.animations}.`, '',
    'Use these hashes to match this handoff to the inspected bytes and measured JSON export. Asset filenames and private profile data are intentionally absent.', '',
    '## Companion measured findings — investigate errors first', ''];
  if (!issues.length) lines.push('No structural issues were found within the companion’s supported checks. This is not a quality or completeness certificate.', '');
  for (const item of issues) lines.push(`### ${literal(item.id)} · ${literal(item.severity)} · ${literal(item.code)}`, '',
    `Measured observation: ${literal(item.message)}`, '', `Data location: ${literal(item.location)}`, '',
    `Measured evidence: ${literal(JSON.stringify(item.evidence))}`, '',
    `Next source investigation (deterministic guidance, not AI): ${literal(investigation(item))}`, '');
  lines.push('## Coverage notices — not detected rig defects', '');
  if (!notices.length) lines.push('No companion coverage notices were emitted.', '');
  for (const item of notices) lines.push(`- ${literal(item.id)} · ${literal(item.location)} · ${literal(item.message)}`);
  lines.push('', 'Supported checks:', ...report.coverage.checked.map(item => `- ${literal(item)}`), '',
    'Not checked:', ...report.coverage.not_checked.map(item => `- ${literal(item)}`), '',
    '## Official glTF conformance — separate measured source', '', `Status: ${literal(official.status)}. Scope: ${literal(official.scope)}.`, '');
  if (official.status !== 'complete') lines.push('Official validation did not complete. No official conformance pass is claimed.', '');
  else {
    const c = official.counts;
    lines.push(`Validator: ${literal(official.validator_version)}. Errors: ${c.errors}; warnings: ${c.warnings}; notices: ${c.infos}; hints: ${c.hints}. External resources: blocked.`, '',
      official.truncated ? 'The issue list is truncated; additional issues may exist.' : 'The returned issue list is not truncated.', '');
    for (const item of ordered(official.messages)) {
      lines.push(`- ${literal(item.id)} · ${literal(item.severity)} · ${literal(item.code)} · data location: ${literal(item.location)}`);
      if (item.context) lines.push(`  Measured context: ${literal(JSON.stringify(item.context))}`);
      if (item.code === 'NODE_SKINNED_MESH_NON_ROOT') lines.push('  Next investigation: verify import size, placement and joint motion in the target engine. A parent hierarchy warning does not prove the rig is broken; do not automatically reparent or apply scale.');
    }
    if (!official.messages.length) lines.push('No official conformance diagnostics were returned within this scope.');
    if (official.extensions.length) lines.push('', 'Declared extensions:', ...official.extensions.map(item => `- ${literal(item.name)} · ${item.supported ? 'supported' : 'unsupported'} by this validator`));
    lines.push('');
  }
  lines.push('## Human handoff and recheck', '',
    '1. Confirm the asset and evidence hashes, and open the cited source data.',
    '2. Record the suspected cause and proposed source correction for human review. This export records no review decision.',
    '3. After approval, make any correction in the authoring workflow and export a separate file; preserve the original.',
    '4. Inspect the new export and compare findings and hashes. Review the animation visually in the intended engine.', '',
    'Measured metadata cannot prove anatomy, deformation quality, collision safety, physical correctness or game readiness. Unknown or unavailable checks are not passes.', '');
  return { schema_version: 1, type: 'artist-handoff', asset_sha256: measured.asset_sha256,
    report_sha256: measured.report_sha256, official_sha256: measured.official_sha256,
    human_review: 'not recorded', repair_approved: false, new_provider_requests: 0,
    filename: `rig-qa-artist-handoff-${measured.asset_sha256.slice(0, 12)}.md`, markdown: lines.join('\n') };
}
