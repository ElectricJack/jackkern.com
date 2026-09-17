import { BackSide, DirectionalLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PlaneGeometry, PMREMGenerator, ShaderMaterial, SphereGeometry, Vector3, type Scene, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Layout } from '../types';
import { villaPlatform } from './platform';

/** A small static sun shadow window follows the visited room. Bakes are explicitly
 * not claimed here: r2 exports material maps but not world illumination. */
export function villaDaylight(renderer: WebGLRenderer, scene: Scene, sun: DirectionalLight, plan: Layout, mobile: boolean) {
  const sky = new Mesh(new SphereGeometry(180, 24, 12), new ShaderMaterial({
    side: BackSide, depthWrite: false,
    vertexShader: 'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.0);gl_Position.z=gl_Position.w*.999999;}',
    fragmentShader: `varying vec3 skyDirection;void main(){float h=smoothstep(-.04,.60,normalize(skyDirection).y);
      gl_FragColor=vec4(mix(vec3(.89,.88,.78),vec3(.43,.62,.69),h),1.0);
      #include <colorspace_fragment>
    }`,
  }));
  sky.name = 'sky'; sky.frustumCulled = false; scene.add(sky);
  const ground = new Mesh(new PlaneGeometry(360, 360).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: 0xb4b09b, roughness: 1 }));
  ground.position.y = -1.13; ground.receiveShadow = true; scene.add(ground);
  scene.add(villaPlatform(plan));
  let environmentTarget: WebGLRenderTarget | undefined;
  const releaseEnvironment = () => {
    environmentTarget?.dispose();
    environmentTarget = undefined;
    scene.environment = null;
  };
  const restoreEnvironment = () => {
    // A render target has no CPU image to re-upload after a graphics reset.
    releaseEnvironment();
    const pmrem = new PMREMGenerator(renderer), environment = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(environment, .03);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = .32; environment.dispose(); pmrem.dispose();
  };
  restoreEnvironment();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  sun.shadow.bias = -.0002; sun.shadow.normalBias = .025;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -17;
  sun.shadow.camera.right = sun.shadow.camera.top = 17;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 85;
  scene.add(sun.target);
  const offset = new Vector3(-18, 30, -12);
  return {
    focus(stop: string) {
      const bounds = plan.bounds[stop];
      if (!bounds) return;
      sun.target.position.set((bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2);
      sun.position.copy(sun.target.position).add(offset);
      sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    },
    refresh() { renderer.shadowMap.needsUpdate = true; },
    // Release through the old renderer while its context is lost, before Three
    // replaces its WebGL resource bookkeeping on context restoration.
    lost() { releaseEnvironment(); },
    restore() { restoreEnvironment(); renderer.shadowMap.needsUpdate = true; },
  };
}
