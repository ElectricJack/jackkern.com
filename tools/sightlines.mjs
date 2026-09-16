// tools/sightlines.mjs — what a camera standing at a viewpoint can actually see.
//
// Pure geometry, no renderer. The stand-in shapes mirror src/kit/greybox.ts part for
// part, and the frustum mirrors the PerspectiveCamera in src/main.ts, so "clear" here
// means a marker you can see in the browser and "covers 19% of the viewport" means it.

export const FOV_Y = 55; // degrees; src/main.ts: new PerspectiveCamera(55, ...)
export const ASPECT = 1280 / 720; // the checklist runs Chromium at 1280x720
export const NEAR = 0.1;
// #panels is 420px wide against the right edge (src/styles.css), so the 3D is seen through
// x < 860 of 1280. Coverage is measured over that window, the way a visitor sees it.
export const PANEL_X = 860;
const VIEW_RIGHT = (2 * PANEL_X) / 1280 - 1;

const TAU = Math.PI * 2;
const TAN_HALF_Y = Math.tan((FOV_Y / 2) * (Math.PI / 180));

/** A convex stand-in as corner points plus the edges between them, in the part's local frame. */
function box(w, h, d, y0) {
  const points = [];
  for (const x of [-w / 2, w / 2]) for (const y of [y0, y0 + h]) for (const z of [-d / 2, d / 2]) points.push([x, y, z]);
  // points are indexed x*4 + y*2 + z; an edge joins two corners differing in one bit.
  const edges = [];
  for (let i = 0; i < 8; i++) for (const bit of [4, 2, 1]) if ((i & bit) === 0) edges.push([i, i | bit]);
  return { points, edges };
}

/** A stair run's ramp: level with y=0 along its back edge (-z), h down at its foot (+z). */
function ramp(w, d, h) {
  const points = [];
  for (const x of [-w / 2, w / 2]) points.push([x, 0, -d / 2], [x, -h, -d / 2], [x, -h, d / 2]);
  // Two triangular ends, indexed x*3 + corner, and the three edges that run across between them.
  const edges = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]];
  return { points, edges };
}

function cylinder(segments, radiusBottom, radiusTop, y0, h) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    points.push([radiusBottom * Math.cos(a), y0, radiusBottom * Math.sin(a)]);
  }
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * TAU;
    points.push([radiusTop * Math.cos(a), y0 + h, radiusTop * Math.sin(a)]);
  }
  const edges = [];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    edges.push([i, next], [segments + i, segments + next], [i, segments + i]);
  }
  return { points, edges };
}

/** The stand-in three.js builds for a part. Mirrors greyboxGeometry in src/kit/greybox.ts. */
export function standIn(part) {
  const [footprintWidth, footprintDepth] = part.footprint;
  const height = Math.max(part.height, 0.1);
  if (part.id.startsWith('column')) return cylinder(16, 0.45, 0.4, 0, height);
  if (part.id.startsWith('entablature')) return box(footprintWidth, 0.6, 0.6, 0);
  if (part.id.startsWith('stair')) return ramp(footprintWidth, footprintDepth, height);
  if (part.category === 'floor') return box(footprintWidth, 0.1, footprintDepth, -0.1);
  if (part.category === 'water') {
    return part.id.startsWith('pool')
      ? box(footprintWidth, 0.3, footprintDepth, 0)
      : cylinder(12, 0.8, 0.5, 0, height);
  }
  if (part.category === 'structure') return box(footprintWidth, height, 0.3, 0);
  return box(footprintWidth * 0.7, height, footprintDepth * 0.7, 0);
}

/** A placement's stand-in in world space, with the axis-aligned box that encloses it. */
export function worldShape(placement, part) {
  const m = placement.transform; // column-major, quarter-turn yaw about +y
  const [c, s] = [m[0], m[8]];
  const [tx, ty, tz] = [m[12], m[13], m[14]];
  const local = standIn(part);
  const points = local.points.map(([x, y, z]) => [c * x + s * z + tx, y + ty, -s * x + c * z + tz]);
  const min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])));
  const max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])));
  return { part: placement.part, stop: placement.stop, points, edges: local.edges, min, max };
}

/** Every placement as a world stand-in, in plan order. */
export function worldShapes(plan, parts) {
  return plan.placements.map((p) => worldShape(p, parts.get(p.part)));
}

/** Slab test over t in (0, 1] along origin -> end; returns the entry fraction or null. */
export function rayHitsBox(origin, end, shape) {
  const d = end.map((v, i) => v - origin[i]);
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (origin[i] < shape.min[i] || origin[i] > shape.max[i]) return null;
      continue;
    }
    let a = (shape.min[i] - origin[i]) / d[i];
    let b = (shape.max[i] - origin[i]) / d[i];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0 > 1e-4 && t0 < 1 ? t0 : null;
}

/** Distance from a point to a stand-in's box, 0 when the point is inside it. */
export function boxDistance(point, shape) {
  return Math.hypot(...[0, 1, 2].map((i) => Math.max(shape.min[i] - point[i], 0, point[i] - shape.max[i])));
}

/** Every shape the segment from a viewpoint to an anchor passes through, nearest first. */
export function occludersOf(position, anchor, shapes) {
  return shapes
    .map((shape) => ({ shape, t: rayHitsBox(position, anchor, shape) }))
    .filter((hit) => hit.t !== null)
    .sort((a, b) => a.t - b.t);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

/** The camera basis at a viewpoint: right, up and forward, as src/camera looks along it. */
export function viewBasis(viewpoint) {
  const forward = norm(sub(viewpoint.target, viewpoint.position));
  const right = norm(cross(forward, [0, 1, 0]));
  return { eye: viewpoint.position, right, up: cross(right, forward), forward };
}

/** Convex hull of 2-D points, counter-clockwise (Andrew's monotone chain). */
function hull(points) {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (input) => {
    const out = [];
    for (const p of input) {
      while (out.length > 1) {
        const [ax, ay] = out[out.length - 2];
        const [bx, by] = out[out.length - 1];
        if ((bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) > 1e-12) break;
        out.pop();
      }
      out.push(p);
    }
    return out;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Sutherland-Hodgman clip of a convex polygon to the visible 3D window. */
function clipToViewport(polygon) {
  const planes = [
    (p) => p[0] + 1, (p) => VIEW_RIGHT - p[0],
    (p) => p[1] + 1, (p) => 1 - p[1],
  ];
  let out = polygon;
  for (const inside of planes) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const da = inside(a);
      const db = inside(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (!out.length) return out;
  }
  return out;
}

const polygonArea = (polygon) => Math.abs(polygon.reduce(
  (sum, p, i) => sum + p[0] * polygon[(i + 1) % polygon.length][1] - polygon[(i + 1) % polygon.length][0] * p[1],
  0,
)) / 2;

/** Share of the viewport a stand-in covers from a viewpoint, 0 to 1. */
export function coverage(basis, shape) {
  const camera = shape.points.map((p) => {
    const rel = sub(p, basis.eye);
    return [dot(rel, basis.right), dot(rel, basis.up), dot(rel, basis.forward)];
  });
  // Clip every edge to the near plane so a shape the camera stands inside still measures.
  const visible = camera.filter((p) => p[2] >= NEAR);
  for (const [i, j] of shape.edges) {
    const [a, b] = [camera[i], camera[j]];
    if ((a[2] >= NEAR) === (b[2] >= NEAR)) continue;
    const t = (NEAR - a[2]) / (b[2] - a[2]);
    visible.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
  }
  if (visible.length < 3) return 0;
  const ndc = visible.map(([x, y, z]) => [x / (z * TAN_HALF_Y * ASPECT), y / (z * TAN_HALF_Y)]);
  const clipped = clipToViewport(hull(ndc));
  return clipped.length < 3 ? 0 : polygonArea(clipped) / ((VIEW_RIGHT + 1) * 2);
}

/** Normalised device coordinates of a world point: inside [-1, 1] on both axes means on screen. */
export function ndcOf(basis, point) {
  const rel = sub(point, basis.eye);
  const z = dot(rel, basis.forward);
  if (z < NEAR) return null;
  return [dot(rel, basis.right) / (z * TAN_HALF_Y * ASPECT), dot(rel, basis.up) / (z * TAN_HALF_Y)];
}

/** Nearest stand-in at least half a metre tall whose centre is within 45 degrees of the look direction. */
export function nearestAhead(viewpoint, basis, shapes) {
  let best = null;
  for (const shape of shapes) {
    if (shape.max[1] - shape.min[1] < 0.5) continue; // floors and pool lips do not block a view
    const centre = [0, 1, 2].map((i) => (shape.min[i] + shape.max[i]) / 2);
    const to = sub(centre, viewpoint.position);
    const distance = Math.hypot(...to);
    if (distance < 1e-6) continue;
    if (dot(to, basis.forward) / distance < Math.cos(Math.PI / 4)) continue;
    if (!best || distance < best.distance) best = { part: shape.part, stop: shape.stop, distance };
  }
  return best;
}

/** Everything the report and the sight-line test both want, per viewpoint and per hotspot. */
export function survey(plan, parts) {
  const shapes = worldShapes(plan, parts);
  const byId = new Map(plan.rail.map((viewpoint) => [viewpoint.id, viewpoint]));
  const viewpoints = plan.rail.map((viewpoint) => {
    const basis = viewBasis(viewpoint);
    const covers = shapes
      .map((shape) => ({ part: shape.part, stop: shape.stop, share: coverage(basis, shape) }))
      .sort((a, b) => b.share - a.share);
    return { viewpoint, nearest: nearestAhead(viewpoint, basis, shapes), covers };
  });
  const hotspots = plan.hotspots.map((hotspot) => {
    const from = byId.get(hotspot.from);
    const occluders = occludersOf(from.position, hotspot.anchor, shapes);
    const distance = Math.hypot(...hotspot.anchor.map((v, i) => v - from.position[i]));
    const ndc = ndcOf(viewBasis(from), hotspot.anchor);
    const inFrame = ndc !== null && Math.abs(ndc[0]) <= 1 && Math.abs(ndc[1]) <= 1;
    return { hotspot, from, distance, occluders, ndc, inFrame };
  });
  return { shapes, viewpoints, hotspots };
}
