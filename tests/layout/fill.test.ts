import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { entryLocal, exitLocal, fill, sequence, worldPoint, worldTransform } from '../../layout/layout.js';
import { mulberry32 } from '../../layout/rng.js';
// @ts-expect-error -- plain JS geometry helper, shared with docs/verification/task-16/occlusion.mjs
import { rayHitsBox, worldShape } from '../../tools/sightlines.mjs';

const parts = new Map(contract.parts.map((p) => [p.id, p]));
const stops = sequence(manifest, parts);
const byId = (id: string) => stops.find((s) => s.id === id)!;
const placementsOf = (id: string) => fill(byId(id), parts, mulberry32(1));

test('worldTransform is column-major with quarter-turn yaw', () => {
  const stop = { x: 10, z: 20, h: 0, level: -1 } as any;
  expect(worldTransform(stop, 1, 2, 0.5, 0)).toEqual([1, 0, -0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 11, -0.5, 22, 1]);
  // heading 1 (+x): local u maps to -z, local v maps to +x
  expect(worldTransform({ x: 0, z: 0, h: 1, level: 0 } as any, 1, 2, 0, 0).slice(12, 15)).toEqual([2, 0, -1]);
});

test('every placement names a contract part and instance ids are unique and filename-safe', () => {
  const all = stops.flatMap((s) => fill(s, parts, mulberry32(1)));
  expect(all.length).toBeGreaterThan(50);
  for (const p of all) expect(parts.has(p.part)).toBe(true);
  expect(new Set(all.map((p) => p.instance)).size).toBe(all.length);
  for (const p of all) expect(p.instance).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+\.\d+$/);
});

test('a room gets floor slabs, a doorway on each threshold side, walls elsewhere, and one focal at the far wall', () => {
  const p = placementsOf('outrider-ide');
  const stop = byId('outrider-ide');
  const of = (part: string) => p.filter((x) => x.part === part);
  expect(of('floor-slab-3x3').length).toBe((stop.w / 3) * (stop.d / 3));
  expect(of('wall-3m-doorway').length).toBe(2);
  expect(of('wall-3m').length).toBeGreaterThan(0);
  const focal = of('statue-b');
  expect(focal.length).toBe(1);
  expect(focal[0].transform.slice(12, 15)).toEqual(worldTransform(stop, 0, stop.d - 1.5, 0, 0).slice(12, 15));
});

test('an open stop gets columns and entablature, no walls, and a courtyard gets a pool and fountain', () => {
  const p = placementsOf('cy-1');
  const of = (part: string) => p.filter((x) => x.part === part);
  expect(of('wall-3m').length).toBe(0);
  expect(of('column-doric').length).toBeGreaterThan(4);
  expect(of('entablature-3m').length).toBeGreaterThan(0);
  expect(of('pool-basin-3x3').length).toBe(1);
  expect(of('fountain-tiered').length).toBe(1);
});

test('a dropping courtyard places a stair run at its exit', () => {
  expect(placementsOf('cy-3').filter((x) => x.part === 'stair-run-3m').length).toBe(1);
  expect(placementsOf('cy-1').filter((x) => x.part === 'stair-run-3m').length).toBe(0);
});

test('fill is deterministic for the same seed', () => {
  expect(placementsOf('entry')).toEqual(placementsOf('entry'));
});

test('a threshold is an opening: the doorway is centred on it and nothing else stands in the way', () => {
  // Every plan is 3 m bays, so a side of an even number of bays has a joint on its middle -- a
  // wall seam, or the column that ends both runs. Step through each threshold at chest height and
  // let nothing but the doorway that belongs to it be in the way.
  const REACH = 0.75; // half a bay: through the 0.3 m wall plane and past a 0.9 m column
  const CHEST = 1.5; // above this stop's floor, and above the floor a dropped neighbour stands on
  const shapes = stops.flatMap((s) => fill(s, parts, mulberry32(1))).map((p) => worldShape(p, parts.get(p.part)!));
  const crossings = stops.flatMap((stop) => [
    ...(stop.hasEntry ? [{ stop, at: entryLocal(stop), step: [0, REACH] }] : []),
    ...(stop.hasExit ? [{ stop, at: exitLocal(stop), step: stop.turn === 0 ? [0, -REACH] : [-stop.turn * REACH, 0] }] : []),
  ]);
  expect(crossings.length).toBe(2 * stops.length - 2);
  for (const { stop, at, step } of crossings) {
    const from = worldPoint(stop, at[0] + step[0], at[1] + step[1], CHEST);
    const to = worldPoint(stop, at[0] - step[0], at[1] - step[1], CHEST);
    const centre = worldPoint(stop, at[0], at[1], 0);
    const blocked = shapes
      .filter((shape: any) => rayHitsBox(from, to, shape) !== null)
      .filter((shape: any) => !(shape.part === 'wall-3m-doorway' && shape.min[0] + shape.max[0] === 2 * centre[0] && shape.min[2] + shape.max[2] === 2 * centre[2]));
    const where = `${stop.id} at ${centre[0]},${centre[2]}`;
    expect(`${where}: ${blocked.map((s: any) => `${s.stop} ${s.part}`).join(', ') || 'open'}`).toBe(`${where}: open`);
  }
});

test('a room opens its threshold sides on the bay the rail crosses', () => {
  for (const stop of stops.filter((s) => s.kind === 'room')) {
    const doors = fill(stop, parts, mulberry32(1))
      .filter((p) => p.part === 'wall-3m-doorway')
      .map((p) => p.transform.slice(12, 15).join(','));
    const wanted = [
      worldPoint({ ...stop, level: stop.entryLevel }, ...entryLocal(stop), 0).join(','),
      worldPoint(stop, ...exitLocal(stop), 0).join(','),
    ].filter((_, i) => (i === 0 ? stop.hasEntry : stop.hasExit));
    expect(`${stop.id}: ${doors.sort().join(' ')}`).toBe(`${stop.id}: ${wanted.sort().join(' ')}`);
  }
});

test('a stop sunk a level is entered through a doorway at the head of the stair run, on the floor above', () => {
  // The visitor crosses the threshold before going down the stairs fill() stands just past it,
  // so the doorway over it stands where the stair run starts, not on the floor it runs down to.
  const sunk = stops.filter((stop, i) => i > 0 && stops[i - 1].drop && stop.kind === 'room');
  expect(sunk.length).toBeGreaterThan(0);
  for (const stop of sunk) {
    const above = stops[stops.indexOf(stop) - 1];
    const [stairs] = placementsOf(above.id).filter((p) => p.part === 'stair-run-3m');
    const [x, , z] = worldPoint(stop, ...entryLocal(stop), 0);
    const [door] = placementsOf(stop.id).filter((p) => p.part === 'wall-3m-doorway' && p.transform[12] === x && p.transform[14] === z);
    expect(door, `${stop.id} has an entry doorway`).toBeDefined();
    expect(stop.level).toBe(above.level - 1);
    expect(`${stop.id} entry doorway stands at y ${door.transform[13]}`).toBe(`${stop.id} entry doorway stands at y ${stairs.transform[13]}`);
    expect(stairs.transform[13]).toBe(worldPoint(above, 0, 0, 0)[1]);
  }
});
