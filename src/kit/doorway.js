// src/kit/doorway.js — the opening a threshold socket cuts in its wall.
//
// Plain JS, no three.js, so that src/kit/greybox.ts builds the mesh from it and
// tools/sightlines.mjs, which runs under bare node, builds its stand-in from the same numbers.

export const WALL_THICKNESS = 0.3;

/**
 * The hole a threshold socket cuts in its wall. The camera walks through every doorway at eye
 * height (1.7 m), never more than 0.41 m off its centre, so 2 m leaves the jambs well clear.
 * The height is set by a stop sunk a level below the one before it: its entry panel stands on
 * the lower floor while the camera arrives at the upper floor's eye height, and the walk crests
 * 2.82 m up that panel on its way through. 3.2 m keeps the lintel 0.38 m over the camera, past
 * the 0.25 m that tests/camera/clearance.test.ts and tests/kit/greybox.test.ts hold the frame to.
 */
export const DOORWAY_OPENING = { width: 2, height: 3.2 };

/** Narrowest jamb and shallowest lintel left standing when a part is too small for the full opening. */
const MIN_FRAME = 0.3;

/**
 * Where a part's threshold opens its wall, `height` tall as built, in the part's centred frame:
 * clear from x = `left` to x = `right` and from the floor up to y = `head`, with the jambs either
 * side and the lintel above standing solid. Null for a part with no threshold socket.
 *
 * @param {{ footprint: number[], sockets: { name: string, at: number[] }[] }} part
 * @param {number} height
 * @returns {{ left: number, right: number, head: number } | null}
 */
export function doorwayOpening(part, height) {
  const threshold = part.sockets.find((socket) => socket.name === 'threshold');
  if (!threshold) return null;
  const width = part.footprint[0];
  const half = width / 2;
  // Socket coordinates are measured from the footprint corner; geometry is centred on it.
  const centre = threshold.at[0] - half;
  const opening = Math.min(DOORWAY_OPENING.width, width - 2 * MIN_FRAME);
  return {
    left: Math.max(-half + MIN_FRAME, centre - opening / 2),
    right: Math.min(half - MIN_FRAME, centre + opening / 2),
    head: Math.min(DOORWAY_OPENING.height, height - MIN_FRAME),
  };
}
