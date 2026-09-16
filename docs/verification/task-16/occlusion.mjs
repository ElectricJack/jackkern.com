import { readFileSync } from 'node:fs';
import { layout } from '../../../layout/layout.js';

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
const contract = JSON.parse(readFileSync('kit/contract.json', 'utf8'));
const plan = layout(manifest, contract);
const parts = new Map(contract.parts.map((p) => [p.id, p]));

/** World AABB of a placement, matching the stand-in shapes greybox.ts builds. */
function box(p) {
  const part = parts.get(p.part);
  const [fw, fd] = part.footprint;
  const h = Math.max(part.height, 0.1);
  const [x, y, z] = [p.transform[12], p.transform[13], p.transform[14]];
  let hx = fw / 2, hz = fd / 2, y0 = 0, y1 = h;
  if (p.part.startsWith('column')) { hx = hz = 0.45; }
  else if (p.part.startsWith('entablature')) { hz = 0.3; y1 = 0.6; }
  else if (p.part.startsWith('stair')) { y0 = -1; y1 = 0; }
  else if (part.category === 'floor') { y0 = -0.1; y1 = 0; }
  else if (part.category === 'water') {
    if (p.part.startsWith('pool')) { y1 = 0.3; } else { hx = hz = 0.8; }
  } else if (part.category === 'structure') { hz = 0.15; }
  else { hx = fw * 0.35; hz = fd * 0.35; }
  // The y-rotation in the transform can swap x and z extents; take the larger box.
  const h2 = Math.max(hx, hz);
  return { min: [x - h2, y + y0, z - h2], max: [x + h2, y + y1, z + h2] };
}

/** Slab test over t in (0,1] along origin -> end. */
function hits(origin, end, b) {
  const d = end.map((v, i) => v - origin[i]);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (origin[i] < b.min[i] || origin[i] > b.max[i]) return null; continue; }
    let a = (b.min[i] - origin[i]) / d[i], c = (b.max[i] - origin[i]) / d[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0 > 1e-4 && t0 < 1 ? t0 : null;
}

console.log('hotspot marker occlusion (ray from the viewpoint to the marker anchor):\n');
let blocked = 0;
for (const hot of plan.hotspots) {
  const vp = plan.rail.find((v) => v.id === hot.from);
  const occ = plan.placements
    .map((p) => ({ part: p.part, stop: p.stop, t: hits(vp.position, hot.anchor, box(p)) }))
    .filter((o) => o.t !== null)
    .sort((a, b) => a.t - b.t);
  const dist = Math.hypot(...hot.anchor.map((v, i) => v - vp.position[i]));
  if (occ.length) blocked++;
  console.log(`${hot.from.padEnd(22)} -> ${hot.to.padEnd(22)} ${hot.label.padEnd(10)} anchor ${dist.toFixed(1)}m away  ` +
    (occ.length ? `BLOCKED by ${occ[0].part} (${occ[0].stop}) at ${(occ[0].t * dist).toFixed(2)}m${occ.length > 1 ? ` +${occ.length - 1} more` : ''}` : 'clear'));
}
console.log(`\n${blocked}/${plan.hotspots.length} hotspot markers are behind scene geometry.\n`);

console.log('viewpoint clearance (nearest placement in front of each viewpoint, within 45 degrees of the look direction):\n');
for (const vp of plan.rail) {
  const fwd = vp.target.map((v, i) => v - vp.position[i]);
  const len = Math.hypot(...fwd);
  const f = fwd.map((v) => v / len);
  let best = null;
  for (const p of plan.placements) {
    const b = box(p);
    const c = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
    const to = c.map((v, i) => v - vp.position[i]);
    const d = Math.hypot(...to);
    if (d < 1e-6) continue;
    const cos = to.reduce((s, v, i) => s + (v / d) * f[i], 0);
    if (cos < Math.cos(Math.PI / 4)) continue;
    const height = b.max[1] - b.min[1];
    if (height < 0.5) continue;                       // floors and pool lips do not block a view
    if (!best || d < best.d) best = { part: p.part, d, height };
  }
  console.log(`${vp.id.padEnd(22)} nearest blocking part ahead: ${best ? `${best.part.padEnd(16)} ${best.d.toFixed(2)}m away, ${best.height.toFixed(1)}m tall` : 'none'}`);
}
