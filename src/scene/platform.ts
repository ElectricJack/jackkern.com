import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Layout } from '../types';
import { marbleMaterial } from './marble';

export const PLATFORM_MARGIN = .65;
const GROUND = -1.13;

/** A height-field union gives the whole villa one exterior foundation. Top
 * ledges lie outside the existing paving; internal cell faces are never emitted. */
export function platformCells(plan: Layout) {
  const stops = Object.values(plan.bounds).map(b => ({ x0: b.min[0], x1: b.max[0], z0: b.min[2], z1: b.max[2], floor: b.min[1] + .2 }));
  const edges = (axis: 'x' | 'z') => [...new Set(stops.flatMap(s => [s[`${axis}0`] - PLATFORM_MARGIN, s[`${axis}0`], s[`${axis}1`], s[`${axis}1`] + PLATFORM_MARGIN]).map(n => Number(n.toFixed(6))))].sort((a, b) => a - b);
  const xs = edges('x'), zs = edges('z');
  const cells = new Map<string, { x0: number; x1: number; z0: number; z1: number; top: number; ledge: boolean; i: number; j: number }>();
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
    const inside = (s: typeof stops[number], margin: number) => x > s.x0 - margin && x < s.x1 + margin && z > s.z0 - margin && z < s.z1 + margin;
    const floors = stops.filter(s => inside(s, 0)), expanded = stops.filter(s => inside(s, PLATFORM_MARGIN));
    if (!expanded.length) continue;
    const ledge = floors.length === 0;
    const top = Math.max(...(ledge ? expanded : floors).map(s => s.floor)) - (ledge ? 0 : .1);
    cells.set(`${i},${j}`, { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1], top, ledge, i, j });
  }
  return cells;
}

export function villaPlatform(plan: Layout) {
  const cells = platformCells(plan), tops: number[] = [], sides: number[] = [];
  const quad = (out: number[], a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const cell of cells.values()) {
    const { x0, x1, z0, z1, top, ledge, i, j } = cell;
    if (ledge) quad(tops, [x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0]);
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const bottom = cells.get(`${i + di},${j + dj}`)?.top ?? GROUND;
      if (bottom >= top - 1e-6) continue;
      if (di < 0) quad(sides, [x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]);
      if (di > 0) quad(sides, [x1, bottom, z1], [x1, bottom, z0], [x1, top, z0], [x1, top, z1]);
      if (dj < 0) quad(sides, [x1, bottom, z0], [x0, bottom, z0], [x0, top, z0], [x1, top, z0]);
      if (dj > 0) quad(sides, [x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]);
    }
  }
  const root = new Group(); root.name = 'continuous-platform';
  for (const [positions, material] of [[tops, marbleMaterial(.48)], [sides, new MeshStandardMaterial({ color: 0xb9ae95, roughness: .96 })]] as const) {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, material); mesh.receiveShadow = true; root.add(mesh);
  }
  return root;
}
