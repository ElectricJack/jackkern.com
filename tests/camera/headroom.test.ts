import { Box3, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';
import { greyboxGeometry } from '../../src/kit/greybox';
import type { Part } from '../../src/types';

// A visitor's eye is 1.7 m over the floor they cross a doorway on, and the opening is cut to
// leave more than a metre over that. The bar keeps 0.2 m of it for the curve to rise on its way
// through. A doorway stood a level lower than the visitor, on the floor at the foot of stairs
// they have yet to go down, loses the whole 1 m level from its headroom, and fails.
const HEADROOM_M = 0.9;
const SAMPLES = 8000;
const DOORWAY = 'wall-3m-doorway';

const part = contract.parts.find((p) => p.id === DOORWAY) as Part;
const plan = layout(manifest, contract);
const rail = new Rail(plan.rail, plan.path);
const walk = Array.from({ length: SAMPLES + 1 }, (_, i) => rail.pose(i / SAMPLES).position.clone());

test('the walk passes under every doorway lintel with at least 0.9 m over the camera', () => {
  const doors = plan.placements.filter((p) => p.part === DOORWAY);
  expect(doors.length).toBe(2 * manifest.stops.filter((s) => s.kind === 'project').length);

  // One panel at the origin, as src/kit/greybox.ts cuts it; the walk is brought into each
  // doorway's own frame instead. Under the lintel is wherever the camera is inside the panel.
  const geometry = greyboxGeometry(part);
  const panel = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  panel.updateMatrixWorld();
  const extent = new Box3().setFromBufferAttribute(geometry.getAttribute('position') as any);
  const ray = new Raycaster();
  const up = new Vector3(0, 1, 0);
  const toDoor = new Matrix4();
  const at = new Vector3();
  const tight: string[] = [];

  for (const door of doors) {
    toDoor.fromArray(door.transform).invert();
    let headroom = Infinity;
    for (const point of walk) {
      at.copy(point).applyMatrix4(toDoor);
      if (at.z <= extent.min.z || at.z >= extent.max.z || at.x <= extent.min.x || at.x >= extent.max.x) continue;
      // Up from under the panel, the first face met is the underside of what stands over the
      // camera: the lintel in the opening, a jamb beside it. Either way, less than nothing over
      // the camera reads as the fault it is.
      ray.set(new Vector3(at.x, extent.min.y - 1, at.z), up);
      const [hit] = ray.intersectObject(panel);
      headroom = Math.min(headroom, (hit ? hit.point.y : Infinity) - at.y);
    }
    if (headroom === Infinity) tight.push(`${door.instance}: never passed under`);
    else if (headroom < HEADROOM_M) tight.push(`${door.instance}: ${headroom.toFixed(2)} m over the camera`);
  }

  expect(tight).toEqual([]);
});
