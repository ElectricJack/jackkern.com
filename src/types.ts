// Shared shapes for the manifest, the kit contract and the layout document.
export type Vec3 = [number, number, number];
export type ManifestStop = {
  id: string; kind: 'court' | 'project' | 'terrace'; title?: string; discipline?: string;
  archetype?: 'gallery' | 'pool-hall' | 'exedra'; focal?: string; focalScale?: number; panel?: string; screenshots?: string[];
};
export type Manifest = { version: 1; seed: number; stops: ManifestStop[] };
export type Socket = { name: string; at: Vec3; dir: '+x' | '-x' | '+y' | '-y' | '+z' | '-z' };
export type Part = {
  id: string; category: 'structure' | 'floor' | 'water' | 'dressing' | 'focal';
  footprint: [number, number]; height: number; sockets: Socket[]; tier: 'full' | 'half' | 'skip';
};
export type Contract = { version: 1; module_m: number; parts: Part[] };
export type Placement = { instance: string; part: string; stop: string; transform: number[] };
export type Viewpoint = { id: string; stop: string; position: Vec3; target: Vec3 };
export type Hotspot = { from: string; to: string; anchor: Vec3; label: 'focal' | 'threshold' };
export type Bounds = { min: Vec3; max: Vec3 };
export type Layout = {
  version: 1; hash: string; placements: Placement[]; rail: Viewpoint[];
  path: Viewpoint[]; // the whole walk the camera rides; `rail` is the subsequence it stops at
  hotspots: Hotspot[]; bounds: Record<string, Bounds>;
};
