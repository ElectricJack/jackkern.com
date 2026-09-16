import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Shape, Vector2 } from 'three';
import type { Part } from '../types';

const COLORS: Record<Part['category'], number> = {
  structure: 0xd9d2c5,
  floor: 0xbdb5a6,
  water: 0x5d9bd1,
  dressing: 0x8f9a7a,
  focal: 0xd08a3c,
};

const WALL_THICKNESS = 0.3;

/**
 * The hole a threshold socket cuts in its wall. The camera rail is a spline through
 * eye-height (1.7 m) viewpoints and crosses a doorway up to 0.47 m off its centre and
 * 1.91 m up, so the opening is sized to clear that with room to spare.
 */
export const DOORWAY_OPENING = { width: 2, height: 2.8 };

/** Narrowest jamb and shallowest lintel left standing when a part is too small for the full opening. */
const MIN_FRAME = 0.3;

/**
 * A wall with its threshold cut out: two jambs and a lintel, extruded as one silhouette so it
 * still instances as a single geometry. `centre` is the opening's x in the part's centred frame.
 */
function doorwayGeometry(width: number, height: number, centre: number): BufferGeometry {
  const half = width / 2;
  const opening = Math.min(DOORWAY_OPENING.width, width - 2 * MIN_FRAME);
  const head = Math.min(DOORWAY_OPENING.height, height - MIN_FRAME);
  const left = Math.max(-half + MIN_FRAME, centre - opening / 2);
  const right = Math.min(half - MIN_FRAME, centre + opening / 2);
  const outline = new Shape([
    new Vector2(-half, 0),
    new Vector2(left, 0),
    new Vector2(left, head),
    new Vector2(right, head),
    new Vector2(right, 0),
    new Vector2(half, 0),
    new Vector2(half, height),
    new Vector2(-half, height),
  ]);
  return new ExtrudeGeometry(outline, { depth: WALL_THICKNESS, bevelEnabled: false, steps: 1 }).translate(0, 0, -WALL_THICKNESS / 2);
}

/**
 * A stair run as the slope its treads make: level with the floor it leaves along its back edge
 * (local -z), down `drop` at its foot (+z), extruded across its width.
 */
function rampGeometry(width: number, depth: number, drop: number): BufferGeometry {
  const profile = new Shape([new Vector2(-depth / 2, 0), new Vector2(-depth / 2, -drop), new Vector2(depth / 2, -drop)]);
  // The profile is drawn in (z, y) and extruded along +z; a quarter turn lays the extrusion across x.
  return new ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, steps: 1 }).rotateY(-Math.PI / 2).translate(width / 2, 0, 0);
}

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
    return rampGeometry(footprintWidth, footprintDepth, height);
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
    // Socket coordinates are measured from the footprint corner; geometry is centred on it.
    const threshold = part.sockets.find((socket) => socket.name === 'threshold');
    if (threshold) return doorwayGeometry(footprintWidth, height, threshold.at[0] - footprintWidth / 2);
    return new BoxGeometry(footprintWidth, height, WALL_THICKNESS).translate(0, height / 2, 0);
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
