import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import type { Contract } from '../../src/types';
import { GreyboxSource, KitLoader } from '../../src/kit/loader';
import { buildScene } from '../../src/scene/builder';
import { Streamer, streamWindow } from '../../src/scene/streamer';

const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test('streamWindow keeps two ahead and three behind, clamped at the ends', () => {
  expect([...streamWindow(order, 0)]).toEqual(['a', 'b', 'c']);
  expect([...streamWindow(order, 4)]).toEqual(['b', 'c', 'd', 'e', 'f', 'g']);
  expect([...streamWindow(order, 6)]).toEqual(['d', 'e', 'f', 'g']);
});

test('Streamer loads the window and unloads what fell out of it', async () => {
  const plan = layout(manifest, contract);
  const { stops, order } = buildScene(plan, new KitLoader(contract as Contract, new GreyboxSource()));
  const streamer = new Streamer(stops, order);

  await streamer.update('entry');
  expect(order.filter((id) => stops.get(id)!.loaded)).toEqual(['entry', 'matter-engine', 'cy-1']);

  await streamer.update('agent-queue');
  expect(order.filter((id) => stops.get(id)!.loaded)).toEqual(['cy-1', 'outrider-ide', 'cy-2', 'agent-queue', 'cy-3', 'quilt-trader']);
  expect(stops.get('entry')!.loaded).toBe(false);

  await streamer.update('not-a-stop');
  expect(stops.get('agent-queue')!.loaded).toBe(true);
});
