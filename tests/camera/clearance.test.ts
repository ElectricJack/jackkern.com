import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';
import { architecturalDetails } from './detail-shapes';
// @ts-expect-error -- plain JS geometry helper, shared with tests/layout/sightlines.test.ts
import { boxDistance, worldShapes } from '../../tools/sightlines.mjs';

// The viewpoints say where the camera stops; the curve between them is what a visitor
// actually rides, and nothing else surveys it. Sample it densely and hold it to the
// walkable envelope: clear of everything solid, inside the stops, and through the doors.
const SAMPLES = 4000;
// What the tightest passage in the villa leaves. A room's focal piece stands on the axis
// 1.5 m in front of its exit doorway, and the next stop's colonnade puts a column against
// each jamb, so the camera has to be at least 1.05 m off the axis to clear the piece and at
// most 1.05 m off it to clear the jambs, with 1.5 m of depth to cross between the two. Even
// a straight diagonal only has 0.35 m of slack there and a smooth curve has less, so the bar
// is 0.25 m: two and a half times the 0.1 m near plane in src/main.ts, which is what it takes
// for nothing to clip. Raising it is a question about where fill() stands the focal piece.
const CLEARANCE_M = 0.25;
const DOOR_HALF_M = 0.75; // half a 3 m doorway bay: the camera keeps to the middle of the opening
// A doorway wall's stand-in in tools/sightlines.mjs is its frame, two jambs and a lintel round
// the opening, so the first test holds the walk clear of a doorway like any other wall. The
// third holds it to the middle of the bay the doorway stands in.
const DOORWAY = 'wall-3m-doorway';

const parts = new Map(contract.parts.map((p) => [p.id, p]));
const plan = layout(manifest as any, contract as any);
const shapes = worldShapes(plan, parts) as any[];
const rail = new Rail(plan.rail, plan.path);
const walk = Array.from({ length: SAMPLES + 1 }, (_, i) => rail.pose(i / SAMPLES).position.toArray());
const where = (shape: any) => `${shape.stop} ${shape.part} at ${shape.min.map((v: number) => v.toFixed(1)).join(',')}`;

test('the walk never comes within 0.25 m of anything solid', () => {
  const worst = new Map<string, number>();
  for (const point of walk) {
    for (const shape of shapes) {
      const gap = boxDistance(point, shape);
      if (gap >= CLEARANCE_M) continue;
      const key = `${shape.stop} ${shape.part}`;
      if (gap < (worst.get(key) ?? Infinity)) worst.set(key, gap);
    }
  }
  expect([...worst.entries()].sort().map(([k, gap]) => `${k} within ${gap.toFixed(2)}m`)).toEqual([]);
});

test('the walk stays inside the stops it links', () => {
  const boxes = Object.values(plan.bounds);
  const outside = walk.filter(
    (p) => !boxes.some((b) => [0, 1, 2].every((i) => p[i] >= b.min[i] - 1e-6 && p[i] <= b.max[i] + 1e-6)),
  );
  expect(outside.slice(0, 5).map((p) => p.map((v) => v.toFixed(2)).join(', '))).toEqual([]);
});

test('new arches, stone courses and stair balustrades leave the camera clear', () => {
  const details = architecturalDetails(plan);
  let nearest = Infinity;
  for (const point of walk) for (const detail of details) nearest = Math.min(nearest, boxDistance(point, detail));
  expect(nearest).toBeGreaterThanOrEqual(CLEARANCE_M);
});

test('the walk crosses every doorway through its opening', () => {
  const placements = plan.placements.filter((p) => p.part === DOORWAY);
  expect(placements.length).toBe(2 * manifest.stops.filter((s) => s.kind === 'project').length);
  for (const { instance, stop, part } of placements) {
    // The panel the opening is cut from: the box round every piece of the doorway's frame.
    const frame = shapes.filter((s) => s.instance === instance);
    const door = {
      stop,
      part,
      min: [0, 1, 2].map((i) => Math.min(...frame.map((s) => s.min[i]))),
      max: [0, 1, 2].map((i) => Math.max(...frame.map((s) => s.max[i]))),
    };
    const centre = [0, 1, 2].map((i) => (door.min[i] + door.max[i]) / 2);
    const crossings = walk.filter((p) => boxDistance(p, door) === 0);
    // Infinity for a doorway the walk never enters, which reads as plainly wrong as it is.
    const off = crossings.length
      ? Math.max(...crossings.map((p) => Math.hypot(p[0] - centre[0], p[2] - centre[2])))
      : Infinity;
    expect(`${where(door)}: crossed ${off.toFixed(2)}m off centre`)
      .toBe(`${where(door)}: crossed ${Math.min(off, DOOR_HALF_M).toFixed(2)}m off centre`);
  }
});
