import { Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { EYE_HEIGHT, layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';
import { greyboxGeometry } from '../../src/kit/greybox';
import type { Part } from '../../src/types';

// A visitor's eye is 1.7 m over whatever they are standing on: the floor of a stop, or the
// stairs down to the next one. The viewpoints are all put there, but the curve between them is
// a spline, and where the walk changes level it goes wherever the spline takes it: down a whole
// level in a metre of ground, or under the stairs it is meant to be walking down. Nothing else
// holds the camera to what is under it, only to what is beside it (clearance.test.ts).
// 0.1 m either way is a tenth of the level a stair run goes down.
const TOLERANCE_M = 0.1;
const SAMPLES = 8000;
const STAIRS = 'stair-run-3m';

const parts = new Map(contract.parts.map((p) => [p.id, p as Part]));
const plan = layout(manifest, contract);
const rail = new Rail(plan.rail, plan.path);
const walk = Array.from({ length: SAMPLES + 1 }, (_, i) => rail.pose(i / SAMPLES).position.clone());

// What a visitor walks on, as src/kit/greybox.ts builds it: floor slabs and stair runs. Front
// faces only, the way the scene draws them, so a tread facing the wrong way is not walked on.
const ground = plan.placements
  .filter((p) => p.part === STAIRS || parts.get(p.part)!.category === 'floor')
  .map((p) => {
    const mesh = new Mesh(greyboxGeometry(parts.get(p.part)!), new MeshBasicMaterial());
    mesh.name = p.instance;
    mesh.applyMatrix4(new Matrix4().fromArray(p.transform));
    mesh.updateMatrixWorld();
    return mesh;
  });

test('the walk keeps the camera at eye height over the floor or stairs under it', () => {
  const ray = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const worst = new Map<string, number>();
  const walked = new Set<string>();
  const unsupported: string[] = [];

  for (const point of walk) {
    // Down from far overhead rather than from the camera, so a camera sunk into the stairs still
    // measures against their top and not against the floor under them.
    ray.set(new Vector3(point.x, 100, point.z), down);
    const [hit] = ray.intersectObjects(ground, false);
    if (!hit) {
      unsupported.push(point.toArray().map((v) => v.toFixed(2)).join(', '));
      continue;
    }
    walked.add(hit.object.name);
    const off = point.y - hit.point.y - EYE_HEIGHT;
    if (Math.abs(off) > Math.abs(worst.get(hit.object.name) ?? 0)) worst.set(hit.object.name, off);
  }

  expect(unsupported.slice(0, 5)).toEqual([]);
  // Interior stairs carry the route. The exterior arrival steps sit before the
  // start of the flight, outside the court's bounds, and are intentionally untraversed.
  const stairs = plan.placements.filter((p) => p.part === STAIRS && Object.values(plan.bounds).some((b) => [0, 2].every((axis) =>
    p.transform[12 + axis] >= b.min[axis] && p.transform[12 + axis] <= b.max[axis]
  ))).map((p) => p.instance);
  expect(stairs.length).toBeGreaterThan(0);
  expect(stairs.filter((instance) => walked.has(instance))).toEqual(stairs);
  expect(
    [...worst.entries()]
      .filter(([, off]) => Math.abs(off) > TOLERANCE_M)
      .map(([instance, off]) => `${instance}: camera ${(EYE_HEIGHT + off).toFixed(2)} m over it`),
  ).toEqual([]);
});
