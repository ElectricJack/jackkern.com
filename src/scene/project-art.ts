import { BoxGeometry, CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, TorusGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PartAsset } from '../kit/loader';

/** Texture-free instruments beside the exported Matter architecture. */
export function projectArt(id: string, mobile: boolean): PartAsset | null {
  // Agent Queue's relief-a deliberately uses its original Matter-exported statue.
  if (!['fountain-wall', 'statue-b'].includes(id)) return null;
  const stone = new MeshStandardMaterial({ color: 0xd4ccaf, roughness: .75 });
  const bronze = new MeshStandardMaterial({ color: 0x957343, metalness: .72, roughness: .3 });
  const mineral = new MeshStandardMaterial({ color: id === 'statue-b' ? 0x315e62 : 0x4c7767, metalness: .3, roughness: .28 });
  const pieces: BufferGeometry[] = [], materials: MeshStandardMaterial[] = [];
  const add = (g: BufferGeometry, material: MeshStandardMaterial, x = 0, y = 0, z = 0) => {
    const geometry = g.index ? g.toNonIndexed() : g;
    if (geometry !== g) g.dispose();
    geometry.deleteAttribute('uv');
    pieces.push(geometry.translate(x, y, z)); materials.push(material);
  };
  const segments = mobile ? 24 : 48;
  add(new CylinderGeometry(.43, .48, .22, segments), stone, 0, .11);
  if (id === 'fountain-wall') {
    // Matter: an armillary holding a faceted seed.
    add(new CylinderGeometry(.14, .27, .62, segments), bronze, 0, .53);
    for (const angle of [-.65, .65, Math.PI / 2]) {
      add(new TorusGeometry(1.02, .045, 6, segments).rotateY(angle).scale(1, 1, .45), bronze, 0, 1.85);
    }
    add(new IcosahedronGeometry(.53, 0), mineral, 0, 1.85);
    add(new CylinderGeometry(.035, .035, 2.55, 8), bronze, 0, 1.6);
  } else {
    // Outrider: a compass needle through a stack of code strata.
    add(new CylinderGeometry(0, .32, 1.6, 4).rotateY(Math.PI / 4), mineral, 0, 2.15);
    add(new CylinderGeometry(.32, 0, .7, 4).rotateY(Math.PI / 4), mineral, 0, 1);
    for (let i = 0; i < 5; i++) add(new BoxGeometry(.74, .055, .64).rotateY(i * .16), bronze, 0, .34 + i * .13);
    add(new TorusGeometry(.36, .025, 6, segments).rotateX(.35), bronze, 0, 1.6);
  }
  // Merge by material first: three draw calls per instrument, not one per component.
  const grouped = [stone, bronze, mineral].map(material => mergeGeometries(pieces.filter((_, i) => materials[i] === material))!);
  const geometry = mergeGeometries(grouped, true)!;
  for (const piece of [...pieces, ...grouped]) piece.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, material: [stone, bronze, mineral] };
}
