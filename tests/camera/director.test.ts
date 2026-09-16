import { PerspectiveCamera } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';

const plan = layout(manifest, contract);
const make = () => { const rail = new Rail(plan.rail, plan.path); const camera = new PerspectiveCamera(); return { rail, camera, director: new Director(rail, camera) }; };
const settle = (d: Director, frames = 400) => { for (let i = 0; i < frames; i++) d.update(1 / 60); };

test('scroll mode eases the camera to the scroll fraction', () => {
  const { director, camera, rail } = make();
  director.setScroll(0.5);
  settle(director);
  expect(director.u).toBeCloseTo(0.5, 3);
  expect(camera.position.distanceTo(rail.pose(0.5).position)).toBeLessThan(0.01);
});

test('glideTo lands exactly on a viewpoint and returns to scroll mode there', () => {
  const { director, rail } = make();
  director.glideTo(4);
  expect(director.mode).toBe('glide');
  settle(director);
  expect(director.u).toBe(rail.u[4]);
  expect(director.mode).toBe('scroll');
  director.scrollBy(0.01);
  settle(director);
  expect(director.u).toBeCloseTo(rail.u[4] + 0.01, 3);
});

test('scroll input is ignored while a glide is in flight', () => {
  const { director, rail } = make();
  director.glideTo(2);
  director.setScroll(0.9);
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
