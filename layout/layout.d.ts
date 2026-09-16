import type { Contract, Layout, Manifest, Part, Placement, Viewpoint, Hotspot, Bounds, Vec3 } from '../src/types';
export const LAYOUT_VERSION: 1;
export const LEVEL_HEIGHT: number;
export const EYE_HEIGHT: number;
export const SIZES: Record<string, [number, number]>;
export const HEADINGS: [number, number][];
export class LayoutError extends Error { code: string; constructor(code: string, message: string); }
export type Stop = {
  id: string; kind: 'court' | 'room' | 'courtyard' | 'terrace'; archetype: string; focal?: string; centreHeight?: number; title?: string;
  x: number; z: number; h: number; w: number; d: number; level: number; turn: -1 | 0 | 1; drop: boolean;
  hasEntry: boolean; hasExit: boolean; exit: { x: number; z: number; h: number };
};
export function footprintCells(x: number, z: number, h: number, w: number, d: number): string[];
export function exitFor(x: number, z: number, h: number, w: number, d: number, turn: -1 | 0 | 1): { x: number; z: number; h: number };
export function sequence(manifest: Manifest, parts: Map<string, Part>): Stop[];
export function worldPoint(stop: Pick<Stop, 'x' | 'z' | 'h' | 'level'>, u: number, v: number, y: number): Vec3;
export function worldTransform(stop: Pick<Stop, 'x' | 'z' | 'h' | 'level'>, u: number, v: number, y: number, localQ: number): number[];
export function exitLocal(stop: Stop): [number, number];
export function fill(stop: Stop, parts: Map<string, Part>, rng: () => number): Placement[];
export function railFor(stops: Stop[]): { rail: Viewpoint[]; hotspots: Hotspot[] };
export function boundsFor(stops: Stop[]): Record<string, Bounds>;
export function layout(manifest: Manifest, contract: Contract, seed?: number): Layout;
