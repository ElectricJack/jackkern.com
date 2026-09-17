import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';
import type { Viewpoint } from '../types';
import { SmoothCurve3 } from './smooth-curve';

/**
 * Arc-length samples per span between path points. Tight turns need a dense table so a
 * centimetre along `u` stays a centimetre in the world. Sampling per span preserves that
 * accuracy when the route changes. Quadrature/Newton refinement smooths the distance lookup.
 */
const DIVISIONS_PER_SPAN = 400;

/**
 * Smooth path through the walk, parametrised by arc length so travel feels even.
 *
 * `path` is the route the layout lays between the viewpoints: the doorway bays it goes out
 * through and the steps aside that keep the centrepieces and the focal objects out of the
 * camera's way. Splining the viewpoints alone would bow the curve through the walls between
 * them, so the whole walk is what the curve runs through. Viewpoints are content landmarks
 * addressed by `u`; the director chooses which ones become reading stops.
 *
 * Positions and look targets use centripetal Catmull-Rom curves with C3 blends at the joins,
 * through the same path points and read at one shared parameter.
 */
export class Rail {
  readonly curve: SmoothCurve3;
  readonly targets: SmoothCurve3;
  readonly u: number[];
  /** Length of the walk in metres: `u` is the fraction of it travelled. */
  readonly length: number;

  constructor(readonly viewpoints: Viewpoint[], path: Viewpoint[]) {
    if (viewpoints.length < 2) throw new Error('rail needs at least two viewpoints');
    const at = new Map(path.map((p, i) => [p.id, i]));
    if (viewpoints.some((v) => !at.has(v.id))) throw new Error('rail viewpoints must all be on the path');
    const positions = path.map((p) => new Vector3(...p.position));
    const spans = path.length - 1;
    // Centripetal knot spacing gives adjoining position spans compatible velocities before
    // blending. Uniform spacing would force extra bends where long and short spans meet.
    const knots = [0];
    for (let i = 1; i <= spans; i++) knots.push(knots[i - 1] + Math.sqrt(positions[i].distanceTo(positions[i - 1])));
    const total = knots[spans];
    for (let i = 1; i <= spans; i++) knots[i] /= total;
    const radii = positions.map((p, i) => {
      if (i === 0 || i === spans) return 0;
      const before = knots[i] - knots[i - 1], after = knots[i + 1] - knots[i];
      return Math.min(0.45 * before, 0.45 * after, 1 / Math.max(p.distanceTo(positions[i - 1]) / before, p.distanceTo(positions[i + 1]) / after));
    });
    this.curve = new SmoothCurve3(new CatmullRomCurve3(positions, false, 'centripetal'), radii, knots);
    this.targets = new SmoothCurve3(new CatmullRomCurve3(path.map((p) => new Vector3(...p.target)), false, 'centripetal'), radii, knots);
    this.curve.arcLengthDivisions = spans * DIVISIONS_PER_SPAN;
    this.targets.arcLengthDivisions = spans * DIVISIONS_PER_SPAN;
    const lengths = this.curve.getLengths(spans * DIVISIONS_PER_SPAN);
    this.length = lengths[lengths.length - 1];
    this.u = viewpoints.map((v) => this.curve.lengthAt(knots[at.get(v.id)!]) / this.length);
    this.u[viewpoints.length - 1] = 1;
  }

  pose(u: number, out = { position: new Vector3(), target: new Vector3() }): { position: Vector3; target: Vector3 } {
    const c = MathUtils.clamp(u, 0, 1);
    const t = this.t(c);
    this.curve.getPoint(t, out.position);
    this.targets.getPoint(t, out.target);

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
