import { CatmullRomCurve3, Vector3 } from 'three';
import type { Viewpoint } from '../types';

const DIVISIONS = 1000;

/**
 * Smooth path through the walk, parametrised by arc length so scrolling feels even.
 *
 * `path` is the route the layout lays between the viewpoints: the doorway bays it goes out
 * through and the steps aside that keep the centrepieces and the focal objects out of the
 * camera's way. Splining the viewpoints alone would bow the curve through the walls between
 * them, so the whole walk is what the curve runs through, and the viewpoints — the places
 * the camera stops — are a subsequence of it addressed by `u`.
 */
export class Rail {
  readonly curve: CatmullRomCurve3;
  readonly targets: CatmullRomCurve3;
  readonly u: number[];

  constructor(readonly viewpoints: Viewpoint[], path: Viewpoint[]) {
    if (viewpoints.length < 2) throw new Error('rail needs at least two viewpoints');
    const at = new Map(path.map((p, i) => [p.id, i]));
    if (viewpoints.some((v) => !at.has(v.id))) throw new Error('rail viewpoints must all be on the path');
    this.curve = new CatmullRomCurve3(path.map((p) => new Vector3(...p.position)), false, 'centripetal');
    this.targets = new CatmullRomCurve3(path.map((p) => new Vector3(...p.target)), false, 'centripetal');
    this.curve.arcLengthDivisions = DIVISIONS;
    this.targets.arcLengthDivisions = DIVISIONS;
    const lengths = this.curve.getLengths(DIVISIONS);
    const total = lengths[lengths.length - 1];
    // getPoint spreads the path evenly over t, so point i sits at t = i / (path.length - 1).
    const spans = path.length - 1;
    this.u = viewpoints.map((v) => lengths[Math.round((at.get(v.id)! / spans) * DIVISIONS)] / total);
    this.u[viewpoints.length - 1] = 1;
  }

  pose(u: number, out = { position: new Vector3(), target: new Vector3() }): { position: Vector3; target: Vector3 } {
    const c = Math.min(1, Math.max(0, u));
    // Arc length along the position curve drives both curves, through the spline parameter they
    // share. Asking the target curve for its own getPointAt(c) would re-parametrise it by *its*
    // arc length, which runs at a different rate, and the camera would look metres off the
    // viewpoint it is standing on.
    // The 0 is @types/three requiring an argument three itself defaults; a falsy
    // distance is what makes getUtoTmapping derive the target length from `u`.
    const t = this.curve.getUtoTmapping(c, 0);
    this.curve.getPoint(t, out.position);
    this.targets.getPoint(t, out.target);
    return out;
  }

  nearest(u: number): number {
    let best = 0;
    for (let i = 1; i < this.u.length; i++) if (Math.abs(this.u[i] - u) < Math.abs(this.u[best] - u)) best = i;
    return best;
  }
}
