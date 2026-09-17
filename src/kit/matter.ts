import { Float32BufferAttribute, type BufferGeometry, type Material, type Mesh, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import manifest from '../../kit/matter-assets.json';
import type { Part } from '../types';
import { GreyboxSource, type KitSource, type PartAsset } from './loader';
import { finishMatterStone } from '../scene/marble';
import { broadenCornice } from '../scene/joinery';

type AssetEntry = { bounds: { min: number[]; max: number[] }; desktop: { url: string }; mobile: { url: string } };
const assets: Record<string, AssetEntry> = manifest.parts;

/** Decode node transforms before instancing, including transforms introduced by
 * quantization. The merged geometry retains each exported material as a draw group. */
export function matterAsset(scene: Object3D, expected?: { min: number[]; max: number[] }): PartAsset {
  scene.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  scene.traverse((object) => { if ((object as Mesh).isMesh) meshes.push(object as Mesh); });
  if (!meshes.length) throw new Error('Matter asset contains no mesh');
  const geometries: BufferGeometry[] = [], materials: Material[] = [];
  for (const mesh of meshes) {
    if (Array.isArray(mesh.material)) throw new Error('Expected a single material per glTF primitive');
    const geometry = mesh.geometry.clone();
    // Integer positions would clip during a metre-scale transform. Consistent float
    // attribute layouts also allow separate material primitives to be merged.
    for (const name of Object.keys(geometry.attributes)) {
      const source = geometry.getAttribute(name);
      const values = new Float32Array(source.count * source.itemSize);
      for (let vertex = 0; vertex < source.count; vertex++) for (let component = 0; component < source.itemSize; component++) {
        values[vertex * source.itemSize + component] = source.getComponent(vertex, component);
      }
      geometry.setAttribute(name, new Float32BufferAttribute(values, source.itemSize));
    }
    geometry.applyMatrix4(mesh.matrixWorld);
    if (mesh.matrixWorld.determinant() < 0) {
      const indices = geometry.index;
      if (!indices) throw new Error('Mirrored Matter primitive needs indices');
      for (let i = 0; i < indices.count; i += 3) {
        const second = indices.getX(i + 1); indices.setX(i + 1, indices.getX(i + 2)); indices.setX(i + 2, second);
      }
      const tangent = geometry.getAttribute('tangent');
      if (tangent) for (let i = 0; i < tangent.count; i++) tangent.setW(i, -tangent.getW(i));
    }
    geometries.push(geometry); materials.push(mesh.material);
    mesh.geometry.dispose();
  }
  const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, true);
  if (!geometry) throw new Error('Incompatible Matter primitive layouts');
  if (geometries.length > 1) for (const source of geometries) source.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const box = geometry.boundingBox!;
  const actual = [...box.min.toArray(), ...box.max.toArray()];
  const wanted = expected ? [...expected.min, ...expected.max] : actual;
  if (actual.some((value, i) => !Number.isFinite(value) || Math.abs(value - wanted[i]) > 0.001)) {
    geometry.dispose(); throw new Error('Matter asset does not match its kit bounds');
  }
  return { geometry, material: materials.length === 1 ? materials[0] : materials };
}

/** Retained for the column comparison fixture and quantization regression check. */
export function columnAsset(scene: Object3D): PartAsset {
  return matterAsset(scene, { min: [-0.5, 0, -0.5], max: [0.5, 4, 0.5] });
}

export class MatterSource implements KitSource {
  private readonly fallback = new GreyboxSource();
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  readonly loaded: Record<string, 'matter' | 'fallback'> = {};

  constructor(private readonly renderer: WebGLRenderer, readonly tier: 'desktop' | 'mobile') {}

  async load(part: Part): Promise<PartAsset> {
    const entry = assets[part.id];
    try {
      if (!entry) throw new Error(`No export registered for ${part.id}`);
      const gltf = await this.gltf.loadAsync(`${import.meta.env.BASE_URL}${entry[this.tier].url.replace(/^\//, '')}`);
      const asset = matterAsset(gltf.scene, entry.bounds);
      if (part.id === 'entablature-3m') broadenCornice(asset.geometry);
      finishMatterStone(part.id, asset);
      for (const material of Array.isArray(asset.material) ? asset.material : [asset.material]) {
        for (const value of Object.values(material)) if (value?.isTexture) {
          value.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        }
      }
      this.loaded[part.id] = 'matter';
      return asset;
    } catch (error) {
      this.loaded[part.id] = 'fallback';
      console.warn(`villa: Matter ${part.id} could not load; using stand-in`, error);
      return this.fallback.load(part);
    }
  }
}
