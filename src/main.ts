import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import content from 'virtual:content';
import contract from '../kit/contract.json';
import manifest from '../content/manifest.json';
import { layout } from '../layout/layout.js';
import { Director } from './camera/director';
import { Rail } from './camera/rail';
import { bindInputs, hotspotMarkers, setActiveHotspots } from './input/bindings';
import { GreyboxSource, KitLoader } from './kit/loader';
import { Panels } from './panels/panels';
import { buildScene } from './scene/builder';
import { Streamer } from './scene/streamer';
import type { Contract, Manifest } from './types';

declare global {
  interface Window { __villaReady?: number }
}

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('villa') as HTMLCanvasElement;
const panelsRoot = document.getElementById('panels') as HTMLElement;

const plan = layout(manifest as Manifest, contract as Contract);
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const startAt = Math.min(plan.rail.length - 1, Math.max(0, Number(params.get('vp') ?? '0') || 0));

const projectIds = new Set(content.map((c) => c.id));

/** Start the optional WebGL scene after the lightweight static page is visible. */
export async function boot(): Promise<void> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  scene.background = new Color(0xe8e4dc);
  scene.fog = new Fog(0xe8e4dc, 25, 90);
  scene.add(new HemisphereLight(0xfff4e0, 0x8a7f6a, 0.9));
  scene.add(new AmbientLight(0xffffff, 0.15));
  const sun = new DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(12, 30, 8);
  scene.add(sun);

  const camera = new PerspectiveCamera(55, 1, 0.1, 200);
  const loader = new KitLoader(contract as Contract, new GreyboxSource());
  const { root, stops, order } = buildScene(plan, loader);
  scene.add(root);

  const streamer = new Streamer(stops, order);
  const rail = new Rail(plan.rail, plan.path);
  const director = new Director(rail, camera);
  const markers = hotspotMarkers(plan.hotspots, plan.rail);
  scene.add(markers);
  const panels = new Panels(panelsRoot, content);

  director.onViewpoint((index, stop) => {
    setActiveHotspots(markers, index);
    panels.show(projectIds.has(stop) ? stop : null);
    void streamer.update(stop);
  });

  bindInputs(app, director, camera, markers, plan.rail.length);

  const resize = () => {
    const w = app.clientWidth, h = app.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  await streamer.update(plan.rail[startAt].stop);
  director.jump(startAt);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    director.update(dt);
    renderer.render(scene, camera);
    if (capture && window.__villaReady === undefined) window.__villaReady = startAt;
  });
}
