import { CatmullRomCurve3, Vector3 } from 'three';
import { SmoothCurve3 } from '../../src/camera/smooth-curve';
import { Rail } from '../../src/camera/rail';
import { layout } from '../../layout/layout.js';
import manifest from '../../content/manifest.json';
import contract from '../../kit/contract.json';

function continuous(curve: SmoothCurve3) {
  for (const t of curve.joins) {
    for (const order of [0, 1, 2, 3]) {
      // Extrapolate each side to the join. A finite gap otherwise measures legitimate snap
      // beside joins whose jerk is zero, rather than the one-sided jerk limits themselves.
      const h = 1e-10;
      const left = curve.getDerivative(t - h, order).addScaledVector(curve.getDerivative(t - h, order + 1), h);
      const right = curve.getDerivative(t + h, order).addScaledVector(curve.getDerivative(t + h, order + 1), -h);
      expect(left.distanceTo(right) / Math.max(1, left.length(), right.length())).toBeLessThan(1e-4);
    }
  }
}

test('unevenly spaced turns preserve landmarks and have C3 continuity at every patch join', () => {
  const points = [[0, 0, 0], [4, 0, 1], [4.5, 0, 3], [8, 1, 3], [9, 1, 6]].map((p) => new Vector3(...p));
  const curve = new SmoothCurve3(new CatmullRomCurve3(points, false, 'centripetal'), [0, 0.04, 0.04, 0.04, 0]);
  for (let i = 0; i < points.length; i++) expect(curve.getPoint(i / (points.length - 1)).distanceTo(points[i])).toBeLessThan(1e-9);
  continuous(curve);
});

test('the actual villa position and look-target curves have continuous third derivatives', () => {
  const plan = layout(manifest, contract), rail = new Rail(plan.rail, plan.path);
  continuous(rail.curve);
  continuous(rail.targets);
});

test('crossing arc-length table boundaries does not introduce speed discontinuities', () => {
  const plan = layout(manifest, contract), rail = new Rail(plan.rail, plan.path);
  const lengths = rail.curve.getLengths(), h = 0.0001;
  for (let i = 1; i < lengths.length - 1; i += 71) {
    const m = lengths[i];
    const at = rail.pose(m / rail.length).position;
    const left = rail.pose((m - h) / rail.length).position;
    const right = rail.pose((m + h) / rail.length).position;
    expect(Math.abs(at.distanceTo(left) / h - 1)).toBeLessThan(1e-6);
    expect(Math.abs(right.distanceTo(at) / h - 1)).toBeLessThan(1e-6);
  }
});
