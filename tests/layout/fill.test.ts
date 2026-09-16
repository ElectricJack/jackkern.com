import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { fill, sequence, worldTransform } from '../../layout/layout.js';
import { mulberry32 } from '../../layout/rng.js';

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
