import { PerspectiveCamera, Quaternion } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import { TRAVEL } from '../../src/camera/travel';

const plan = layout(manifest, contract);
const make = () => { const rail = new Rail(plan.rail, plan.path); const camera = new PerspectiveCamera(); return { rail, camera, director: new Director(rail, camera) }; };
const settle = (d: Director, frames = 400) => { for (let i = 0; i < frames; i++) d.update(1 / 60); };
const metres = (d: Director) => d.u * d['rail'].length;

test('a wheel notch walks the camera about half a metre along the rail and it comes to rest there', () => {
  const { director, camera, rail } = make();
  director.jump(1);
  const start = metres(director);
  director.push(100);
  director.update(1 / 60);
  expect(metres(director) - start).toBeGreaterThan(0);
  expect(metres(director) - start).toBeLessThan(0.1);
  settle(director);
  expect(metres(director) - start).toBeGreaterThan(0.45);
  expect(metres(director) - start).toBeLessThan(0.55);
  expect(director.travel.velocity).toBe(0);
  expect(camera.position.distanceTo(rail.pose(director.u).position)).toBeLessThan(1e-9);
});

test('no frame of wheel travel moves the camera further than top speed allows', () => {
  const { director, camera } = make();
  const dt = 1 / 60;
  director.jump(0);
  let last = camera.position.clone();
  let worst = 0;
  for (let frame = 0; frame < 600; frame++) {
    for (let event = 0; event < 5; event++) director.push(TRAVEL.maxEventPx);
    director.update(dt);
    // Straight-line distance can only be shorter than the distance along the rail.
    worst = Math.max(worst, camera.position.distanceTo(last));
    last = camera.position.clone();
  }
  expect(worst).toBeGreaterThan(0);
  expect(worst).toBeLessThanOrEqual(TRAVEL.maxSpeed * dt + 1e-9);
});

test('travel stops dead at either end of the walk', () => {
  const { director } = make();
  director.push(-TRAVEL.maxEventPx);
  director.update(1 / 60);
  expect(director.u).toBe(0);
  expect(director.travel.velocity).toBe(0);

  director.jump(plan.rail.length - 1);
  director.push(TRAVEL.maxEventPx);
  director.update(1 / 60);
  expect(director.u).toBe(1);
  expect(director.travel.velocity).toBe(0);
});

test('glideTo lands exactly on a viewpoint and returns to travel mode there', () => {
  const { director, rail } = make();
  director.glideTo(4);
  expect(director.mode).toBe('glide');
  settle(director);
  expect(director.u).toBe(rail.u[4]);
  expect(director.mode).toBe('travel');
  director.push(100);
  settle(director);
  expect(metres(director) - rail.u[4] * rail.length).toBeCloseTo(0.49, 1);
});

test('a glide landing does not snap the view', () => {
  const { director, camera } = make();
  const degrees = (radians: number) => (radians * 180) / Math.PI;
  for (const [from, to] of [[2, 3], [9, 10], [4, 3], [0, 13]]) {
    director.jump(from);
    director.glideTo(to);
    const turns: number[] = [];
    let before = camera.quaternion.clone();
    for (let frame = 0; frame < 1200 && director.mode === 'glide'; frame++) {
      director.update(1 / 60);
      turns.push(before.angleTo(camera.quaternion));
      before = camera.quaternion.clone();
    }
    expect(director.mode).toBe('travel');
    // The frame that lands turns the camera by a sliver of a pixel, and by a hundredth of the
    // glide's largest turn: the view eases all the way in rather than clicking into place.
    const landing = turns[turns.length - 1];
    expect(degrees(landing)).toBeLessThan(0.01);
    expect(landing).toBeLessThan(Math.max(...turns) / 100);
  }
  // Nothing moves once it has landed.
  const settled = new Quaternion().copy(camera.quaternion);
  director.update(1 / 60);
  expect(camera.quaternion.angleTo(settled)).toBe(0);
});

test('wheel input is dropped while a glide is in flight, and a glide cancels coasting', () => {
  const { director, rail } = make();
  director.push(TRAVEL.maxEventPx);
  director.update(1 / 60);
  director.glideTo(2);
  expect(director.travel.velocity).toBe(0);
  director.push(TRAVEL.maxEventPx);
  expect(director.travel.velocity).toBe(0);
  settle(director);
  expect(director.u).toBe(rail.u[2]);
});

test('step moves between neighbouring viewpoints and clamps', () => {
  const { director, rail } = make();
  director.step(-1);
  settle(director);
  expect(director.u).toBe(0);
  director.step(1);
  settle(director);
  expect(director.u).toBe(rail.u[1]);
});

test('onViewpoint fires with the stop id when the nearest viewpoint changes, and jump is immediate', () => {
  const { director } = make();
  const seen: [number, string][] = [];
  director.onViewpoint((i, stop) => seen.push([i, stop]));
  director.jump(1);
  expect(seen).toEqual([[1, 'matter-engine']]);
  expect(director.u).toBe(director['rail'].u[1]);
  director.glideTo(3);
  settle(director);
  expect(seen[seen.length - 1]).toEqual([3, 'cy-1']);
});
