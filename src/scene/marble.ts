import { MeshPhysicalMaterial, type MeshStandardMaterial } from 'three';
import type { PartAsset } from '../kit/loader';

// Metre-scaled, derivative-filtered veins stay sharp without another bitmap atlas.
const pattern = /* glsl */`
  varying vec3 vMarblePosition;
  varying vec3 vStoneLocal;
  float marbleHash(vec3 p) { p=fract(p*.3183099+vec3(.13,.37,.71)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float marbleNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(marbleHash(i),marbleHash(i+vec3(1,0,0)),f.x),mix(marbleHash(i+vec3(0,1,0)),marbleHash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(marbleHash(i+vec3(0,0,1)),marbleHash(i+vec3(1,0,1)),f.x),mix(marbleHash(i+vec3(0,1,1)),marbleHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  vec3 villaMarble(vec3 p) {
    vec3 q=p*4.2;
    float cloud=marbleNoise(q*.58);
    float warp=marbleNoise(q*1.2)*2.4+marbleNoise(q*3.4)*.64+marbleNoise(q*9.0)*.15;
    float phase=dot(q,vec3(.76,.49,.61))*5.0+warp*5.5;
    float aa=max(fwidth(phase),.035);
    float line=1.0-smoothstep(.055,.13+aa,abs(sin(phase)));
    float branch=1.0-smoothstep(.024,.062+aa*1.7,abs(sin(phase*2.7+marbleNoise(q*4.7)*4.0)));
    float vein=clamp(line*.72+branch*.18,0.0,1.0);
    vec3 body=mix(vec3(.69,.705,.67),vec3(.87,.86,.80),cloud);
    return mix(body,vec3(.31,.36,.34),vein*.34);
  }
`;

export function marbleMaterial(roughness = .28): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ color: 0xffffff, roughness, metalness: 0, clearcoat: .12, clearcoatRoughness: .3 });
  material.name = 'Fine Carrara marble';
  finish(material, '1.0');
  return material;
}

function finish(material: MeshStandardMaterial, mask: string) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vMarblePosition; varying vec3 vStoneLocal;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vStoneLocal=transformed;
      vec4 marbleWorld=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        marbleWorld=instanceMatrix*marbleWorld;
      #endif
      vMarblePosition=(modelMatrix*marbleWorld).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader = pattern + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float stoneChroma=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)-min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b);
      diffuseColor.rgb=mix(diffuseColor.rgb,villaMarble(vMarblePosition),${mask});
    `);
  };
  material.customProgramCacheKey = () => `villa-fine-marble-1:${mask}`;
}

const fullMarble = new Set(['column-doric','entablature-3m','pool-edge-straight','pool-edge-corner','stair-run-3m','bench-3m']);

/** Apply the site finish to selected Matter stone, retaining its authored geometry.
 * Full marble pieces release their old atlas; mixed pieces keep soil/metal intact. */
export function finishMatterStone(id: string, asset: PartAsset): void {
  const old = Array.isArray(asset.material) ? asset.material : [asset.material];
  if (fullMarble.has(id)) {
    const material = marbleMaterial(id === 'stair-run-3m' ? .4 : .28);
    const textures = new Set<any>();
    for (const m of old) {
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
      m.dispose();
    }
    for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
    asset.material = Array.isArray(asset.material) ? old.map(() => material) : material;
  } else if (['floor-slab-3x3','statue-a','statue-b','planter-square'].includes(id)) {
    for (const m of old) {
      const material = m as MeshStandardMaterial;
      if (!material.isMeshStandardMaterial) continue;
      const mask = id === 'floor-slab-3x3' ? 'smoothstep(-.018,-.008,vStoneLocal.y)*.86'
        : id === 'planter-square' ? 'smoothstep(.08,.20,dot(diffuseColor.rgb,vec3(.333)))'
        : '(1.0-smoothstep(.035,.16,stoneChroma))*smoothstep(.50,.60,vStoneLocal.y)';
      finish(material, mask);
      material.roughness = id === 'floor-slab-3x3' ? .48 : .35;
    }
  }
}
