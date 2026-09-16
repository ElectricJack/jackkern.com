// Reports the two geometry defects filed as eager-meadow, and proves their fix.
// Pure geometry over the layout document; no browser and no GPU needed.
//
//   node docs/verification/task-16/occlusion.mjs
//
// The stand-in shapes and the 55-degree frustum come from tools/sightlines.mjs, which
// mirrors src/kit/greybox.ts and src/main.ts, so these numbers are what the page renders.
import { readFileSync } from 'node:fs';
import { layout } from '../../../layout/layout.js';
import { survey } from '../../../tools/sightlines.mjs';

const manifest = JSON.parse(readFileSync('content/manifest.json', 'utf8'));
const contract = JSON.parse(readFileSync('kit/contract.json', 'utf8'));
const plan = layout(manifest, contract);
const parts = new Map(contract.parts.map((p) => [p.id, p]));
const { viewpoints, hotspots } = survey(plan, parts);

const CLEARANCE_M = 2.5; // no viewpoint should stand closer than this to what it looks at
const COVER_MAX = 0.25; // no single object should swamp the frame

const pct = (share) => `${(share * 100).toFixed(0)}%`;

console.log('hotspot marker occlusion (ray from the viewpoint to the marker anchor):\n');
let blocked = 0;
for (const { hotspot, distance, occluders, inFrame } of hotspots) {
  if (occluders.length || !inFrame) blocked++;
  const [first] = occluders;
  const verdict = first
    ? `BLOCKED by ${first.shape.part} (${first.shape.stop}) at ${(first.t * distance).toFixed(2)}m` +
      (occluders.length > 1 ? ` +${occluders.length - 1} more` : '')
    : inFrame ? 'clear' : 'OFF SCREEN';
  console.log(
    `${hotspot.from.padEnd(22)} -> ${hotspot.to.padEnd(22)} ${hotspot.label.padEnd(10)}` +
    ` anchor ${distance.toFixed(1)}m away  ${verdict}`,
  );
}
console.log(`\n${blocked}/${hotspots.length} hotspot markers are behind scene geometry or off screen.\n`);

// A room's own focal piece is what the room is for: it is the subject of both its viewpoints,
// and the enclosure itself (walls, columns, entablature, floors) is the room, not an obstacle.
// Everything else is scenery and must not swamp the frame.
const isSubject = (viewpoint, cover) =>
  cover.stop === viewpoint.stop && parts.get(cover.part).category === 'focal';
const isEnclosure = (cover) => ['structure', 'floor'].includes(parts.get(cover.part).category);

console.log('viewpoint framing (nearest part ahead within 45 degrees, and the largest object in frame):\n');
let tooClose = 0;
let swamped = 0;
for (const { viewpoint, nearest, covers } of viewpoints) {
  const object = covers.find((c) => !isEnclosure(c) && !isSubject(viewpoint, c));
  const subject = covers.find((c) => isSubject(viewpoint, c));
  if (nearest && nearest.distance < CLEARANCE_M) tooClose++;
  if (object && object.share > COVER_MAX) swamped++;
  console.log(
    `${viewpoint.id.padEnd(22)} nearest ${nearest ? `${nearest.part.padEnd(16)} ${nearest.distance.toFixed(2)}m` : 'none'.padEnd(22)}` +
    `  largest object ${object ? `${object.part.padEnd(16)} ${pct(object.share).padStart(4)}` : 'none'.padEnd(21)}` +
    (subject ? `  subject ${subject.part} ${pct(subject.share)}` : ''),
  );
}
console.log(
  `\n${tooClose}/${viewpoints.length} viewpoints stand closer than ${CLEARANCE_M}m to what is ahead of them;` +
  ` ${swamped}/${viewpoints.length} have an object covering more than ${pct(COVER_MAX)} of the viewport.\n`,
);

process.exitCode = blocked + tooClose + swamped === 0 ? 0 : 1;
