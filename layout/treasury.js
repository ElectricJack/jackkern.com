import { treasuryPoses } from './treasury-poses.js';

/** Native Matter physics poses, transformed as a group with the room's vase.
 * Geometry is shared by all coins/bars; the website does no physics work. */
export function treasuryPlacements(focal) {
  return treasuryPoses.map(([kind, ...local], i) => {
    const a = focal.transform;
    const transform = Array.from({ length: 16 }, (_, index) => {
      const row = index % 4, col = Math.floor(index / 4);
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * local[col * 4 + k];
      return Number(sum.toFixed(6));
    });
    return { instance: `${focal.stop}.gold-${kind}.${i}`, part: `gold-${kind}`, stop: focal.stop, transform };
  });
}
