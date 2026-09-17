import { Curve, MathUtils, Vector3, type CatmullRomCurve3 } from 'three';

type Jet = { p: Vector3; v: Vector3; a: Vector3; j: Vector3 };
type Piece = { start: number; end: number; coefficients: Vector3[]; reverse?: Vector3[] };
const NODES = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const WEIGHTS = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891];

/**
 * C3 joins: seventh-degree patches match position and the first three derivatives.
 * Cubic coefficients and all derivatives are analytic, without finite-difference estimates.
 * Arc length uses quadrature and Newton refinement instead of linear table interpolation,
 * which would introduce a tiny velocity discontinuity at every table entry.
 */
export class SmoothCurve3 extends Curve<Vector3> {
  private readonly cubics: Piece[] = [];
  private readonly patches: Piece[] = [];
  private lengths: number[] = [];
  private readonly derivative = new Vector3();
  readonly joins: number[] = [];

  constructor(source: CatmullRomCurve3, radii: number[], knots = source.points.map((_, i) => i / (source.points.length - 1))) {
    super();
    const spans = source.points.length - 1;
    for (let i = 0; i < spans; i++) {
      const p0 = source.getPoint(i / spans), p1 = source.getPoint((i + 1 / 3) / spans);
      const p2 = source.getPoint((i + 2 / 3) / spans), p3 = source.getPoint((i + 1) / spans);
      const c3 = p3.clone().addScaledVector(p2, -3).addScaledVector(p1, 3).sub(p0).multiplyScalar(4.5);
      const c2 = p2.clone().addScaledVector(p1, -2).add(p0).multiplyScalar(4.5).sub(c3);
      const c1 = p1.clone().sub(p0).multiplyScalar(3).addScaledVector(c2, -1 / 3).addScaledVector(c3, -1 / 9);
      this.cubics.push({ start: knots[i], end: knots[i + 1], coefficients: [p0, c1, c2, c3] });
    }
    for (let i = 1; i < spans; i++) {
      const t = knots[i], radius = radii[i];
      const left = this.jet(this.cubics[i - 1], t), right = this.jet(this.cubics[i], t);
      const centre = { p: source.points[i].clone(), v: left.v.add(right.v).multiplyScalar(0.5),
        a: left.a.add(right.a).multiplyScalar(0.5), j: left.j.add(right.j).multiplyScalar(0.5) };
      this.patches.push(this.patch(t - radius, t, this.jet(this.cubics[i - 1], t - radius), centre));
      this.patches.push(this.patch(t, t + radius, centre, this.jet(this.cubics[i], t + radius)));
      this.joins.push(t - radius, t, t + radius);
    }
  }

  getPoint(t: number, out = new Vector3()): Vector3 { return this.getDerivative(t, 0, out); }

  getDerivative(t: number, order = 1, out = new Vector3()): Vector3 {
    t = MathUtils.clamp(t, 0, 1);
    let lo = 0, hi = this.patches.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1, patch = this.patches[mid];
      if (t < patch.start) hi = mid - 1;
      else if (t > patch.end) lo = mid + 1;
      else return this.evaluate(patch, t, order, out);
    }
    lo = 0; hi = this.cubics.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (t > this.cubics[mid].end) lo = mid + 1; else hi = mid; }
    return this.evaluate(this.cubics[lo], t, order, out);
  }

  getLengths(divisions = this.arcLengthDivisions): number[] {
    if (this.lengths.length === divisions + 1) return this.lengths;
    this.lengths = [0];
    for (let i = 1; i <= divisions; i++) this.lengths.push(this.lengths[i - 1] + this.integral((i - 1) / divisions, i / divisions));
    return this.lengths;
  }

  getUtoTmapping(u: number, distance = 0): number {
    const lengths = this.getLengths(), n = lengths.length - 1;
    const wanted = MathUtils.clamp(distance || u * lengths[n], 0, lengths[n]);
    if (wanted === 0) return 0;
    if (wanted === lengths[n]) return 1;
    let lo = 0, hi = n;
    while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (lengths[mid] <= wanted) lo = mid; else hi = mid; }
    const start = lo / n, end = hi / n;
    let t = start + (end - start) * (wanted - lengths[lo]) / (lengths[hi] - lengths[lo]);
    for (let i = 0; i < 3; i++) {
      const error = lengths[lo] + this.integral(start, t) - wanted;
      if (Math.abs(error) < 1e-12) break;
      const speed = this.getDerivative(t, 1, this.derivative).length();
      t = MathUtils.clamp(t - error / speed, start, end);
    }
    return t;
  }

  lengthAt(t: number): number {
    t = MathUtils.clamp(t, 0, 1);
    const lengths = this.getLengths(), n = lengths.length - 1;
    if (t === 1) return lengths[n];
    const i = Math.floor(t * n);
    return lengths[i] + this.integral(i / n, t);
  }

  private integral(start: number, end: number): number {
    const half = (end - start) / 2, middle = (end + start) / 2;
    let sum = 0;
    for (let i = 0; i < NODES.length; i++) sum += WEIGHTS[i] * this.getDerivative(middle + half * NODES[i], 1, this.derivative).length();
    return half * sum;
  }

  private evaluate(piece: Piece, t: number, order: number, out: Vector3): Vector3 {
    const span = piece.end - piece.start;
    // Evaluate from the nearer endpoint. At a short patch's far end, cancelling large
    // seventh-degree coefficients can otherwise lose precision in its third derivative.
    const reversed = !!piece.reverse && t > (piece.start + piece.end) / 2;
    const coefficients = reversed ? piece.reverse! : piece.coefficients;
    const u = reversed ? (piece.end - t) / span : (t - piece.start) / span;
    out.set(0, 0, 0);
    for (let i = coefficients.length - 1; i >= order; i--) {
      let factor = 1;
      for (let k = 0; k < order; k++) factor *= i - k;
      out.multiplyScalar(u).addScaledVector(coefficients[i], factor);
    }
    return out.multiplyScalar((reversed ? -span : span) ** -order);
  }

  private jet(piece: Piece, t: number): Jet {
    return { p: this.evaluate(piece, t, 0, new Vector3()), v: this.evaluate(piece, t, 1, new Vector3()),
      a: this.evaluate(piece, t, 2, new Vector3()), j: this.evaluate(piece, t, 3, new Vector3()) };
  }

  private patch(start: number, end: number, from: Jet, to: Jet): Piece {
    return { start, end, coefficients: this.coefficients(from, to, end - start), reverse: this.coefficients(to, from, start - end) };
  }

  private coefficients(from: Jet, to: Jet, span: number): Vector3[] {
    const c0 = from.p.clone(), c1 = from.v.clone().multiplyScalar(span), c2 = from.a.clone().multiplyScalar(span ** 2 / 2), c3 = from.j.clone().multiplyScalar(span ** 3 / 6);
    const p = to.p.clone().sub(c0).sub(c1).sub(c2).sub(c3);
    const v = to.v.clone().multiplyScalar(span).sub(c1).addScaledVector(c2, -2).addScaledVector(c3, -3);
    const a = to.a.clone().multiplyScalar(span ** 2).addScaledVector(c2, -2).addScaledVector(c3, -6);
    const j = to.j.clone().multiplyScalar(span ** 3).addScaledVector(c3, -6);
    return [c0, c1, c2, c3,
      p.clone().multiplyScalar(35).addScaledVector(v, -15).addScaledVector(a, 2.5).addScaledVector(j, -1 / 6),
      p.clone().multiplyScalar(-84).addScaledVector(v, 39).addScaledVector(a, -7).addScaledVector(j, 0.5),
      p.clone().multiplyScalar(70).addScaledVector(v, -34).addScaledVector(a, 6.5).addScaledVector(j, -0.5),
      p.clone().multiplyScalar(-20).addScaledVector(v, 10).addScaledVector(a, -2).addScaledVector(j, 1 / 6),
    ];
  }
}
