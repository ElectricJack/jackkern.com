import { PerspectiveCamera } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import { TRAVEL } from '../../src/camera/travel';

const plan = layout(manifest, contract);
const rail = new Rail(plan.rail, plan.path);
const projects = manifest.stops.filter(s => s.kind === 'project').map(s => s.id);
const make = () => { const camera = new PerspectiveCamera(); return { camera, director: new Director(rail, camera, projects) }; };
const run = (d: Director, seconds: number, hz = 60) => { for (let i = 0; i < Math.round(seconds * hz); i++) d.update(1 / hz); };
const state = (d: Director) => [d.u, d.velocity, d.acceleration, d.jerk];

function arrive(d: Director, target: number) {
  const limit = Math.ceil(rail.length / TRAVEL.minSpeed + 20) * 60;
  for (let i = 0; i < limit && d.playing; i++) d.update(1 / 60);
  expect(d.u).toBeCloseTo(rail.u[target], 12);
  expect(d.mode).toBe('paused');
  expect(state(d).slice(1).map(Math.abs)).toEqual([0, 0, 0]);
}

test('the tour stops once per project, cruises through courtyards, and waits to continue', () => {
  const { director, camera } = make(), seen: number[] = [];
  director.onViewpoint(index => seen.push(index));
  director.jump(0);
  expect(director.readingViews.map(i => rail.viewpoints[i].id)).toEqual(projects.map(id => `${id}-focal`));
  for (const target of [...director.readingViews, rail.u.length - 1]) {
    const start = director.u * rail.length, end = rail.u[target] * rail.length;
    director.fly();
    for (let i = 0; i < 12000 && director.playing; i++) {
      director.update(1 / 60);
      const metres = director.u * rail.length;
      expect(metres).toBeLessThanOrEqual(end + 1e-9);
      if (metres > start + 3 && metres < end - 3) {
        expect(director.velocity).toBeCloseTo(TRAVEL.cruiseSpeed, 10);
        expect(director.acceleration).toBe(0);
        expect(director.jerk).toBe(0);
      }
      expect(camera.position.distanceTo(rail.pose(director.u).position)).toBeLessThan(1e-9);
    }
    arrive(director, target);
    expect(director.atProject).toBe(target !== rail.u.length - 1);
    const paused = state(director); run(director, 15);
    expect(state(director)).toEqual(paused);
  }
  expect(seen).toEqual(plan.rail.map((_, i) => i));
});

test('scroll pace persists between gestures, can be lowered by a new gesture, and resets at the next project', () => {
  const { director } = make();
  director.jump(director.readingViews[0]);
  director.push(200, 0); run(director, 5);
  expect(director.velocity).toBeCloseTo(TRAVEL.maxSpeed, 10);
  const before = state(director);
  director.push(30, 1000);
  expect(state(director)).toEqual(before);
  run(director, 2);
  expect(director.velocity).toBeCloseTo(TRAVEL.minSpeed, 10);
  run(director, 2);
  expect(director.velocity).toBeCloseTo(TRAVEL.minSpeed, 10);
  arrive(director, director.readingViews[1]);
  director.toggle(); run(director, 5);
  expect(director.velocity).toBeCloseTo(TRAVEL.cruiseSpeed, 10);
});

test('a continuous wheel gesture cannot skip a project pause; a fresh gesture continues', () => {
  const { director } = make(); let time = 0;
  do {
    director.push(100, time);
    director.update(1 / 60); time += 1000 / 60;
  } while (!director.atProject && time < 60000);
  expect(director.atProject).toBe(true);
  const paused = state(director);
  for (let i = 0; i < 60; i++) { director.push(2, time); director.update(1 / 60); time += 1000 / 60; }
  expect(state(director)).toEqual(paused);
  director.push(100, time + 500); run(director, 3);
  expect(director.u).toBeGreaterThan(paused[0]);
});

test('pause, pace changes and reversals preserve instantaneous position and all derivatives', () => {
  const { director } = make();
  director.jump(5); director.fly(); run(director, 5);
  for (const [action, seconds] of [
    [() => director.pause(), .4], [() => director.toggle(), .4],
    [() => director.push(220, 1000), .4], [() => director.push(-100, 2000), 5],
  ] as const) {
    const before = state(director); action(); expect(state(director)).toEqual(before); run(director, seconds);
  }
  expect(director.velocity).toBeLessThan(0);
  director.pause(); run(director, 4);
  const paused = state(director); run(director, 5);
  expect(state(director)).toEqual(paused);
});

test('explicit project selection arrives at that reading view and can be interrupted smoothly', () => {
  const { director } = make();
  director.fly(); run(director, 5);
  const before = state(director);
  director.glideTo(director.projectView('agent-queue'));
  expect(state(director)).toEqual(before);
  arrive(director, director.projectView('agent-queue'));
  director.glideTo(director.projectView('quilt-trader')); run(director, 6);
  const visiting = state(director);
  director.push(-100, 0); expect(state(director)).toEqual(visiting);
  run(director, 6);
  expect(director.velocity).toBeLessThan(0);
  expect(director.mode).toBe('flight');
});

test('reverse travel also pauses at each project and stops exactly at the entrance', () => {
  const { director } = make();
  director.push(-100, 0); run(director, 2);
  expect(state(director)).toEqual([0, 0, 0, 0]);
  director.jump(rail.u.length - 1);
  director.push(100, 0); run(director, 2);
  expect(state(director)).toEqual([1, 0, 0, 0]);
  for (const target of [...director.readingViews].reverse().concat(0)) {
    director.fly(-1); arrive(director, target);
  }
});

test('jump and viewpoint notifications retain stationary capture positions and project IDs', () => {
  const { director } = make();
  const seen: [number, string][] = [];
  director.onViewpoint((i, stop) => seen.push([i, stop]));
  director.jump(1);
  expect(seen).toEqual([[1, 'matter-engine']]);
  expect(director.u).toBeCloseTo(rail.u[1], 12);
  const before = state(director); run(director, 5);
  expect(state(director)).toEqual(before);
});

test('the automatic tour starts after ten idle seconds, resetting on entrance activity', () => {
  const { director } = make();
  director.jump(0);
  director.setAutoplay(true);
  run(director, 9);
  expect(state(director)).toEqual([0, 0, 0, 0]);
  director.activity();
  expect(director.autoResumeIn).toBe(10);
  run(director, 9.9);
  expect(director.playing).toBe(false);
  run(director, .1);
  expect(director.playing).toBe(true);
  expect(director.autoResumeIn).toBeNull();
  expect(state(director)).toEqual([0, 0, 0, 0]);
  run(director, 3);
  expect(director.u).toBeGreaterThan(0);
});

test('automatic flight holds each project for ten seconds in both directions, then stays at the endpoint', () => {
  const { director } = make();
  director.setAutoplay(true);
  run(director, 10);
  for (const [direction, targets] of [
    [1, [...director.readingViews, rail.u.length - 1]],
    [-1, [...director.readingViews].reverse().concat(0)],
  ] as const) {
    if (direction < 0) director.fly(-1);
    for (const target of targets) {
      arrive(director, target);
      const stopped = state(director);
      if (director.atProject) {
        expect(director.autoResumeIn).toBe(10);
        run(director, 5); director.activity(); run(director, 4.9);
        expect(state(director)).toEqual(stopped);
        run(director, .1);
        expect(director.playing).toBe(true);
        expect(state(director)).toEqual(stopped); // restart has zero velocity, acceleration and jerk
      } else {
        expect(director.autoResumeIn).toBeNull();
        run(director, 20);
        expect(state(director)).toEqual(stopped);
      }
    }
  }
});

test('manual pause cancels automatic departure until Continue, including selected projects', () => {
  const { director } = make();
  director.setAutoplay(true);
  director.glideTo(director.readingViews[1]);
  arrive(director, director.readingViews[1]);
  run(director, 5);
  director.pause();
  const stopped = state(director);
  run(director, 20);
  expect(state(director)).toEqual(stopped);
  expect(director.autoResumeIn).toBeNull();
  director.toggle();
  arrive(director, director.readingViews[2]);
  expect(director.autoResumeIn).toBe(10);
  director.toggle(); run(director, 3);
  expect(director.u).toBeGreaterThan(rail.u[director.readingViews[2]]);
});

test('timers use real visible time even when camera integration is capped for a slow frame', () => {
  const { director } = make();
  director.setAutoplay(true);
  for (let i = 0; i < 19; i++) director.update(.1, .5);
  expect(director.playing).toBe(false);
  director.update(.1, .5);
  expect(director.playing).toBe(true);
  expect(state(director)).toEqual([0, 0, 0, 0]);
});

test('disabling autoplay cancels its timer and leaves subsequent stops manual', () => {
  const { director } = make();
  director.setAutoplay(true);
  run(director, 8);
  director.setAutoplay(false);
  run(director, 20);
  expect(director.playing).toBe(false);
  director.fly(); arrive(director, director.readingViews[0]);
  const stopped = state(director); run(director, 20);
  expect(state(director)).toEqual(stopped);
  expect(director.autoResumeIn).toBeNull();
});

test('selecting the current project starts a fresh reading pause without moving the camera', () => {
  const { director } = make();
  director.jump(director.readingViews[0]);
  director.setAutoplay(true);
  run(director, 8);
  const stopped = state(director);
  director.glideTo(director.readingViews[0]);
  director.update(1 / 60);
  expect(state(director)).toEqual(stopped);
  expect(director.autoResumeIn).toBe(10);
  run(director, 10);
  expect(director.playing).toBe(true);
});
