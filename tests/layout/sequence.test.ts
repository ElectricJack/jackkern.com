import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { LayoutError, boundsFor, entryLocal, exitLocal, footprintCells, sequence, thresholdOffset, worldPoint } from '../../layout/layout.js';

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
  // A stop is entered on the floor of the stop before it: quilt-trader at the head of cy-3's stairs.
  expect(stops.map((s) => s.entryLevel)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, -1, -1]);
});

test('no two stops share a grid cell', () => {
  const stops = sequence(manifest, parts);
  const all = stops.flatMap((s) => footprintCells(s.x, s.z, s.h, s.w, s.d));
  expect(new Set(all).size).toBe(all.length);
});

test('each stop is entered through the threshold the previous one leaves by', () => {
  const stops = sequence(manifest, parts);
  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1];
    const here = worldPoint(stops[i], ...entryLocal(stops[i]), 0);
    const there = worldPoint(previous, ...exitLocal(previous), 0);
    expect(`${stops[i].id} enters at ${here[0]},${here[2]} facing ${stops[i].h}`)
      .toBe(`${stops[i].id} enters at ${there[0]},${there[2]} facing ${previous.exit.h}`);
  }
  expect(stops[0].hasEntry).toBe(false);
  expect(stops[stops.length - 1].hasExit).toBe(false);
});

test('a side of an even number of bays is crossed a half bay past its centre', () => {
  // 3 m bays leave a joint on the middle of a 6 m or 12 m side and a bay on the middle of a 9 m one.
  expect([3, 6, 9, 12].map(thresholdOffset)).toEqual([0, 1.5, 0, 1.5]);
  const stops = sequence(manifest, parts);
  const exedra = stops.find((s) => s.archetype === 'exedra')!;
  expect([exedra.w, exedra.d]).toEqual([6, 6]);
  // The 6 m exedra is entered and left 1.5 m off its own centre line, through the same pair of bays.
  expect(entryLocal(exedra)).toEqual([1.5, 0]);
  expect(exitLocal(exedra)).toEqual([1.5, exedra.d]);
  // Turning out of a 6 m deep courtyard takes the far bay, not the column between the two.
  const turning = stops.filter((s) => s.turn !== 0);
  expect(turning.length).toBeGreaterThan(0);
  for (const stop of turning) expect(exitLocal(stop)[1]).toBe(stop.d / 2 + 1.5);
});

test('no two stops overlap in plan', () => {
  const stops = sequence(manifest, parts);
  const bounds = boundsFor(stops);
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const a = bounds[stops[i].id];
      const b = bounds[stops[j].id];
      const apart = a.max[0] <= b.min[0] || b.max[0] <= a.min[0] || a.max[2] <= b.min[2] || b.max[2] <= a.min[2];
      expect(`${stops[i].id} and ${stops[j].id} overlap: ${!apart}`).toBe(`${stops[i].id} and ${stops[j].id} overlap: false`);
    }
  }
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
