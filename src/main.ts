import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
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
  interface Window {
    /** Set on the first rendered frame to the viewpoint the scene started at. */
    __villaReady?: number;
    /** The viewpoint the camera is nearest, for tools/console-probe.mjs. */
    __villaViewpoint?: number;
    /** Screen positions of the clickable hotspot markers, for tools/console-probe.mjs. */
    __villaHotspots?: () => { x: number; y: number; to: number; onScreen: boolean }[];
    /** Where the camera is along the walk and how fast it is going, for the wheel checks in docs/verification. */
    __villaTravel?: () => { u: number; metres: number; speed: number; mode: string; viewpoint: number; position: number[] };
  }
}

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('villa') as HTMLCanvasElement;
const panelsRoot = document.getElementById('panels') as HTMLElement;

const plan = layout(manifest as Manifest, contract as Contract);
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const startAt = Math.min(plan.rail.length - 1, Math.max(0, Number(params.get('vp') ?? '0') || 0));

const projectIds = new Set(content.map((c) => c.id));

/**
 * Build the scene and start drawing it. `progress` hears the fraction of this work done: part
 * way as the scene and its first stops are built, and 1 once the first frame is on screen.
 */
export async function boot(progress: (fraction: number) => void = () => {}): Promise<void> {
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
  progress(0.3);

  const streamer = new Streamer(stops, order);
  const rail = new Rail(plan.rail, plan.path);
  const director = new Director(rail, camera);
  const markers = hotspotMarkers(plan.hotspots, plan.rail);
  scene.add(markers);
  const panels = new Panels(panelsRoot, content);

  director.onViewpoint((index, stop) => {
    window.__villaViewpoint = index;
    setActiveHotspots(markers, index);
    panels.show(projectIds.has(stop) ? stop : null);
    void streamer.update(stop);
  });

  bindInputs(app, director, camera, markers);

  window.__villaHotspots = () => {
    const rect = canvas.getBoundingClientRect();
    const at = new Vector3();
    return markers.children.filter((marker) => marker.visible).map((marker) => {
      marker.getWorldPosition(at).project(camera);
      return {
        x: rect.left + ((at.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - at.y) / 2) * rect.height,
        to: marker.userData.to as number,
        onScreen: Math.abs(at.x) < 1 && Math.abs(at.y) < 1 && at.z < 1,
      };
    });
  };

  const resize = () => {
    const w = app.clientWidth, h = app.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  window.__villaTravel = () => ({
    u: director.u,
    metres: director.u * rail.length,
    speed: director.travel.velocity,
    mode: director.mode,
    viewpoint: director.nearest(),
    position: camera.position.toArray(),
  });

  await streamer.update(plan.rail[startAt].stop);
  director.jump(startAt);
  progress(0.8);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    director.update(dt);
    renderer.render(scene, camera);
    if (window.__villaReady === undefined) {
      window.__villaReady = startAt;
      progress(1);
    }
  });
}
