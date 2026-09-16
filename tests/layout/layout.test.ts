import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
// @ts-expect-error -- plain JS geometry helper, shared with tests/layout/sightlines.test.ts
import { worldShapes } from '../../tools/sightlines.mjs';

test('layout produces a hashed, complete document', () => {
  const plan = layout(manifest, contract);
  expect(plan.version).toBe(1);
  expect(plan.hash).toMatch(/^[0-9a-f]{16}$/);
  expect(plan.rail.map((v) => v.id)).toEqual([
    'entry-view', 'matter-engine-enter', 'matter-engine-focal', 'cy-1-view', 'outrider-ide-enter', 'outrider-ide-focal',
    'cy-2-view', 'agent-queue-enter', 'agent-queue-focal', 'cy-3-view', 'quilt-trader-enter', 'quilt-trader-focal', 'cy-4-view', 'terrace-view',
  ]);
  expect(plan.hotspots.length).toBe(plan.rail.length - 1);
  for (let i = 0; i < plan.hotspots.length; i++) {
    expect(plan.hotspots[i].from).toBe(plan.rail[i].id);
    expect(plan.hotspots[i].to).toBe(plan.rail[i + 1].id);
  }
  expect(Object.keys(plan.bounds).sort()).toEqual([...new Set(plan.placements.map((p) => p.stop))].sort());
});

test('the hash is stable across calls and sensitive to the seed', () => {
  expect(layout(manifest, contract).hash).toBe(layout(manifest, contract).hash);
  expect(layout(manifest, contract, 1).hash).not.toBe(layout(manifest, contract, 2).hash);
});

test('every viewpoint sits at eye height above its stop floor and inside its bounds', () => {
  const plan = layout(manifest, contract);
  for (const v of plan.rail) {
    const b = plan.bounds[v.stop];
    expect(v.position[1]).toBeCloseTo(b.min[1] + 0.2 + 1.7, 5);
    expect(v.position[0]).toBeGreaterThanOrEqual(b.min[0] - 1e-6);
    expect(v.position[0]).toBeLessThanOrEqual(b.max[0] + 1e-6);
    expect(v.position[2]).toBeGreaterThanOrEqual(b.min[2] - 1e-6);
    expect(v.position[2]).toBeLessThanOrEqual(b.max[2] + 1e-6);
  }
});

test('no viewpoint stands on a stair run: a stop entered down one is viewed from past its foot', () => {
  const plan = layout(manifest, contract);
  const stairs = worldShapes(plan, new Map(contract.parts.map((p) => [p.id, p]))).filter((s: any) => s.part === 'stair-run-3m');
  expect(stairs.length).toBeGreaterThan(0);
  for (const v of plan.rail) {
    const on = stairs.filter((s: any) => [0, 2].every((i) => v.position[i] > s.min[i] && v.position[i] < s.max[i]));
    expect(`${v.id} stands on ${on.length} stair runs`).toBe(`${v.id} stands on 0 stair runs`);
  }
});

test('unsupported versions are rejected by code', () => {
  expect(() => layout({ ...manifest, version: 2 } as any, contract)).toThrow(/manifest version/);
  expect(() => layout(manifest, { ...contract, version: 9 } as any)).toThrow(/contract version/);
});
