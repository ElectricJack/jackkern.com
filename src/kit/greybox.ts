import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, MeshStandardMaterial } from 'three';
import type { Part } from '../types';

const COLORS: Record<Part['category'], number> = {
  structure: 0xd9d2c5,
  floor: 0xbdb5a6,
  water: 0x5d9bd1,
  dressing: 0x8f9a7a,
  focal: 0xd08a3c,
};

/**
 * Stand-in shapes: enough silhouette to judge the layout, nothing more.
 * All stand on y=0 at their local origin, except floor and stairs which sit below it.
 */
export function greyboxGeometry(part: Part): BufferGeometry {
  const [footprintWidth, footprintDepth] = part.footprint;
  const height = Math.max(part.height, 0.1);

  if (part.id.startsWith('column')) {
    return new CylinderGeometry(0.4, 0.45, height, 16).translate(0, height / 2, 0);
  }
  if (part.id.startsWith('entablature')) {
    return new BoxGeometry(footprintWidth, 0.6, 0.6).translate(0, 0.3, 0);
  }
  if (part.id.startsWith('stair')) {
    return new BoxGeometry(footprintWidth, 1, footprintDepth).translate(0, -0.5, 0);
  }
  if (part.category === 'floor') {
    return new BoxGeometry(footprintWidth, 0.1, footprintDepth).translate(0, -0.05, 0);
  }
  if (part.category === 'water') {
    return part.id.startsWith('pool')
      ? new BoxGeometry(footprintWidth, 0.3, footprintDepth).translate(0, 0.15, 0)
      : new CylinderGeometry(0.5, 0.8, height, 12).translate(0, height / 2, 0);
  }
  if (part.category === 'structure') {
    return new BoxGeometry(footprintWidth, height, 0.3).translate(0, height / 2, 0);
  }

  return new BoxGeometry(footprintWidth * 0.7, height, footprintDepth * 0.7).translate(
    0,
    height / 2,
    0,
  );
}

export function greyboxMaterial(part: Part): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(COLORS[part.category]),
    roughness: 0.9,
    metalness: 0,
  });
}
