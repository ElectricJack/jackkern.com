import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import type { Viewpoint } from '../types';

/**
 * Arc-length samples per span between path points. The walk doubles back on itself at some
 * viewpoints, and a spline's parametric speed collapses into such a turn, so a coarse table
 * lets the camera run at a different speed than `u` says within one sample: at 1000 samples
 * for the whole 112 m walk it covered a centimetre of `u` at 1.6 times the distance. 400 per
 * span keeps that within 0.2%, and puts every path point exactly on a sample.
 */
const DIVISIONS_PER_SPAN = 400;

/**
 * The view reads the target curve a little further along the walk than the camera stands and
 * leans part of the way toward it, so it swings into a doorway before the camera passes
 * through rather than as it does.
 */
export const LOOK_AHEAD = {
  /** How far ahead along the walk, in metres, the look target is read. */
  metres: 2,
  /** How much of the way to that ahead target the view turns: 0 is none, 1 the whole of it. */
  blend: 0.5,
  /**
   * Within this many metres of a viewpoint the lean eases out to nothing, so a camera at rest
   * frames the viewpoint exactly as the layout composed it: tests/layout/sightlines.test.ts and
   * the static captures both hold the view to that framing.
   */
  fadeMetres: 1.5,
};

/**
 * Smooth path through the walk, parametrised by arc length so travel feels even.
 *
 * `path` is the route the layout lays between the viewpoints: the doorway bays it goes out
 * through and the steps aside that keep the centrepieces and the focal objects out of the
 * camera's way. Splining the viewpoints alone would bow the curve through the walls between
 * them, so the whole walk is what the curve runs through, and the viewpoints — the places
 * the camera stops — are a subsequence of it addressed by `u`.
 *
 * Positions and look targets are two independent centripetal Catmull-Rom curves through the
 * same path points, read at one shared parameter.
 */
export class Rail {
  readonly curve: CatmullRomCurve3;
  readonly targets: CatmullRomCurve3;
  readonly u: number[];
  /** Length of the walk in metres: `u` is the fraction of it travelled. */
  readonly length: number;
  private readonly ahead = new Vector3();

  constructor(readonly viewpoints: Viewpoint[], path: Viewpoint[]) {
    if (viewpoints.length < 2) throw new Error('rail needs at least two viewpoints');
    const at = new Map(path.map((p, i) => [p.id, i]));
    if (viewpoints.some((v) => !at.has(v.id))) throw new Error('rail viewpoints must all be on the path');
    this.curve = new CatmullRomCurve3(path.map((p) => new Vector3(...p.position)), false, 'centripetal');
    this.targets = new CatmullRomCurve3(path.map((p) => new Vector3(...p.target)), false, 'centripetal');
    // getPoint spreads the path evenly over t, so point i sits at t = i / spans: sample i × DIVISIONS_PER_SPAN.
    const spans = path.length - 1;
    this.curve.arcLengthDivisions = spans * DIVISIONS_PER_SPAN;
    this.targets.arcLengthDivisions = spans * DIVISIONS_PER_SPAN;
    const lengths = this.curve.getLengths(spans * DIVISIONS_PER_SPAN);
    this.length = lengths[lengths.length - 1];
    this.u = viewpoints.map((v) => lengths[at.get(v.id)! * DIVISIONS_PER_SPAN] / this.length);
    this.u[viewpoints.length - 1] = 1;
  }

  pose(u: number, out = { position: new Vector3(), target: new Vector3() }): { position: Vector3; target: Vector3 } {
    const c = MathUtils.clamp(u, 0, 1);
    this.curve.getPoint(this.t(c), out.position);
    this.targets.getPoint(this.t(c), out.target);

    const stop = Math.abs(c - this.u[this.nearest(c)]) * this.length;
    const lean = LOOK_AHEAD.blend * MathUtils.smoothstep(stop, 0, LOOK_AHEAD.fadeMetres);
    if (lean > 0) {
      this.targets.getPoint(this.t(Math.min(1, c + LOOK_AHEAD.metres / this.length)), this.ahead);
      out.target.lerp(this.ahead, lean);
    }
    return out;
  }

  nearest(u: number): number {
    let best = 0;
    for (let i = 1; i < this.u.length; i++) if (Math.abs(this.u[i] - u) < Math.abs(this.u[best] - u)) best = i;
    return best;
  }

  /**
   * The spline parameter at a fraction `u` of the walk's length. Arc length along the position
   * curve drives both curves through the parameter they share. Asking the target curve for its
   * own getPointAt(u) would re-parametrise it by *its* arc length, which runs at a different
   * rate, and the camera would look metres off the viewpoint it is standing on.
   */
  private t(u: number): number {
    // The 0 is @types/three requiring an argument three itself defaults; a falsy
    // distance is what makes getUtoTmapping derive the target length from `u`.
    return this.curve.getUtoTmapping(u, 0);
  }
}
