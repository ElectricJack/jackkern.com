import { BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { columnAsset, matterAsset } from '../../src/kit/matter';

it('preserves metre scale, bottom origin and UVs when instancing a quantized glTF node', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Int16Array([
    -8192, -32767, -8192, 8192, 32767, 8192,
  ]), 3, true));
  geometry.setAttribute('normal', new BufferAttribute(new Int16Array([0, 32767, 0, 0, 32767, 0]), 3, true));
  geometry.setAttribute('uv', new BufferAttribute(new Uint16Array([0, 65535, 65535, 0]), 2, true));
  const material = new MeshStandardMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.scale.setScalar(2);
  mesh.position.y = 1;
  const scene = new Group();
  scene.position.y = 1;
  scene.add(mesh);
  const asset = columnAsset(scene);
  expect(asset.geometry.boundingBox!.min.y).toBe(0);
  expect(asset.geometry.boundingBox!.max.y).toBe(4);
  expect(asset.geometry.boundingBox!.max.x).toBeCloseTo(0.5, 4);
  expect(asset.geometry.getAttribute('normal').getY(0)).toBeCloseTo(1);
  expect(asset.geometry.getAttribute('uv').getY(0)).toBe(1);
  expect(asset.material).toBe(material);
});

it('rejects an asset with incompatible bounds instead of misplacing repeated columns', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1]), 3));
  const scene = new Group();
  scene.add(new Mesh(geometry, new MeshStandardMaterial()));
  expect(() => columnAsset(scene)).toThrow('kit bounds');
});

it('keeps material groups and child placement transforms in an instanced assembly', () => {
  const scene = new Group();
  const materials = [new MeshStandardMaterial({ color: 'red' }), new MeshStandardMaterial({ color: 'blue' })];
  for (let i = 0; i < 2; i++) {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), materials[i]);
    mesh.position.set(i === 0 ? -1.5 : 1.5, .5, 0); scene.add(mesh);
  }
  const asset = matterAsset(scene, { min: [-2, 0, -.5], max: [2, 1, .5] });
  expect(asset.material).toEqual(materials);
  expect(asset.geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
  expect(asset.geometry.index!.count).toBe(72);
});

it('preserves outward winding when a glTF child has a mirrored transform', () => {
  const scene = new Group(), mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.scale.x = -1; scene.add(mesh);
  const { geometry } = matterAsset(scene);
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), ix = geometry.index!;
  for (let i = 0; i < ix.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, ix.getX(i));
    const b = new Vector3().fromBufferAttribute(p, ix.getX(i + 1)).sub(a);
    const c = new Vector3().fromBufferAttribute(p, ix.getX(i + 2)).sub(a);
    expect(b.cross(c).dot(new Vector3().fromBufferAttribute(n, ix.getX(i)))).toBeGreaterThan(0);
  }
});
