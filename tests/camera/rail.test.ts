import { Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { LOOK_AHEAD, Rail } from '../../src/camera/rail';

const plan = layout(manifest, contract);

/** Degrees the view may turn per centimetre of travel. The walk's sharpest turn is 0.29°/cm. */
const MAX_TURN_DEG_PER_CM = 0.4;

test('u fractions are monotonic from 0 to 1 and a camera at rest frames every viewpoint as laid out', () => {
  const rail = new Rail(plan.rail, plan.path);
  expect(rail.u[0]).toBe(0);
  expect(rail.u[rail.u.length - 1]).toBe(1);
  for (let i = 1; i < rail.u.length; i++) expect(rail.u[i]).toBeGreaterThan(rail.u[i - 1]);
  for (let i = 0; i < plan.rail.length; i++) {
    const pose = rail.pose(rail.u[i]);
    expect(pose.position.distanceTo(new Vector3(...plan.rail[i].position))).toBeLessThan(1e-3);
    // The look-ahead has eased out by the time the camera reaches a viewpoint.
    expect(pose.target.distanceTo(new Vector3(...plan.rail[i].target))).toBeLessThan(1e-3);
  }
});

test('sampled every centimetre, the camera stays inside the stops and the view never jumps', () => {
  const rail = new Rail(plan.rail, plan.path);
  const boxes = Object.values(plan.bounds);
  const samples = Math.ceil(rail.length / 0.01);
  const outside: string[] = [];
  const view = new Vector3();
  const previous = new Vector3();
  let worst = { degrees: 0, at: 0 };
  let nearest = Infinity;

  for (let i = 0; i <= samples; i++) {
    const { position, target } = rail.pose(i / samples);
    const p = position.toArray();
    if (!boxes.some((b) => [0, 1, 2].every((k) => p[k] >= b.min[k] - 1e-6 && p[k] <= b.max[k] + 1e-6))) {
      outside.push(`${((i / samples) * rail.length).toFixed(2)} m: ${p.map((v) => v.toFixed(2)).join(', ')}`);
    }
    view.subVectors(target, position);
    nearest = Math.min(nearest, view.length());
    view.normalize();
    if (i > 0) {
      const degrees = (previous.angleTo(view) * 180) / Math.PI;
      if (degrees > worst.degrees) worst = { degrees, at: (i / samples) * rail.length };
    }
    previous.copy(view);
  }

  expect(samples).toBeGreaterThan(11_000);
  expect(outside.slice(0, 5)).toEqual([]);
  expect(`worst turn ${worst.degrees.toFixed(3)}°/cm at ${worst.at.toFixed(2)} m`)
    .toBe(`worst turn ${Math.min(worst.degrees, MAX_TURN_DEG_PER_CM).toFixed(3)}°/cm at ${worst.at.toFixed(2)} m`);
  // A look target that came near the camera would swing the view about however far apart they were.
  expect(nearest).toBeGreaterThan(2);
});

test('arc length is even: a centimetre of u is a centimetre of walk, doubling-back turns included', () => {
  const rail = new Rail(plan.rail, plan.path);
  const samples = Math.ceil(rail.length / 0.01);
  let worst = 0;
  let previous = rail.pose(0).position.clone();
  for (let i = 1; i <= samples; i++) {
    const { position } = rail.pose(i / samples);
    worst = Math.max(worst, position.distanceTo(previous) / (rail.length / samples));
    previous = position.clone();
  }
  // The speed cap in travel.ts is metres along `u`; this is what makes it metres in the world.
  expect(worst).toBeLessThan(1.01);
});

test('the view leans toward what lies ahead between viewpoints', () => {
  const rail = new Rail(plan.rail, plan.path);
  // Halfway between the entry court and the pool hall, well clear of either viewpoint's fade.
  const u = (rail.u[0] + rail.u[1]) / 2;
  const leaning = rail.pose(u).target.clone();
  const blend = LOOK_AHEAD.blend;
  LOOK_AHEAD.blend = 0;
  try {
    const plain = rail.pose(u).target.clone();
    const ahead = rail.pose(u + LOOK_AHEAD.metres / rail.length).target.clone();
    expect(leaning.distanceTo(plain)).toBeGreaterThan(0.1);
    expect(leaning.distanceTo(plain.lerp(ahead, blend))).toBeLessThan(1e-9);
  } finally {
    LOOK_AHEAD.blend = blend;
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
