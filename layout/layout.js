// layout/layout.js — pure and deterministic. Imports only from ./hash.js and ./rng.js.
import { canonical, fnv1a64 } from './hash.js';
import { mulberry32, int, pick } from './rng.js';

export const LAYOUT_VERSION = 1;
export const LEVEL_HEIGHT = 1; // metres dropped per stair run
export const EYE_HEIGHT = 1.7;
export const SIZES = { court: [9, 9], gallery: [9, 12], 'pool-hall': [9, 9], exedra: [6, 6], courtyard: [9, 6], terrace: [9, 6] };
export const HEADINGS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // dx, dz for heading 0:+z 1:+x 2:-z 3:-x

export class LayoutError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LayoutError';
    this.code = code;
  }
}

const fix = (n) => Number(n.toFixed(6));
const fwdOf = (h) => HEADINGS[h];
const rightOf = (h) => HEADINGS[(h + 1) % 4];

/** Grid cell keys covered by a stop footprint (2D; levels overlap in plan). */
export function footprintCells(x, z, h, w, d) {
  const fwd = fwdOf(h);
  const right = rightOf(h);
  const cells = [];
  for (let u = -w / 2; u < w / 2; u++) {
    for (let v = 0; v < d; v++) {
      const cx = x + right[0] * (u + 0.5) + fwd[0] * (v + 0.5);
      const cz = z + right[1] * (u + 0.5) + fwd[1] * (v + 0.5);
      cells.push(Math.floor(cx) + ',' + Math.floor(cz));
    }
  }
  return cells;
}

/** Where the next stop begins for a stop at (x, z, h) of size (w, d) exiting straight (0), right (1) or left (-1). */
export function exitFor(x, z, h, w, d, turn) {
  const fwd = fwdOf(h);
  const right = rightOf(h);
  if (turn === 0) return { x: x + fwd[0] * d, z: z + fwd[1] * d, h };
  const side = turn === 1 ? right : [-right[0], -right[1]];
  return {
    x: x + fwd[0] * (d / 2) + side[0] * (w / 2),
    z: z + fwd[1] * (d / 2) + side[1] * (w / 2),
    h: (h + turn + 4) % 4,
  };
}

/** Manifest stops to the full chain: court, room, courtyard, room, ..., courtyard, terrace. */
function expand(manifest, parts) {
  const entries = [];
  let courtyards = 0;
  for (const m of manifest.stops) {
    if (m.kind === 'court') {
      entries.push({ id: m.id, kind: 'court', archetype: 'court' });
    } else if (m.kind === 'project') {
      if (!SIZES[m.archetype]) throw new LayoutError('unknown_archetype', m.id + ': unknown archetype ' + m.archetype);
      const focal = parts.get(m.focal);
      if (!focal || focal.category !== 'focal') throw new LayoutError('unknown_focal', m.id + ': ' + m.focal + ' is not a focal part');
      const last = entries[entries.length - 1];
      if (last && last.kind === 'room') entries.push({ id: 'cy-' + ++courtyards, kind: 'courtyard', archetype: 'courtyard' });
      entries.push({ id: m.id, kind: 'room', archetype: m.archetype, focal: m.focal, title: m.title });
    } else if (m.kind === 'terrace') {
      entries.push({ id: 'cy-' + ++courtyards, kind: 'courtyard', archetype: 'courtyard' });
      entries.push({ id: m.id, kind: 'terrace', archetype: 'terrace' });
    } else {
      throw new LayoutError('unknown_kind', m.id + ': unknown stop kind ' + m.kind);
    }
  }
  return entries;
}

/** Place every stop on the grid, folding at every second courtyard and dropping a level at every third. */
export function sequence(manifest, parts) {
  const entries = expand(manifest, parts);
  const stops = [];
  const occupied = new Set();
  let x = 0;
  let z = 0;
  let h = 0;
  let level = 0;
  let courtyardIndex = 0;
  let turnCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const [w, d] = SIZES[e.archetype];
    const isLast = i === entries.length - 1;
    let preferredTurn = 0;
    let drop = false;
    if (e.kind === 'courtyard') {
      courtyardIndex++;
      if (courtyardIndex % 2 === 0) {
        turnCount++;
        preferredTurn = turnCount % 2 === 1 ? -1 : 1;
      }
      drop = courtyardIndex % 3 === 0;
    }
    const cells = footprintCells(x, z, h, w, d);
    if (cells.some((c) => occupied.has(c))) throw new LayoutError('no_placement', e.id + ': overlaps an earlier stop');

    const candidates = e.kind === 'courtyard' ? [preferredTurn, -preferredTurn, 0] : [0];
    let chosen = null;
    for (const turn of candidates.filter((t, k, arr) => arr.indexOf(t) === k)) {
      const exit = exitFor(x, z, h, w, d, turn);
      if (!isLast) {
        const [nw, nd] = SIZES[entries[i + 1].archetype];
        const next = footprintCells(exit.x, exit.z, exit.h, nw, nd);
        if (next.some((c) => occupied.has(c) || cells.includes(c))) continue;
      }
      chosen = { turn, exit };
      break;
    }
    if (!chosen) throw new LayoutError('no_placement', e.id + ': no non-overlapping exit');

    for (const c of cells) occupied.add(c);
    stops.push({ ...e, x, z, h, w, d, level, turn: chosen.turn, drop, hasEntry: i > 0, hasExit: !isLast, exit: chosen.exit });
    x = chosen.exit.x;
    z = chosen.exit.z;
    h = chosen.exit.h;
    if (drop) level -= 1;
  }
  return stops;
}
