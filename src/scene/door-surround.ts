import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three';
import { marbleMaterial } from './marble';

export const ARCH = { inner: .97, outer: 1.25, spring: 2.02, depth: .44, segments: 60 };

/** One continuous stone vault, with only the two end caps. It meets its piers
 * at spring height; there is no second coincident mortar vault underneath. */
export function archGeometry() {
  const p: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
  const at = (r: number, t: number, z: number) => [Math.cos(t) * r, ARCH.spring + Math.sin(t) * r, z];
  for (let i = 0; i < ARCH.segments; i++) {
    const a = i * Math.PI / ARCH.segments, b = (i + 1) * Math.PI / ARCH.segments;
    const aa = at(ARCH.inner, a, -ARCH.depth / 2), ab = at(ARCH.inner, b, -ARCH.depth / 2);
    const ba = at(ARCH.outer, a, -ARCH.depth / 2), bb = at(ARCH.outer, b, -ARCH.depth / 2);
    const ac = at(ARCH.inner, a, ARCH.depth / 2), ad = at(ARCH.inner, b, ARCH.depth / 2);
    const bc = at(ARCH.outer, a, ARCH.depth / 2), bd = at(ARCH.outer, b, ARCH.depth / 2);
    quad(aa, ab, bb, ba); quad(ac, bc, bd, ad); quad(aa, ac, ad, ab); quad(ba, bb, bd, bc);
  }
  for (const angle of [0, Math.PI]) {
    const a = at(ARCH.inner, angle, -ARCH.depth / 2), b = at(ARCH.outer, angle, -ARCH.depth / 2);
    const c = at(ARCH.outer, angle, ARCH.depth / 2), d = at(ARCH.inner, angle, ARCH.depth / 2);
    if (angle === 0) quad(a, b, c, d); else quad(a, d, c, b);
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(p, 3)); geometry.computeVertexNormals();
  return geometry;
}

/** Close the upper corners of the old rectangular opening. The infill's inner
 * radius lies inside the marble volume, so their reveal surfaces never coincide. */
export function spandrelGeometry() {
  const shape = new Shape(); shape.moveTo(-1, 3.2); shape.lineTo(1, 3.2);
  for (let i = 0; i <= 48; i++) {
    const x = 1 - i / 24;
    shape.lineTo(x, ARCH.spring + Math.sqrt(1.02 ** 2 - x * x));
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: .24, bevelEnabled: false }).translate(0, 0, -.12);
}

/** Recessed-looking fine joints shade the continuous stone instead of creating
 * floating blocks or overlapping shells. */
export function jointedMarble(arch: boolean) {
  const material = marbleMaterial(.36), finish = material.onBeforeCompile.bind(material);
  const phase = arch ? `atan(max(vStoneLocal.y-${ARCH.spring},0.0),vStoneLocal.x)*15.0/3.14159265` : `vStoneLocal.y*7.0/${ARCH.spring}`;
  material.onBeforeCompile = (shader, renderer) => {
    finish(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      float jointPhase=${phase};
      float jointDistance=abs(fract(jointPhase+.5)-.5);
      float jointAA=fwidth(jointPhase);
      diffuseColor.rgb*=mix(.61,1.0,smoothstep(.005,.014+jointAA,jointDistance));
      #include <roughnessmap_fragment>
    `);
  };
  material.customProgramCacheKey = () => `villa-jointed-marble:${arch}`;
  return material;
}
