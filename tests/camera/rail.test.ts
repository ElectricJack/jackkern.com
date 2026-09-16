import { Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';

const plan = layout(manifest, contract);

test('u fractions are monotonic from 0 to 1 and the curve passes through every viewpoint', () => {
  const rail = new Rail(plan.rail, plan.path);
  expect(rail.u[0]).toBe(0);
  expect(rail.u[rail.u.length - 1]).toBe(1);
  for (let i = 1; i < rail.u.length; i++) expect(rail.u[i]).toBeGreaterThan(rail.u[i - 1]);
  for (let i = 0; i < plan.rail.length; i++) {
    const pose = rail.pose(rail.u[i]);
    expect(pose.position.distanceTo(new Vector3(...plan.rail[i].position))).toBeLessThan(0.15);
    expect(pose.target.distanceTo(new Vector3(...plan.rail[i].target))).toBeLessThan(0.5);
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
