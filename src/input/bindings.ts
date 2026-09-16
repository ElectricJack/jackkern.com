import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Vector2,
  type Camera,
} from 'three';
import type { Director } from '../camera/director';
import { wheelPixels } from '../camera/travel';
import type { Hotspot, Viewpoint } from '../types';

/** Clickable spheres at hotspot anchors. Only markers leaving the current viewpoint are visible. */
export function hotspotMarkers(hotspots: Hotspot[], viewpoints: Viewpoint[]): Group {
  const group = new Group();
  group.name = 'hotspots';

  const index = new Map(viewpoints.map((viewpoint, i) => [viewpoint.id, i]));
  const geometry = new SphereGeometry(0.35, 12, 8);
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  for (const hotspot of hotspots) {
    const marker = new Mesh(geometry, material);
    marker.position.set(...hotspot.anchor);
    marker.userData = {
      from: index.get(hotspot.from),
      to: index.get(hotspot.to),
      label: hotspot.label,
    };
    marker.visible = false;
    group.add(marker);
  }

  return group;
}

/** Shows only markers that lead away from the active viewpoint. */
export function setActiveHotspots(group: Group, fromIndex: number): void {
  for (const child of group.children) {
    child.visible = child.userData.from === fromIndex;
  }
}

/**
 * Connects the rail director to wheel, touch, keyboard, and hotspot input. Wheel and swipe
 * distances push the camera through the velocity model in src/camera/travel.ts; keys and
 * hotspots glide to a viewpoint. Returns a disposer so the scene can release all
 * document-level listeners.
 */
export function bindInputs(
  el: HTMLElement,
  director: Director,
  camera: Camera,
  markers: Group,
): () => void {
  const ray = new Raycaster();
  const ndc = new Vector2();
  let touchY: number | null = null;

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    director.push(wheelPixels(event));
  };

  const onTouchStart = (event: TouchEvent): void => {
    touchY = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (touchY === null) return;
    const y = event.touches[0]?.clientY;
    if (y === undefined) return;

    event.preventDefault();
    // Dragging up walks onward, as the wheel does.
    director.push(touchY - y);
    touchY = y;
  };

  const onTouchEnd = (): void => {
    touchY = null;
  };

  const onKey = (event: KeyboardEvent): void => {
    if (['ArrowDown', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault();
      director.step(1);
    } else if (['ArrowUp', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      director.step(-1);
    }
  };

  const onClick = (event: MouseEvent): void => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);

    const hit = ray.intersectObjects(markers.children.filter((child) => child.visible), false)[0];
    if (hit) director.glideTo(hit.object.userData.to);
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);

  return () => {
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKey);
  };
}
