import { expect, test } from 'vitest';
import { int, mulberry32, pick } from '../../layout/rng.js';

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const sequenceA = Array.from({ length: 5 }, () => a());
  const sequenceB = Array.from({ length: 5 }, () => b());

  expect(sequenceA).toEqual(sequenceB);
  for (const value of sequenceA) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
  expect(mulberry32(43)()).not.toBe(sequenceA[0]);
});

test('int is inclusive on both ends and pick returns members', () => {
  const rng = mulberry32(7);
  const seen = new Set<number>();
  for (let index = 0; index < 500; index++) seen.add(int(rng, 1, 3));
  expect([...seen].sort()).toEqual([1, 2, 3]);
  expect(['x', 'y']).toContain(pick(rng, ['x', 'y']));
});
