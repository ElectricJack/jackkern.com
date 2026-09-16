import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import type { Contract, Part } from '../../src/types';
import {
  GreyboxSource,
  KitLoader,
  bakeStampMatches,
  type AssetsManifest,
  type KitSource,
} from '../../src/kit/loader';

test('KitLoader loads each part once and shares the asset', async () => {
  let calls = 0;
  const counting: KitSource = {
    load: async (part: Part) => {
      calls++;
      return new GreyboxSource().load(part);
    },
  };
  const loader = new KitLoader(contract as Contract, counting);

  const [a, b] = await Promise.all([loader.get('column-doric'), loader.get('column-doric')]);

  expect(a).toBe(b);
  expect(calls).toBe(1);
  expect(loader.part('wall-3m').footprint).toEqual([3, 1]);
  expect(() => loader.part('nope')).toThrow('unknown part nope');
});

test('bakeStampMatches requires a matching layout hash on the bake file', () => {
  const assets: AssetsManifest = {
    version: 1,
    files: {
      'bake/entry.column-doric.1.lightmap.ktx2': { bytes: 10, hash: 'x', layout_hash: 'abc' },
      'kit/column-doric.obj': { bytes: 10, hash: 'y' },
    },
  };

  expect(bakeStampMatches(assets, 'entry.column-doric.1', 'abc')).toBe(true);
  expect(bakeStampMatches(assets, 'entry.column-doric.1', 'def')).toBe(false);
  expect(bakeStampMatches(assets, 'entry.column-doric.2', 'abc')).toBe(false);
});
