import { MeshStandardMaterial } from 'three';
import { ART_PALETTES, ART_TECHNIQUES, paintingPixels, wallArtFactory } from '../../src/scene/wall-art';
import { buildScene } from '../../src/scene/builder';
import { GreyboxSource, KitLoader } from '../../src/kit/loader';
import { layout } from '../../layout/layout.js';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import type { Contract } from '../../src/types';

test('each room selects a distinct painting algorithm', () => {
  expect(ART_TECHNIQUES).toEqual({
    'matter-engine': 'mineral-strata', 'outrider-ide': 'knife-gestures',
    'agent-queue': 'flow-field', 'quilt-trader': 'woven-pigment',
  });
  for (const [room, technique] of Object.entries(ART_TECHNIQUES)) {
    const automatic = paintingPixels(room, 2, 48), explicit = paintingPixels(room, 2, 48, technique);
    expect(automatic.color.every((value, i) => value === explicit.color[i])).toBe(true);
  }
});

test('algorithms change the matte composition even with an identical palette and seed', () => {
  const paintings = Object.values(ART_TECHNIQUES).map(technique => paintingPixels('matter-engine', 3, 64, technique));
  for (let a = 0; a < paintings.length; a++) for (let b = a + 1; b < paintings.length; b++) {
    let matte = 0, different = 0;
    for (let i = 0; i < paintings[a].color.length; i += 4) {
      if (paintings[a].surface[i + 2] || paintings[b].surface[i + 2]) continue;
      matte++;
      if ([0, 1, 2].some(c => Math.abs(paintings[a].color[i + c] - paintings[b].color[i + c]) > 12)) different++;
    }
    expect(different / matte).toBeGreaterThan(.3);
  }
});

test('every hanging has a unique reproducible painting with a limited metallic gold form', () => {
  const signatures = new Set<string>();
  const hangings = layout(manifest, contract).placements.filter(p => p.part === 'wall-inset-panel');
  for (const hanging of hangings) {
    const room = hanging.stop, variant = Number(hanging.instance.split('.').at(-1));
    expect(ART_PALETTES[room]).toBeDefined();
    const a = paintingPixels(room, variant, 64), b = paintingPixels(room, variant, 64);
    expect(a.color.every((value, i) => value === b.color[i])).toBe(true);
    expect(a.surface.every((value, i) => value === b.surface[i])).toBe(true);
    signatures.add(a.color.join(','));
    let gold = 0, matte = 0, goldRoughness = 0, matteRoughness = 255;
    for (let i = 0; i < a.surface.length; i += 4) {
      if (a.surface[i + 2] > 200) {
        gold++;
        goldRoughness = Math.max(goldRoughness, a.surface[i + 1]);
      } else if (a.surface[i + 2] === 0) {
        matte++;
        matteRoughness = Math.min(matteRoughness, a.surface[i + 1]);
      }
    }
    expect(goldRoughness).toBeLessThan(115); // partially covered edge pixels blend with matte paint
    expect(matteRoughness).toBeGreaterThanOrEqual(234); // 8-bit edge rounding
    expect(gold / (64 * 64)).toBeGreaterThan(.015);
    expect(gold / (64 * 64)).toBeLessThan(.15);
    expect(matte / (64 * 64)).toBeGreaterThan(.8);
  }
  expect(signatures.size).toBe(hangings.length);
  expect(signatures.size).toBe(36);
});

test('art is lazy, shared across repeat visits, and uses smaller mobile maps', () => {
  const mobile = wallArtFactory(true), desktop = wallArtFactory(false);
  const art = mobile('matter-engine', 0);
  expect(mobile('matter-engine', 0)).toBe(art);
  expect(mobile('outrider-ide', 0)).not.toBe(art);
  const material = (art.material as MeshStandardMaterial[])[1];
  expect(material.map!.image.width).toBe(192);
  expect((desktop('matter-engine', 0).material as MeshStandardMaterial[])[1].map!.image.width).toBe(384);
  expect(material.metalnessMap).toBe(material.roughnessMap);
  expect(material.bumpMap).toBe(material.roughnessMap);
  expect(material.metalness).toBe(1);
});

test('paintings replace repeated wall reliefs only when their room is resident', async () => {
  const art = vi.fn(wallArtFactory(true));
  const source = new GreyboxSource(), load = vi.spyOn(source, 'load');
  const { stops } = buildScene(layout(manifest, contract), new KitLoader(contract as Contract, source), undefined, art);
  expect(art).not.toHaveBeenCalled();
  const room = stops.get('matter-engine')!;
  await room.load();
  expect(art).toHaveBeenCalledTimes(10);
  expect(load.mock.calls.some(([part]) => part.id === 'wall-inset-panel')).toBe(false);
  expect(room.group.children.filter(mesh => mesh.name.startsWith('wall-inset-panel:'))).toHaveLength(10);
  expect(new Set(art.mock.calls.map(([room, variant]) => `${room}:${variant}`)).size).toBe(10);
  room.unload();
  expect(room.group.children).toHaveLength(0);
});

test('Agent Queue uses its graph screenshot first', () => {
  expect(manifest.stops.find(stop => stop.id === 'agent-queue')!.screenshots).toEqual([
    './images/projects/agent-graph.webp', './images/projects/agent-queue.webp',
  ]);
});
