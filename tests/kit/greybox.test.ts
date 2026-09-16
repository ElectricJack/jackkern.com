import { Box3, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import type { Part } from '../../src/types';
import { Rail } from '../../src/camera/rail';
import { DOORWAY_OPENING } from '../../src/kit/doorway.js';
import { greyboxGeometry, greyboxMaterial } from '../../src/kit/greybox';
// @ts-expect-error -- plain JS geometry helper, shared with tests/layout/sightlines.test.ts
import { rayHitsBox, worldShapes } from '../../tools/sightlines.mjs';

// The 112 m walk is sampled every 6 mm, far finer than any clearance below.
const SAMPLES = 20000;
// The clearance tests/camera/clearance.test.ts holds the walk to from everything solid: two and
// a half times the 0.1 m near plane, so nothing clips. That test measures the straight-line gap
// to the stand-in boxes in tools/sightlines.mjs, a doorway's frame among them; this one holds
// the same 0.25 m beside and over the camera against the mesh three.js builds.
const CLEARANCE_M = 0.25;

const part = (id: string) => contract.parts.find((candidate) => candidate.id === id) as Part;
const bounds = (id: string) =>
  new Box3().setFromBufferAttribute(greyboxGeometry(part(id)).getAttribute('position') as any);

test('a column is a vertical cylinder standing on y=0 with the contract height', () => {
  const box = bounds('column-doric');

  expect(box.min.y).toBeCloseTo(0, 5);
  expect(box.max.y).toBeCloseTo(4, 5);
  expect(box.max.x - box.min.x).toBeLessThan(1);
});

test('a wall spans its footprint width and a floor slab hangs just below y=0', () => {
  const wall = bounds('wall-3m');
  expect(wall.max.x - wall.min.x).toBeCloseTo(3, 5);
  expect(wall.max.y).toBeCloseTo(4, 5);

  const floor = bounds('floor-slab-3x3');
  expect(floor.max.y).toBeCloseTo(0, 5);
  expect(floor.max.z - floor.min.z).toBeCloseTo(3, 5);
});

test('a doorway keeps the wall silhouette but is hollow at its threshold socket', () => {
  const panel = part('wall-3m-doorway');
  const door = bounds('wall-3m-doorway');
  const wall = bounds('wall-3m');
  expect(door.min.toArray()).toEqual(wall.min.toArray());
  expect(door.max.toArray()).toEqual(wall.max.toArray());

  const mesh = new Mesh(greyboxGeometry(panel), new MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const ray = new Raycaster();
  // Straight through the wall along the socket's +z, the way the camera crosses it.
  const blocked = (x: number, y: number) => {
    ray.set(new Vector3(x, y, -2), new Vector3(0, 0, 1));
    return ray.intersectObject(mesh).length > 0;
  };
  const [socketX] = panel.sockets.find((socket) => socket.name === 'threshold')!.at;
  const centre = socketX - panel.footprint[0] / 2;
  const halfOpening = DOORWAY_OPENING.width / 2;

  for (const y of [0.05, 1.7, DOORWAY_OPENING.height - 0.05]) {
    for (const x of [centre, centre - halfOpening + 0.05, centre + halfOpening - 0.05]) expect(blocked(x, y)).toBe(false);
  }
  // Jambs either side and a lintel over the head are still solid.
  expect(blocked(centre - halfOpening - 0.05, 1.7)).toBe(true);
  expect(blocked(centre + halfOpening + 0.05, 1.7)).toBe(true);
  expect(blocked(centre, DOORWAY_OPENING.height + 0.05)).toBe(true);
  // A plain wall is solid where the doorway is open.
  const solid = new Mesh(greyboxGeometry(part('wall-3m')), new MeshBasicMaterial());
  solid.updateMatrixWorld();
  ray.set(new Vector3(centre, 1.7, -2), new Vector3(0, 0, 1));
  expect(ray.intersectObject(solid).length).toBeGreaterThan(0);
});

test('the sight-line stand-in for a wall is solid exactly where its grey box is', () => {
  // tools/sightlines.mjs is what the sight-line, clearance and occlusion checks see, so it has
  // to agree with the mesh, doorway opening included. Rays run straight through each panel on a
  // 0.1 m grid set 0.05 m in from every edge of the wall and of the opening.
  const parts = new Map(contract.parts.map((candidate) => [candidate.id, candidate]));
  const ray = new Raycaster();
  const through = new Vector3(0, 0, 1);
  for (const id of ['wall-3m', 'wall-3m-doorway']) {
    const panel = part(id);
    const mesh = new Mesh(greyboxGeometry(panel), new MeshBasicMaterial({ side: DoubleSide }));
    mesh.updateMatrixWorld();
    const placement = { instance: `test.${id}.1`, part: id, stop: 'test', transform: new Matrix4().toArray() };
    const shapes = worldShapes({ placements: [placement] }, parts) as any[];
    const disagree: string[] = [];
    for (let i = 0; i < panel.footprint[0] * 10; i++) {
      for (let j = 0; j < panel.height * 10; j++) {
        const [x, y] = [(i + 0.5) / 10 - panel.footprint[0] / 2, (j + 0.5) / 10];
        ray.set(new Vector3(x, y, -2), through);
        const solid = ray.intersectObject(mesh).length > 0;
        if (solid !== shapes.some((shape) => rayHitsBox([x, y, -2], [x, y, 2], shape) !== null)) {
          disagree.push(`(${x.toFixed(2)}, ${y.toFixed(2)}) ${solid ? 'solid' : 'open'}`);
        }
      }
    }
    expect(`${id}: ${disagree.length} rays disagree ${disagree.slice(0, 3).join(' ')}`).toBe(`${id}: 0 rays disagree `);
  }
});

test('the camera rail crosses each doorway it meets through the opening, not the frame', () => {
  const plan = layout(manifest, contract);
  // What the camera rides: the whole walk, through the bay each doorway opens. A spline through
  // the viewpoints alone is not held to the doorways and has not been the rail since task
  // vivid-impact, so it is not what this measures.
  const rail = new Rail(plan.rail, plan.path);
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => rail.pose(i / SAMPLES).position);
  const doors = plan.placements.filter((p) => p.part === 'wall-3m-doorway');
  const panel = part('wall-3m-doorway');
  const half = panel.footprint[0] / 2;
  const face = bounds('wall-3m-doorway').max.z;
  expect(doors.length).toBeGreaterThan(0);

  // One panel at the origin; the walk is brought into each doorway's own frame instead.
  const mesh = new Mesh(greyboxGeometry(panel), new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld();
  const ray = new Raycaster();
  const through = new Vector3(0, 0, 1);
  const origin = new Vector3();
  // Straight through the panel along its normal: solid means the frame stands at (x, y).
  const solid = (x: number, y: number) => {
    ray.set(origin.set(x, y, -2), through);
    return ray.intersectObject(mesh).length > 0;
  };
  const toDoor = new Matrix4();
  const a = new Vector3();
  const b = new Vector3();
  const hit = new Vector3();
  const missed: string[] = [];

  for (const door of doors) {
    toDoor.fromArray(door.transform).invert();
    const local = samples.map((p) => p.clone().applyMatrix4(toDoor));
    let crosses = false;
    for (let i = 1; i < local.length && !crosses; i++) {
      a.copy(local[i - 1]);
      b.copy(local[i]);
      if (a.z === b.z || Math.sign(a.z) === Math.sign(b.z)) continue;
      hit.lerpVectors(a, b, Math.abs(a.z) / Math.abs(a.z - b.z));
      // Only a crossing strictly inside this panel's rectangle is the rail meeting this
      // doorway; the plane it lies in runs on through the rest of the villa.
      crosses = Math.abs(hit.x) < half && hit.y > 0 && hit.y < panel.height;
    }
    // From a clearance in front of the panel to a clearance past it, the camera and the
    // clearance beside it and over its head all have to be in the opening, not in the frame.
    const tight = local.some(
      (p) =>
        Math.abs(p.z) <= face + CLEARANCE_M &&
        Math.abs(p.x) < half &&
        [[0, 0], [-CLEARANCE_M, 0], [CLEARANCE_M, 0], [0, CLEARANCE_M]].some(([dx, dy]) => solid(p.x + dx, p.y + dy)),
    );
    if (!crosses || tight) missed.push(door.instance);
  }

  // None. Task fleet-vault moved the promenade onto the bay fill() opens, the exedra's two
  // off-axis doorways included, and the walk goes through the middle of every one. The tightest
  // is overhead where a stop is sunk a level: its entry panel stands on the lower floor while
  // the camera arrives at the upper floor's eye height, up to 2.82 m up the panel, which is what
  // sets the opening's height. The expectation was two doorways, then five, while this measured
  // a spline through the viewpoints alone.
  expect(missed).toEqual([]);
});

test('materials differ by category', () => {
  expect(greyboxMaterial(part('pool-basin-3x3')).color.getHex()).not.toBe(
    greyboxMaterial(part('wall-3m')).color.getHex(),
  );
  expect(greyboxMaterial(part('relief-a')).color.getHex()).toBe(0xd08a3c);
});
