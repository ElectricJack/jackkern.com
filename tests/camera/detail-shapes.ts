import { Box3, InstancedMesh, Matrix4, Vector3 } from 'three';
import { villaGardens } from '../../src/scene/gardens';
import type { Layout } from '../../src/types';
import { ARCH } from '../../src/scene/door-surround';

/** Use the rendered masonry, rather than treating the new reliefs and arches as
 * blank wall. Each voussoir has its own box, so the aperture stays open. */
export function architecturalDetails(plan: Layout) {
  const { root } = villaGardens(plan, false);
  const shapes: { part: string; min: number[]; max: number[] }[] = [];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof InstancedMesh) || !['stone', 'marble', 'arch', 'pier', 'cornice', 'spandrel', 'quoin'].includes(object.name)) return;
    const geometry = object.geometry, boxes: Box3[] = [];
    if (object.name === 'arch') {
      const positions = geometry.getAttribute('position');
      for (let start = 0; start < ARCH.segments * 24; start += 24) {
        const box = new Box3();
        for (let i = start; i < start + 24; i++) box.expandByPoint(new Vector3().fromBufferAttribute(positions, i));
        boxes.push(box);
      }
    } else {
      geometry.computeBoundingBox();
      boxes.push(geometry.boundingBox!);
    }
    for (let i = 0; i < object.count; i++) {
      const matrix = new Matrix4();
      object.getMatrixAt(i, matrix);
      matrix.premultiply(object.matrixWorld);
      for (const box of boxes) {
        const world = box.clone().applyMatrix4(matrix);
        shapes.push({ part: 'architectural-detail', min: world.min.toArray(), max: world.max.toArray() });
      }
    }
  });
  return shapes;
}
