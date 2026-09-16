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

const DRESSING_BUDGET = { court: 6, gallery: 4, 'pool-hall': 4, exedra: 2, courtyard: 4, terrace: 4 };
const DRESSING_PARTS = ['urn-small', 'planter-square', 'statue-a'];
const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

export function worldPoint(stop, u, v, y) {
  const fwd = fwdOf(stop.h);
  const right = rightOf(stop.h);
  return [
    fix(stop.x + right[0] * u + fwd[0] * v),
    fix(stop.level * LEVEL_HEIGHT + y),
    fix(stop.z + right[1] * u + fwd[1] * v),
  ];
}

/** Column-major 4x4: yaw of (stop.h + localQ) quarter turns about +y, then translate. */
export function worldTransform(stop, u, v, y, localQ) {
  const [x, wy, z] = worldPoint(stop, u, v, y);
  const q = (stop.h + localQ) % 4;
  const c = COS[q];
  const s = SIN[q];
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, wy, z, 1];
}

/** Local (u, v) of the exit threshold centre. */
export function exitLocal(stop) {
  if (stop.turn === 0) return [0, stop.d];
  return [stop.turn === 1 ? stop.w / 2 : -stop.w / 2, stop.d / 2];
}

/** Each side yields 3 m segments as { u, v, localQ, index } in local coords. */
function sideSegments(stop, side) {
  const { w, d } = stop;
  const out = [];
  if (side === 'back' || side === 'front') {
    const v = side === 'back' ? 0 : d;
    for (let i = 0; i < w / 3; i++) out.push({ u: -w / 2 + 1.5 + 3 * i, v, localQ: 0, index: i });
  } else {
    const u = side === 'left' ? -w / 2 : w / 2;
    for (let i = 0; i < d / 3; i++) out.push({ u, v: 1.5 + 3 * i, localQ: 1, index: i });
  }
  return out;
}

function sideStatus(stop) {
  const open = stop.kind !== 'room';
  const exitSide = !stop.hasExit ? null : stop.turn === 0 ? 'front' : stop.turn === 1 ? 'right' : 'left';
  const status = {};
  for (const side of ['back', 'front', 'left', 'right']) {
    const threshold = (side === 'back' && stop.hasEntry) || side === exitSide;
    status[side] = threshold ? 'door' : open ? 'open' : 'wall';
  }
  return status;
}

export function fill(stop, parts, rng) {
  const out = [];
  const counters = new Map();
  const place = (partId, u, v, localQ = 0, y = 0) => {
    if (!parts.has(partId)) throw new LayoutError('unknown_part', stop.id + ': part ' + partId + ' is not in the contract');
    const n = (counters.get(partId) || 0) + 1;
    counters.set(partId, n);
    out.push({ instance: stop.id + '.' + partId + '.' + n, part: partId, stop: stop.id, transform: worldTransform(stop, u, v, y, localQ) });
  };
  const { w, d, archetype } = stop;
  const columnHeight = parts.get('column-doric').height;
  const columns = new Set();
  const column = (u, v) => {
    const key = u + ',' + v;
    if (columns.has(key)) return;
    columns.add(key);
    place('column-doric', u, v, 0, 0);
  };
  const open = stop.kind !== 'room';

  // Floors.
  for (let i = 0; i < w / 3; i++) for (let j = 0; j < d / 3; j++) place('floor-slab-3x3', -w / 2 + 1.5 + 3 * i, 1.5 + 3 * j, 0, 0);

  // Perimeter.
  const status = sideStatus(stop);
  for (const side of ['back', 'front', 'left', 'right']) {
    const segments = sideSegments(stop, side);
    const middle = Math.floor(segments.length / 2);
    for (const seg of segments) {
      if (open) {
        // Column run with entablature; the doorway is simply the gap between columns.
        const along = seg.localQ === 0 ? [seg.u - 1.5, seg.u + 1.5] : [seg.v - 1.5, seg.v + 1.5];
        if (seg.localQ === 0) {
          column(along[0], seg.v);
          column(along[1], seg.v);
        } else {
          column(seg.u, along[0]);
          column(seg.u, along[1]);
        }
        place('entablature-3m', seg.u, seg.v, seg.localQ, columnHeight);
      } else if (status[side] === 'door' && seg.index === middle) {
        place('wall-3m-doorway', seg.u, seg.v, seg.localQ, 0);
      } else {
        place('wall-3m', seg.u, seg.v, seg.localQ, 0);
      }
    }
  }

  // Interior column rows for the long rooms.
  if (archetype === 'gallery' || archetype === 'pool-hall') {
    for (const u of [-3, 3]) {
      const rows = d / 3;
      for (let j = 0; j < rows; j++) column(u, 1.5 + 3 * j);
      for (let j = 0; j + 1 < rows; j++) place('entablature-3m', u, 3 + 3 * j, 1, columnHeight);
    }
  }

  // Water.
  if (archetype === 'pool-hall' || archetype === 'courtyard' || archetype === 'court') {
    place('pool-basin-3x3', 0, d / 2, 0, 0);
    if (archetype !== 'pool-hall') place('fountain-tiered', 0, d / 2, 0, 0);
  }

  // Stairs at the exit of a dropping courtyard.
  if (stop.drop) {
    const [eu, ev] = exitLocal(stop);
    const q = stop.turn === 0 ? 0 : 1;
    const along = stop.turn === 0 ? [0, 1.5] : [stop.turn * 1.5, 0];
    place('stair-run-3m', eu + along[0], ev + along[1], q, 0);
  }

  // Focal object at the far wall on the rail axis.
  if (stop.kind === 'room') place(stop.focal, 0, d - 1.5, 0, 0);

  // Dressing along the side walls, away from thresholds.
  const slots = [];
  for (const u of [-(w / 2 - 0.75), w / 2 - 0.75]) {
    for (let v = 1.5; v <= d - 1.5; v += 1.5) {
      const sideIsDoor = (u < 0 && status.left === 'door') || (u > 0 && status.right === 'door');
      if (sideIsDoor && Math.abs(v - d / 2) < 2) continue;
      slots.push([u, v]);
    }
  }
  for (let n = 0; n < DRESSING_BUDGET[archetype] && slots.length; n++) {
    const [uu, vv] = slots.splice(int(rng, 0, slots.length - 1), 1)[0];
    place(pick(rng, DRESSING_PARTS), uu, vv, 0, 0);
  }

  return out;
}
