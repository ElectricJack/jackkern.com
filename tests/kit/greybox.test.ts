import { Box3, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';
import type { Part } from '../../src/types';
import { DOORWAY_OPENING, greyboxGeometry, greyboxMaterial } from '../../src/kit/greybox';

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

test('the camera walk crosses every doorway through the opening, not the frame', () => {
  const plan = layout(manifest, contract);
  // The curve the camera rides: the whole walk, not a spline through the viewpoints alone,
  // which cuts corners between stops and misses doorways the camera really goes through.
  const samples = new Rail(plan.rail, plan.path).curve.getPoints(20000);
  const doors = plan.placements.filter((p) => p.part === 'wall-3m-doorway');
  const panel = part('wall-3m-doorway');
  const half = panel.footprint[0] / 2;
  expect(doors.length).toBeGreaterThan(0);

  // One panel at the origin; each rail segment is brought into the doorway's own frame instead.
  const mesh = new Mesh(greyboxGeometry(panel), new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld();
  const ray = new Raycaster();
  const toDoor = new Matrix4();
  const a = new Vector3();
  const b = new Vector3();
  const hit = new Vector3();
  const heading = new Vector3();
  const missed: string[] = [];

  for (const door of doors) {
    toDoor.fromArray(door.transform).invert();
    let clears = false;
    b.copy(samples[0]).applyMatrix4(toDoor);
    for (let i = 1; i < samples.length; i++) {
      a.copy(b);
      b.copy(samples[i]).applyMatrix4(toDoor);
      if (a.z === b.z || Math.sign(a.z) === Math.sign(b.z)) continue;
      hit.lerpVectors(a, b, Math.abs(a.z) / Math.abs(a.z - b.z));
      // Only a crossing strictly inside this panel's rectangle is the rail meeting this
      // doorway; the plane it lies in runs on through the rest of the villa.
      if (Math.abs(hit.x) >= half || hit.y <= 0 || hit.y >= panel.height) continue;
      // Consecutive samples are millimetres apart, so carry the crossing a metre either way
      // to cover the full 0.3 m of wall the camera would have to pass through.
      heading.subVectors(b, a).normalize();
      ray.set(hit.clone().addScaledVector(heading, -1), heading);
      ray.far = 2;
      clears = ray.intersectObject(mesh).length === 0;
      break;
    }
    if (!clears) missed.push(door.instance);
  }

  // A doorway the walk never crosses inside its panel counts as missed too, so this holds the
  // walk to every doorway in the villa: each is crossed on its centre line, 1.7 m up, except
  // quilt-trader's entry, which the walk crosses 2.7 m up from the top of cy-3's stairs.
  expect(missed).toEqual([]);
});

test('materials differ by category', () => {
  expect(greyboxMaterial(part('pool-basin-3x3')).color.getHex()).not.toBe(
    greyboxMaterial(part('wall-3m')).color.getHex(),
  );
  expect(greyboxMaterial(part('relief-a')).color.getHex()).toBe(0xd08a3c);
});
