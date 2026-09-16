import { Box3 } from 'three';
import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import type { Part } from '../../src/types';
import { greyboxGeometry, greyboxMaterial } from '../../src/kit/greybox';

const part = (id: string) => contract.parts.find((candidate) => candidate.id === id) as Part;

test('a column is a vertical cylinder standing on y=0 with the contract height', () => {
  const geometry = greyboxGeometry(part('column-doric'));
  const box = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as any);

  expect(box.min.y).toBeCloseTo(0, 5);
  expect(box.max.y).toBeCloseTo(4, 5);
  expect(box.max.x - box.min.x).toBeLessThan(1);
});

test('a wall spans its footprint width and a floor slab hangs just below y=0', () => {
  const wall = new Box3().setFromBufferAttribute(
    greyboxGeometry(part('wall-3m')).getAttribute('position') as any,
  );
  expect(wall.max.x - wall.min.x).toBeCloseTo(3, 5);
  expect(wall.max.y).toBeCloseTo(4, 5);

  const floor = new Box3().setFromBufferAttribute(
    greyboxGeometry(part('floor-slab-3x3')).getAttribute('position') as any,
  );
  expect(floor.max.y).toBeCloseTo(0, 5);
  expect(floor.max.z - floor.min.z).toBeCloseTo(3, 5);
});

test('materials differ by category', () => {
  expect(greyboxMaterial(part('pool-basin-3x3')).color.getHex()).not.toBe(
    greyboxMaterial(part('wall-3m')).color.getHex(),
  );
  expect(greyboxMaterial(part('relief-a')).color.getHex()).toBe(0xd08a3c);
});
