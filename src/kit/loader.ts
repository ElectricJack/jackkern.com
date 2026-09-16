import type { BufferGeometry, Material } from 'three';
import type { Contract, Part } from '../types';
import { greyboxGeometry, greyboxMaterial } from './greybox';

export interface PartAsset {
  geometry: BufferGeometry;
  material: Material;
}

export interface KitSource {
  load(part: Part): Promise<PartAsset>;
}

/** Milestone 1 source: procedural stand-ins; an asset-backed source can replace this without changing callers. */
export class GreyboxSource implements KitSource {
  async load(part: Part): Promise<PartAsset> {
    return { geometry: greyboxGeometry(part), material: greyboxMaterial(part) };
  }
}

/** Caches the loading promise itself so concurrent consumers share both work and assets. */
export class KitLoader {
  private readonly parts: Map<string, Part>;
  private readonly cache = new Map<string, Promise<PartAsset>>();

  constructor(contract: Contract, private readonly source: KitSource) {
    this.parts = new Map(contract.parts.map((part) => [part.id, part]));
  }

  part(id: string): Part {
    const part = this.parts.get(id);
    if (!part) throw new Error(`unknown part ${id}`);
    return part;
  }

  get(id: string): Promise<PartAsset> {
    let pending = this.cache.get(id);
    if (!pending) {
      pending = this.source.load(this.part(id));
      this.cache.set(id, pending);
    }
    return pending;
  }
}

export type AssetsManifest = {
  version: 1;
  files: Record<string, { bytes: number; hash: string; layout_hash?: string }>;
};

/** A bake is usable only when it was generated for the layout shown at runtime. */
export function bakeStampMatches(
  assets: AssetsManifest,
  instance: string,
  layoutHash: string,
): boolean {
  const entry = assets.files[`bake/${instance}.lightmap.ktx2`];
  return entry?.layout_hash === layoutHash;
}
