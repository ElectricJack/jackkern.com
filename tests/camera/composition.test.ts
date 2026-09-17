import manifest from '../../content/manifest.json';
import contract from '../../kit/contract.json';
import { layout } from '../../layout/layout.js';
import { Rail } from '../../src/camera/rail';
import { architecturalDetails } from './detail-shapes';
// @ts-expect-error -- shared pure geometry helpers mirror the rendered grey-box pieces
import { worldShapes, rayHitsBox, viewBasis } from '../../tools/sightlines.mjs';

const parts = new Map(contract.parts.map((p) => [p.id, p]));
const plan = layout(manifest, contract);
const rail = new Rail(plan.rail, plan.path);
const shapes = [...worldShapes(plan, parts), ...architecturalDetails(plan)];

test.each([1280 / 720, 390 / 844])('the moving view avoids blank-wall compositions at aspect %s', (aspect) => {
  // Survey the actual in-between poses, with occlusion, at quarter-metre intervals. Checking
  // landmarks alone missed the old courtyard shots dominated by the next room's wall.
  const tanY = Math.tan(55 * Math.PI / 360) / Math.min(1, aspect);
  const failures: string[] = [];
  for (let m = 0; m < rail.length; m += 0.25) {
    const { position, target } = rail.pose(m / rail.length);
    const eye = position.toArray(), basis = viewBasis({ position: eye, target: target.toArray() });
    let walls = 0, subjects = 0, centreWalls = 0;
    for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) {
      const yOffset = aspect < 1 ? -0.24 : 0; // Same 12% downward frustum shift as the portrait camera.
      const end = eye.map((v, k) => v + 40 * (basis.forward[k] + basis.right[k] * x / 5 * tanY * aspect + basis.up[k] * (y / 3 + yOffset) * tanY));
      let nearest = 1, part = '';
      for (const shape of shapes) {
        const t = rayHitsBox(eye, end, shape);
        if (t !== null && t < nearest) { nearest = t; part = shape.part; }
      }
      if (part === 'wall-3m' || part === 'wall-3m-doorway') { walls++; if (Math.abs(x) < 2 && Math.abs(y) < 2) centreWalls++; }
      if (part === 'architectural-detail' || ['water', 'focal', 'dressing'].includes(parts.get(part)?.category ?? '')) subjects++;
    }
    if ((walls / 77 > 0.55 && subjects / 77 < 0.06) || (centreWalls / 9 > 0.8 && subjects / 77 < 0.1)) failures.push(`${m.toFixed(1)}m: wall ${(100 * walls / 77).toFixed(0)}%, subject ${(100 * subjects / 77).toFixed(0)}%`);
  }
  expect(failures).toEqual([]);
}, 15000);
