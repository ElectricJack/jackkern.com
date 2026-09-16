import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { expect, test } from 'vitest';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import type { Contract } from '../../src/types';
import { GreyboxSource, KitLoader } from '../../src/kit/loader';
import { buildScene } from '../../src/scene/builder';

const plan = layout(manifest, contract);
const loader = () => new KitLoader(contract as Contract, new GreyboxSource());

test('buildScene makes one handle per stop in rail order and nothing is loaded yet', () => {
  const { root, stops, order } = buildScene(plan, loader());

  expect(order).toEqual(['entry', 'matter-engine', 'cy-1', 'outrider-ide', 'cy-2', 'agent-queue', 'cy-3', 'quilt-trader', 'cy-4', 'terrace']);
  expect(root.children.length).toBe(order.length);
  for (const h of stops.values()) {
    expect(h.loaded).toBe(false);
    expect(h.group.children.length).toBe(0);
  }
});

test('loading a stop creates one InstancedMesh per part with the placement transforms', async () => {
  const { stops } = buildScene(plan, loader());
  const entry = stops.get('entry')!;

  await entry.load();

  expect(entry.loaded).toBe(true);
  const meshes = entry.group.children as InstancedMesh[];
  const byPart = new Map(meshes.map((m) => [m.name, m]));
  const floors = entry.placements.filter((p) => p.part === 'floor-slab-3x3');
  expect(byPart.get('floor-slab-3x3')!.count).toBe(floors.length);
  const m = new Matrix4();
  byPart.get('floor-slab-3x3')!.getMatrixAt(0, m);
  expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual(floors[0].transform.slice(12, 15));

  entry.unload();

  expect(entry.loaded).toBe(false);
  expect(entry.group.children.length).toBe(0);
});

test('concurrent load calls share one build', async () => {
  const { stops } = buildScene(plan, loader());
  const h = stops.get('cy-1')!;

  await Promise.all([h.load(), h.load()]);

  const names = h.group.children.map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
});
