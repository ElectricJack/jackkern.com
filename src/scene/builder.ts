import { Group, InstancedMesh, Matrix4 } from 'three';
import type { KitLoader } from '../kit/loader';
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

  constructor(readonly id: string, private loader: KitLoader, private assembly = new Map<string, number[]>()) {
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
      if (!byPart.has(p.part)) byPart.set(p.part, []);
      byPart.get(p.part)!.push(p);
    }
    const built: InstancedMesh[] = [];
    const m = new Matrix4();
    for (const [partId, list] of byPart) {
      const asset = await this.loader.get(partId);
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

export function buildScene(layout: Layout, loader: KitLoader, assembly = new Map<string, number[]>()): { root: Group; stops: Map<string, StopHandle>; order: string[] } {
  const root = new Group();
  root.name = 'villa';
  const stops = new Map<string, StopHandle>();
  const order: string[] = [];
  for (const p of layout.placements) {
    let handle = stops.get(p.stop);
    if (!handle) {
      handle = new StopHandle(p.stop, loader, assembly);
      stops.set(p.stop, handle);
      order.push(p.stop);
      root.add(handle.group);
    }
    handle.placements.push(p);
  }
  return { root, stops, order };
}
