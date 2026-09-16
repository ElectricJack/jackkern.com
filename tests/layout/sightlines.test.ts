import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
// @ts-expect-error -- plain JS geometry helper, shared with docs/verification/task-16/occlusion.mjs
import { survey } from '../../tools/sightlines.mjs';

const CLEARANCE_M = 2.5;
const COVER_MAX = 0.25;

const parts = new Map(contract.parts.map((p) => [p.id, p]));
const plan = layout(manifest as any, contract as any);
const { viewpoints, hotspots } = survey(plan, parts);

test('every hotspot marker is on screen and unobstructed from the viewpoint it belongs to', () => {
  expect(hotspots.length).toBe(plan.hotspots.length);
  for (const { hotspot, occluders, inFrame } of hotspots) {
    const where = `${hotspot.from} -> ${hotspot.to}`;
    expect(`${where}: ${occluders.map((o: any) => o.shape.part).join(', ') || 'clear'}`).toBe(`${where}: clear`);
    expect(`${where} on screen: ${inFrame}`).toBe(`${where} on screen: true`);
  }
});

test('no viewpoint stands closer than 2.5 m to the part it looks at', () => {
  for (const { viewpoint, nearest } of viewpoints) {
    const distance = nearest ? nearest.distance : Infinity;
    expect(`${viewpoint.id}: ${nearest?.part ?? 'none'} at ${distance.toFixed(2)}m`)
      .toBe(`${viewpoint.id}: ${nearest?.part ?? 'none'} at ${Math.max(distance, CLEARANCE_M).toFixed(2)}m`);
  }
});

test('nothing but the stop it belongs to swamps the frame', () => {
  // The enclosure is the room, and a room's focal piece is its subject; everything else is
  // scenery and must leave the composition room to breathe.
  const isEnclosure = (cover: any) => ['structure', 'floor'].includes(parts.get(cover.part)!.category);
  const isSubject = (viewpoint: any, cover: any) =>
    cover.stop === viewpoint.stop && parts.get(cover.part)!.category === 'focal';
  for (const { viewpoint, covers } of viewpoints) {
    const worst = covers.find((c: any) => !isEnclosure(c) && !isSubject(viewpoint, c));
    if (!worst) continue;
    expect(`${viewpoint.id}: ${worst.part} covers ${(worst.share * 100).toFixed(0)}%`)
      .toBe(`${viewpoint.id}: ${worst.part} covers ${(Math.min(worst.share, COVER_MAX) * 100).toFixed(0)}%`);
  }
});
