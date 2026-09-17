import type { Layout, Placement } from '../types';
import type { BufferGeometry } from 'three';

export const CORNICE_WIDTH = 1.16;

/** Broaden the supporting band without magnifying the cornice's overhang.
 * The centre stays continuous and horizontal faces remain flat. */
export function broadenCornice(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setZ(i, z * (.7 + .25 / Math.max(Math.abs(z), .2)));
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}

type Ends = { left: boolean; right: boolean };
/** Locate L/T/cross joints by their original module endpoints. Straight runs
 * keep their shared butt joints; only perpendicular members need a corner block. */
export function perpendicularJoints(placements: Placement[], parts: string[]) {
  const nodes = new Map<string, { position: number[]; stop: string; ends: { instance: string; side: number; axis: number }[] }>();
  for (const p of placements.filter(p => parts.includes(p.part))) for (const side of [-1, 1]) {
    const m = p.transform;
    const position = [m[12] + side * 1.5 * m[0], m[13], m[14] + side * 1.5 * m[2]];
    const key = position.map(v => v.toFixed(4)).join(',');
    if (!nodes.has(key)) nodes.set(key, { position, stop: p.stop, ends: [] });
    nodes.get(key)!.ends.push({ instance: p.instance, side, axis: Math.abs(m[0]) > .5 ? 0 : 2 });
  }
  const joints = [...nodes.values()].filter(n => new Set(n.ends.map(e => e.axis)).size > 1);
  const cuts = new Map<string, Ends>();
  for (const joint of joints) for (const end of joint.ends) {
    if (!cuts.has(end.instance)) cuts.set(end.instance, { left: false, right: false });
    cuts.get(end.instance)![end.side < 0 ? 'left' : 'right'] = true;
  }
  return { joints, cuts };
}

/** Native cornices end against solid junction stones instead of overlapping
 * each other. Original geometry remains shared and instanced. */
export function corniceJoinery(plan: Layout) {
  const { joints, cuts } = perpendicularJoints(plan.placements, ['entablature-3m']);
  const transforms = new Map<string, number[]>();
  for (const p of plan.placements) {
    const ends = cuts.get(p.instance);
    if (!ends) continue;
    const left = ends.left ? CORNICE_WIDTH / 2 : 0, right = ends.right ? CORNICE_WIDTH / 2 : 0;
    const m = [...p.transform], shift = (left - right) / 2, scale = (3 - left - right) / 3;
    for (const i of [0, 1, 2]) { m[12 + i] += m[i] * shift; m[i] *= scale; }
    transforms.set(p.instance, m);
  }
  return { joints, transforms };
}
