import { ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, FogExp2, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import content from 'virtual:content';
import contract from '../kit/contract.json';
import manifest from '../content/manifest.json';
import { layout } from '../layout/layout.js';
import { Director } from './camera/director';
import { Rail } from './camera/rail';
import { bindInputs } from './input/bindings';
import { GreyboxSource, KitLoader } from './kit/loader';
import { Panels } from './panels/panels';
import { journeyUI } from './panels/journey';
import { buildScene } from './scene/builder';
import { Streamer } from './scene/streamer';
import { corniceJoinery } from './scene/joinery';
import type { Contract, Manifest } from './types';

declare global {
  interface Window {
    /** Set on the first rendered frame to the viewpoint the scene started at. */
    __villaReady?: number;
    /** The viewpoint the camera is nearest, for tools/console-probe.mjs. */
    __villaViewpoint?: number;
    /** Where the camera is along the walk and how fast it is going, for the wheel checks in docs/verification. */
    __villaTravel?: () => { u: number; metres: number; speed: number; acceleration: number; jerk: number; mode: string; viewpoint: number; position: number[] };
    __villaAssets?: () => { tier: string; loaded: Record<string, string> };
    __villaRenderStats?: () => { calls: number; triangles: number; textures: number; geometries: number; residentStops: string[]; reflectionPasses: number; leaves: number; dust: number };
  }
}

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('villa') as HTMLCanvasElement;
const panelsRoot = document.getElementById('panels') as HTMLElement;

const plan = layout(manifest as Manifest, contract as Contract);
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const startAt = Math.min(plan.rail.length - 1, Math.max(0, Number(params.get('vp') ?? '0') || 0));

/**
 * Build the scene and start drawing it. `progress` hears the fraction of this work done: part
 * way as the scene and its first stops are built, and 1 once the first frame is on screen.
 */
export async function boot(progress: (fraction: number) => void = () => {}): Promise<void> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new Scene();
  scene.background = new Color(0xe9ece3);
  scene.fog = new FogExp2(0xe8e5d9, .0075);
  scene.add(new HemisphereLight(0xe5eee9, 0x80745c, .85));
  scene.add(new AmbientLight(0xffffff, 0.08));
  const sun = new DirectionalLight(0xffebca, 2.2);
  sun.position.set(12, 30, 8);
  scene.add(sun);

  const camera = new PerspectiveCamera(55, 1, 0.1, 200);
  // Exported Matter kit is the default; keep the stand-ins available for comparisons.
  let source = new GreyboxSource();
  if (params.get('assets') !== 'greybox') {
    const { MatterSource } = await import('./kit/matter');
    const tier = params.get('assetTier') === 'mobile' || (params.get('assetTier') !== 'desktop' && innerWidth < 768)
      ? 'mobile' : 'desktop';
    const matter = new MatterSource(renderer, tier);
    source = matter;
    window.__villaAssets = () => ({ tier, loaded: { ...matter.loaded } });
  }
  const loader = new KitLoader(contract as Contract, source);
  const detailed = params.get('assets') !== 'greybox';
  const { root, stops, order } = buildScene(plan, loader, detailed ? corniceJoinery(plan).transforms : undefined);
  window.__villaRenderStats = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
    residentStops: [...stops].filter(([, stop]) => stop.loaded).map(([id]) => id),
    reflectionPasses: water?.reflectionPasses ?? 0, leaves: gardens?.leafCount ?? 0, dust: atmosphere?.count ?? 0 });
  scene.add(root);
  let daylight: { focus: (stop: string) => void; refresh: () => void; lost: () => void; restore: () => void } | undefined;
  let water: ReturnType<typeof import('./scene/water').villaWater> | undefined;
  let gardens: ReturnType<typeof import('./scene/gardens').villaGardens> | undefined;
  let atmosphere: ReturnType<typeof import('./scene/atmosphere').villaAtmosphere> | undefined;
  if (detailed) {
    const [{ villaDaylight }, { villaWater }, { villaGardens }, { villaAtmosphere }] = await Promise.all([
      import('./scene/daylight'), import('./scene/water'), import('./scene/gardens'), import('./scene/atmosphere'),
    ]);
    daylight = villaDaylight(renderer, scene, sun, plan, innerWidth < 768);
    const surfaces = villaWater(plan, innerWidth < 768);
    water = surfaces; scene.add(surfaces.root);
    gardens = villaGardens(plan, innerWidth < 768); scene.add(gardens.root);
    atmosphere = villaAtmosphere(innerWidth < 768); scene.add(atmosphere.root);
  }
  progress(0.3);

  const streamer = new Streamer(stops, order);
  const rail = new Rail(plan.rail, plan.path);
  const director = new Director(rail, camera, manifest.stops.filter(s => s.kind === 'project').map(s => s.id));
  const panels = new Panels(panelsRoot, content);
  panels.setRoute(plan.rail, rail.u, rail.length);
  const updateJourney = journeyUI(director, rail, content);
  let needsRender = true;

  director.onViewpoint((index, stop) => {
    window.__villaViewpoint = index;
    daylight?.focus(stop);
    void streamer.update(stop).then(() => { daylight?.refresh(); water?.refresh();
      gardens?.show(new Set([...stops].filter(([, handle]) => handle.loaded).map(([id]) => id))); needsRender = true; });
  });

  bindInputs(app, director);

  const resize = () => {
    const w = app.clientWidth, h = app.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Preserve a usable horizontal field of view on portrait screens; the original fixed
    // vertical FOV cropped a sculpture to a wall of pixels on mobile.
    camera.fov = camera.aspect < 1 ? 2 * Math.atan(Math.tan(55 * Math.PI / 360) / camera.aspect) * 180 / Math.PI : 55;
    // Keep the artwork above the floating mobile card, using a fixed framing offset.
    if (camera.aspect < 1) camera.setViewOffset(w, h, 0, h * .12, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    water?.refresh();
    needsRender = true;
  };
  addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', () => { daylight?.lost(); water?.lost(); });
  canvas.addEventListener('webglcontextrestored', () => { daylight?.restore(); water?.restore(); needsRender = true; });
  document.addEventListener('visibilitychange', () => { needsRender = true; });
  app.addEventListener('focusin', () => { needsRender = true; });
  app.addEventListener('focusout', () => { needsRender = true; });
  resize();

  window.__villaTravel = () => ({
    u: director.u,
    metres: director.u * rail.length,
    speed: director.velocity,
    acceleration: director.acceleration,
    jerk: director.jerk,
    mode: director.mode,
    viewpoint: director.nearest(),
    position: camera.position.toArray(),
  });

  await streamer.update(plan.rail[startAt].stop);
  daylight?.focus(plan.rail[startAt].stop);
  director.jump(startAt);
  if (capture && params.has('u')) {
    director.travel.reset(Math.max(0, Math.min(1, Number(params.get('u')) || 0)) * rail.length);
    director.update(0);
    await streamer.update(plan.rail[director.nearest()].stop);
  }
  gardens?.show(new Set([...stops].filter(([, handle]) => handle.loaded).map(([id]) => id)));
  progress(0.8);

  let last = performance.now();
  let lastPlaying = director.playing;
  let lastMode = director.mode;
  let lastRender = -Infinity, atmosphereTime = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Reading mode hides an already-started scene; stop its ambient GPU work too.
    if (document.hidden || (canvas.hidden && window.__villaReady !== undefined)) return;
    const before = director.u;
    director.update(dt);
    const ambientMotion = detailed && !capture && !reducedMotion.matches;
    atmosphereTime += ambientMotion ? dt : 0;
    if (!needsRender && director.u === before && lastPlaying === director.playing && lastMode === director.mode &&
      (!ambientMotion || now - lastRender < (innerWidth < 768 ? 1000 / 24 : 1000 / 30))) return;
    lastPlaying = director.playing;
    lastMode = director.mode;
    needsRender = false;
    lastRender = now;
    water?.update(ambientMotion ? atmosphereTime : 0);
    atmosphere?.update(ambientMotion ? atmosphereTime : 0, camera.position.y - 1.7, renderer.getPixelRatio());
    panels.update(director.u);
    updateJourney(director.u);
    water?.reflect(renderer, scene, camera, now, atmosphere?.root);
    renderer.render(scene, camera);
    if (window.__villaReady === undefined) {
      window.__villaReady = startAt;
      progress(1);
    }
  });
}
