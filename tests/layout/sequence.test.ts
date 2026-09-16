import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { LayoutError, footprintCells, sequence } from '../../layout/layout.js';

const parts = new Map(contract.parts.map((part) => [part.id, part] as const));

test('the chain alternates rooms and courtyards between the court and the terrace', () => {
  const ids = sequence(manifest, parts).map((s) => s.id);
  expect(ids).toEqual(['entry', 'matter-engine', 'cy-1', 'outrider-ide', 'cy-2', 'agent-queue', 'cy-3', 'quilt-trader', 'cy-4', 'terrace']);
});

test('every second courtyard turns, alternating, and every third drops a level', () => {
  const stops = sequence(manifest, parts);
  const cy = (id: string) => stops.find((s) => s.id === id)!;
  expect(cy('cy-1').turn).toBe(0);
  expect(cy('cy-2').turn).not.toBe(0);
  expect(cy('cy-4').turn).toBe(-cy('cy-2').turn);
  expect(cy('cy-3').drop).toBe(true);
  expect(cy('cy-1').drop).toBe(false);
  expect(stops.map((s) => s.level)).toEqual([0, 0, 0, 0, 0, 0, 0, -1, -1, -1]);
});

test('no two stops share a grid cell', () => {
  const stops = sequence(manifest, parts);
  const all = stops.flatMap((s) => footprintCells(s.x, s.z, s.h, s.w, s.d));
  expect(new Set(all).size).toBe(all.length);
});

test('each stop starts where the previous one exits', () => {
  const stops = sequence(manifest, parts);
  for (let i = 1; i < stops.length; i++) {
    expect([stops[i].x, stops[i].z, stops[i].h]).toEqual([stops[i - 1].exit.x, stops[i - 1].exit.z, stops[i - 1].exit.h]);
  }
  expect(stops[0].hasEntry).toBe(false);
  expect(stops[stops.length - 1].hasExit).toBe(false);
});

test('an unknown archetype or focal is a LayoutError with a code', () => {
  const bad = structuredClone(manifest) as any;
  bad.stops[1].archetype = 'ballroom';
  expect(() => sequence(bad, parts)).toThrow(LayoutError);
  try { sequence(bad, parts); } catch (e: any) { expect(e.code).toBe('unknown_archetype'); }
  const bad2 = structuredClone(manifest) as any;
  bad2.stops[1].focal = 'column-doric';
  try { sequence(bad2, parts); } catch (e: any) { expect(e.code).toBe('unknown_focal'); }
});
