import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, Raycaster, Vector3 } from 'three';
import contract from '../../kit/contract.json';
import assets from '../../kit/matter-assets.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { villaPlatform } from '../../src/scene/platform';
import { villaGardens } from '../../src/scene/gardens';
import { broadenCornice, corniceJoinery } from '../../src/scene/joinery';

const plan = layout(manifest, contract);

test('every column base has support across its entire footprint at its own floor height', () => {
  const supports = villaPlatform(plan);
  for (const p of plan.placements.filter(p => p.part === 'floor-slab-3x3')) {
    const mesh = new Mesh(new BoxGeometry(3, .1, 3).translate(0, -.05, 0));
    mesh.applyMatrix4(new Matrix4().fromArray(p.transform)); supports.add(mesh);
  }
  supports.updateMatrixWorld(true);
  const missing: string[] = [];
  for (const p of plan.placements.filter(p => p.part === 'column-doric')) {
    for (const x of [-.49, 0, .49]) for (const z of [-.49, 0, .49]) {
      const base = new Vector3(x, 0, z).applyMatrix4(new Matrix4().fromArray(p.transform));
      const hit = new Raycaster(base.clone().add(new Vector3(0, .03, 0)), new Vector3(0, -1, 0), 0, 2).intersectObject(supports)[0];
      if (!hit || Math.abs(hit.point.y - base.y) > .002) missing.push(`${p.instance} at ${x},${z}: ${hit?.point.y}`);
    }
  }
  expect(missing).toEqual([]);
});

test('the new doorway is closed above its arch and open through the passage', () => {
  const details = villaGardens(plan, false).root;
  const doors = new Group();
  for (const stop of details.children) for (const mesh of [...stop.children]) {
    if (['arch', 'pier', 'spandrel'].includes(mesh.name)) doors.add(mesh);
  }
  doors.updateMatrixWorld(true);
  const front = (x: number, y: number) => new Raycaster(new Vector3(x, y, 8), new Vector3(0, 0, 1), 0, 2).intersectObject(doors);
  for (const x of [-.9, -.5, 0, .5, .9]) {
    expect(front(x, 1.7)).toHaveLength(0);
    expect(front(x, 3.1).length).toBeGreaterThan(0);
  }
  // Both supports meet the vault without a daylight slit at spring height.
  for (const x of [-1.11, 1.11]) for (const y of [2.015, 2.02, 2.025]) expect(front(x, y).length).toBeGreaterThan(0);
});

test('perpendicular cornices butt against corner blocks without intersecting other beams', () => {
  const assembly = corniceJoinery(plan);
  const bounds = assets.parts['entablature-3m'].bounds;
  const native = new BoxGeometry(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  native.translate(0, (bounds.max[1] + bounds.min[1]) / 2, 0); broadenCornice(native);
  const boxes = plan.placements.filter(p => p.part === 'entablature-3m').map(p => ({
    name: p.instance, box: native.boundingBox!.clone().applyMatrix4(new Matrix4().fromArray(assembly.transforms.get(p.instance) ?? p.transform)),
  }));
  const details = villaGardens(plan, false).root;
  details.traverse(o => {
    if (!(o instanceof InstancedMesh) || o.name !== 'cornice') return;
    o.geometry.computeBoundingBox();
    for (let i = 0; i < o.count; i++) {
      const m = new Matrix4(); o.getMatrixAt(i, m);
      boxes.push({ name: `joint ${boxes.length}`, box: o.geometry.boundingBox!.clone().applyMatrix4(m) });
    }
  });
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const size = boxes[i].box.clone().intersect(boxes[j].box).getSize(new Vector3());
    if (Math.min(size.x, size.y, size.z) > .002) overlaps.push(`${boxes[i].name} / ${boxes[j].name}`);
  }
  expect(overlaps).toEqual([]);
});

test('pool coping begins above basin walls instead of sharing their inner faces', () => {
  const box = (p: typeof plan.placements[number]) => {
    const b = (assets.parts as any)[p.part].bounds;
    return new Box3(new Vector3(...b.min), new Vector3(...b.max)).applyMatrix4(new Matrix4().fromArray(p.transform));
  };
  const basins = plan.placements.filter(p => p.part === 'pool-basin-3x3');
  expect(basins).toHaveLength(6);
  for (const basin of basins) {
    const top = box(basin).max.y;
    const coping = plan.placements.filter(p => p.stop === basin.stop && p.part.startsWith('pool-edge-'));
    expect(coping.length).toBe(8);
    for (const p of coping) expect(box(p).min.y).toBeCloseTo(top, 3);
  }
});
