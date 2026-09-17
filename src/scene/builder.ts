import { Group, InstancedMesh, Matrix4 } from 'three';
import type { KitLoader, PartAsset } from '../kit/loader';
import type { Layout, Placement } from '../types';

/** One stop's meshes. Geometry and material are shared through the loader; only instance buffers are owned here. */
export class StopHandle {
  readonly group = new Group();
  readonly placements: Placement[] = [];
  loaded = false;
  private meshes: InstancedMesh[] = [];
  private pending: Promise<void> | null = null;
  /** Bumped by unload() so a build still awaiting the loader knows it has been retired. */
  private generation = 0;

  constructor(readonly id: string, private loader: KitLoader, private assembly = new Map<string, number[]>(),
    private wallArt?: (room: string, variant: number) => PartAsset) {
    this.group.name = id;
  }

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.pending) this.pending = this.build(this.generation);
    return this.pending;
  }

  private async build(generation: number): Promise<void> {
    const byPart = new Map<string, Placement[]>();
    for (const p of this.placements) {
      const key = this.wallArt && p.part === 'wall-inset-panel' ? `${p.part}:${Number(p.instance.split('.').at(-1))}` : p.part;
      if (!byPart.has(key)) byPart.set(key, []);
      byPart.get(key)!.push(p);
    }
    const built: InstancedMesh[] = [];
    const m = new Matrix4();
    // Only this visible room is urgent; its independent shared parts load together.
    const entries = [...byPart];
    const assets = await Promise.all(entries.map(([id, placements]) =>
      this.wallArt && placements[0].part === 'wall-inset-panel'
        ? this.wallArt(this.id, Number(id.split(':').at(-1))) : this.loader.get(id)));
    for (const [index, [partId, list]] of entries.entries()) {
      const asset = assets[index];
      const mesh = new InstancedMesh(asset.geometry, asset.material, list.length);
      mesh.name = partId;
      mesh.castShadow = partId !== 'floor-slab-3x3';
      mesh.receiveShadow = true;
      list.forEach((p, i) => { m.fromArray(this.assembly.get(p.instance) ?? p.transform); mesh.setMatrixAt(i, m); });
      mesh.instanceMatrix.needsUpdate = true;
      built.push(mesh);
    }
    // An unload() while the loader was awaited leaves this build stale: attaching it now
    // would duplicate the meshes of whatever load() came after it.
    if (generation !== this.generation) {
      for (const mesh of built) mesh.dispose();
      return;
    }
    this.meshes = built;
    for (const mesh of built) this.group.add(mesh);
    this.loaded = true;
    this.pending = null;
  }

  unload(): void {
    this.generation++;
    for (const mesh of this.meshes) { this.group.remove(mesh); mesh.dispose(); }
    this.meshes = [];
    this.loaded = false;
    this.pending = null;
  }
}

export function buildScene(layout: Layout, loader: KitLoader, assembly = new Map<string, number[]>(), wallArt?: (room: string, variant: number) => PartAsset): { root: Group; stops: Map<string, StopHandle>; order: string[] } {
  const root = new Group();
  root.name = 'villa';
  const stops = new Map<string, StopHandle>();
  const order: string[] = [];
  for (const p of layout.placements) {
    let handle = stops.get(p.stop);
    if (!handle) {
      handle = new StopHandle(p.stop, loader, assembly, wallArt);
      stops.set(p.stop, handle);
      order.push(p.stop);
      root.add(handle.group);
    }
    handle.placements.push(p);
  }
  return { root, stops, order };
}
