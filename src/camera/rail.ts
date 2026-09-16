import { CatmullRomCurve3, Vector3 } from 'three';
import type { Viewpoint } from '../types';

const DIVISIONS = 1000;

/** Smooth path through the viewpoints, parametrised by arc length so scrolling feels even. */
export class Rail {
  readonly curve: CatmullRomCurve3;
  readonly targets: CatmullRomCurve3;
  readonly u: number[];

  constructor(readonly viewpoints: Viewpoint[]) {
    if (viewpoints.length < 2) throw new Error('rail needs at least two viewpoints');
    this.curve = new CatmullRomCurve3(viewpoints.map((v) => new Vector3(...v.position)), false, 'centripetal');
    this.targets = new CatmullRomCurve3(viewpoints.map((v) => new Vector3(...v.target)), false, 'centripetal');
    this.curve.arcLengthDivisions = DIVISIONS;
    this.targets.arcLengthDivisions = DIVISIONS;
    const lengths = this.curve.getLengths(DIVISIONS);
    const total = lengths[lengths.length - 1];
    const n = viewpoints.length;
    this.u = viewpoints.map((_, i) => lengths[Math.round((i / (n - 1)) * DIVISIONS)] / total);
    this.u[n - 1] = 1;
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
