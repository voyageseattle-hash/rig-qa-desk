const ns = 'http://www.w3.org/2000/svg';
const el = (tag, content, cls) => { const n = document.createElement(tag); n.textContent = content; if (cls) n.className = cls; return n; };
const shape = (tag, attrs, content) => {
  const n = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, String(value));
  if (content !== undefined) n.textContent = content;
  return n;
};

export function renderWorkflowVisual(container, data, corrected = false) {
  container.replaceChildren();
  // Bounded fixed-fixture display, not a general GLB renderer or skinning engine.
  if (data?.kind !== 'owned-workflow-rest-data' || data.vertices?.length !== 48
    || !data.vertices.every(v => Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x) && Math.abs(x) <= 2))
    || data.joint_slots !== 24 || data.vertex !== 0 || data.component !== 0 || data.active_weight !== 1
    || data.joint_slot !== (corrected ? 0 : 24) || data.timestamps?.length !== 23
    || !data.timestamps.every(t => Number.isFinite(t) && t >= 0 && t <= 1)
    || data.declared_samples !== (corrected ? 23 : 22) || data.stored_vectors !== 23
    || data.interpolation !== 'LINEAR' || data.target_node !== 0 || data.channel !== 0 || data.target_path !== 'translation'
    || data.input_accessor !== 6 || data.output_accessor !== 7
    || !/^[a-f0-9]{64}$/.test(data.asset_sha256)) throw new Error('Owned visual evidence is unavailable.');
  const color = corrected ? '#73dfc5' : '#ffa39c';
  const grid = el('div', '', 'visual-grid');
  const bone = el('article', '', 'visual-card');
  bone.append(el('h3', corrected ? 'Bone reference restored to authored slot 0' : 'This surface point points to a bone that does not exist'));
  const svg = shape('svg', { viewBox: '0 0 560 320', role: 'img', 'aria-label': corrected ? 'Rest-position ribbon: vertex 0 references valid bone slot 0' : 'Rest-position ribbon: highlighted vertex 0 references nonexistent bone slot 24' });
  svg.append(shape('title', {}, 'Actual rest-position vertices from the owned GLB; no deformation simulation'));
  const x = p => 155 + p[0] * 850, y = p => 267 - p[1] * 237;
  const strip = [ ...data.vertices.filter((_, i) => i % 2 === 0), ...data.vertices.filter((_, i) => i % 2 === 1).reverse() ];
  svg.append(shape('polygon', { points: strip.map(v => `${x(v)},${y(v)}`).join(' '), fill: '#284d5a', stroke: '#81b4c6' }));
  data.vertices.forEach((v, i) => svg.append(shape('circle', { cx: x(v), cy: y(v), r: i === data.vertex ? 7 : 2.3, fill: i === data.vertex ? color : '#b6ccd9' })));
  for (let i = 0; i < 24; i++) {
    const cy = y(data.vertices[i * 2]);
    svg.append(shape('circle', { cx: 223, cy, r: 2.5, fill: '#73dfc5' }));
    if ([0, 6, 12, 18, 23].includes(i)) svg.append(shape('text', { x: 234, y: cy + 4, fill: '#a9cfc9', 'font-size': 12 }, `slot ${i}`));
  }
  svg.append(shape('text', { x: 28, y: 298, fill: '#dce7f0', 'font-size': 14 }, '48 vertices · valid bone slots 0–23'));
  const endX = corrected ? 223 : 422, endY = corrected ? 267 : 155;
  svg.append(shape('line', { x1: x(data.vertices[0]), y1: y(data.vertices[0]), x2: endX, y2: endY, stroke: color, 'stroke-width': 3, ...(corrected ? {} : { 'stroke-dasharray': '7 5' }) }));
  svg.append(shape('circle', { cx: endX, cy: endY, r: 10, fill: '#14202c', stroke: color, 'stroke-width': 2 }));
  svg.append(shape('text', { x: corrected ? 305 : 330, y: corrected ? 264 : 122, fill: color, 'font-size': 17 }, `reference: slot ${data.joint_slot}`));
  if (!corrected) svg.append(shape('text', { x: 330, y: 194, fill: color, 'font-size': 15 }, 'No such slot in this skin'));
  bone.append(svg, el('p', `Vertex 0 · influence 0 · weight 1 · measured slot ${data.joint_slot}. The dots show rest positions and skin slots; this is not simulated deformation.`, 'muted'));
  const animation = el('article', '', 'visual-card');
  animation.append(el('h3', corrected ? 'Every timestamp has a declared movement sample' : 'The movement track declares one sample too few'));
  const timeline = shape('svg', { viewBox: '0 0 560 225', role: 'img', 'aria-label': `Translation track: 23 timestamps and ${data.declared_samples} declared samples` });
  timeline.append(shape('title', {}, 'LINEAR translation channel 0, node 0, input accessor 6, output accessor 7'));
  for (const [row, label] of [[0, 'Time'], [1, 'Movement']]) {
    timeline.append(shape('text', { x: 12, y: 75 + row * 73, fill: '#c9dce6', 'font-size': 15 }, label));
    data.timestamps.forEach((t, i) => {
      const missing = row === 1 && i >= data.declared_samples;
      const rect = shape('rect', { x: 100 + i * 19, y: 52 + row * 73, width: 14, height: 31, rx: 3, fill: missing ? '#432a32' : '#315e68', stroke: missing ? '#ffa39c' : '#8ccec4', 'stroke-width': missing ? 2 : 1 });
      rect.append(shape('title', {}, `Slot ${i}: ${row === 0 ? `${t.toFixed(6)} seconds` : missing ? 'not declared' : 'declared vector sample'}`));
      timeline.append(rect);
      if (missing) timeline.append(shape('text', { x: 101 + i * 19, y: 147, fill: '#ffa39c', 'font-size': 16 }, '?'));
    });
  }
  timeline.append(shape('text', { x: 100, y: 103, fill: '#bad1df', 'font-size': 14 }, '23 timestamps · 0 to 0.917 seconds'));
  timeline.append(shape('text', { x: 100, y: 177, fill: color, 'font-size': 16 }, `${data.declared_samples} declared vector samples / 23 required`));
  animation.append(timeline, el('p', 'Node 0 · translation · LINEAR · input accessor 6 → output accessor 7. ' + (corrected ? 'All 23 samples are now declared by the prepared export.' : 'The final outline illustrates the count mismatch; it does not prove which intended sample is wrong.'), 'muted'), el('p', 'In this controlled example all 23 vectors remain in the binary data. The injected error is the declared count, not physically deleted animation bytes.', 'muted'));
  grid.append(bone, animation); container.append(grid);
}
