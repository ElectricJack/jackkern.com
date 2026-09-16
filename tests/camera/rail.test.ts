import { Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';
import type { Viewpoint } from '../../src/types';

const plan = layout(manifest, contract);

test('u fractions are monotonic from 0 to 1', () => {
  const rail = new Rail(plan.rail, plan.path);
  expect(rail.u[0]).toBe(0);
  expect(rail.u[rail.u.length - 1]).toBe(1);
  for (let i = 1; i < rail.u.length; i++) expect(rail.u[i]).toBeGreaterThan(rail.u[i - 1]);
});

test('the pose at each u stands on its viewpoint and looks at its target, however many points the walk has', () => {
  // A walk point added between two others moves every u after it, and must not move the
  // camera off any viewpoint: jump() and the static capture frame each one from exactly here.
  const between = (a: Viewpoint, b: Viewpoint): Viewpoint => ({
    ...a,
    id: `${a.id}-between`,
    position: a.position.map((v, k) => (v + b.position[k]) / 2) as Viewpoint['position'],
    target: a.target.map((v, k) => (v + b.target[k]) / 2) as Viewpoint['target'],
  });
  const walks = [plan.path, ...[1, 7, 20].map((k) => [...plan.path.slice(0, k), between(plan.path[k - 1], plan.path[k]), ...plan.path.slice(k)])];
  for (const path of walks) {
    const rail = new Rail(plan.rail, path);
    for (let i = 0; i < plan.rail.length; i++) {
      const pose = rail.pose(rail.u[i]);
      expect(pose.position.distanceTo(new Vector3(...plan.rail[i].position))).toBeLessThan(0.001);
      expect(pose.target.distanceTo(new Vector3(...plan.rail[i].target))).toBeLessThan(0.001);
    }
  }
});

test('nearest returns the closest viewpoint index and pose clamps u', () => {
  const rail = new Rail(plan.rail, plan.path);
  expect(rail.nearest(rail.u[3] + 0.001)).toBe(3);
  expect(rail.nearest(-1)).toBe(0);
  expect(rail.pose(2).position.distanceTo(rail.pose(1).position)).toBe(0);
});

test('a rail needs at least two viewpoints', () => {
  expect(() => new Rail([plan.rail[0]], plan.path)).toThrow('at least two');
});

test('a rail rejects a viewpoint the path does not run through', () => {
  const stray = { ...plan.rail[2], id: 'nowhere' };
  expect(() => new Rail([plan.rail[0], stray], plan.path)).toThrow('on the path');
});
