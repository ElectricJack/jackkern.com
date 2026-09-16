// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import {
  SCROLL_PIXELS_PER_VIEWPOINT,
  bindInputs,
  hotspotMarkers,
  setActiveHotspots,
} from '../../src/input/bindings';

const plan = layout(manifest, contract);

test('hotspotMarkers creates one hidden marker per hotspot with viewpoint indices', () => {
  const group = hotspotMarkers(plan.hotspots, plan.rail);

  expect(group.children.length).toBe(plan.hotspots.length);
  expect(group.children.every((child) => child.visible === false)).toBe(true);
  expect(group.children[0].userData).toEqual({ from: 0, to: 1, label: 'threshold' });

  setActiveHotspots(group, 1);

  expect(group.children.filter((child) => child.visible).map((child) => child.userData.from)).toEqual([1]);
});

test('wheel scrolls by pixels over the whole rail and arrow keys step', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const rail = new Rail(plan.rail);
  const director = new Director(rail, new PerspectiveCamera());
  const scrollBy = vi.spyOn(director, 'scrollBy');
  const step = vi.spyOn(director, 'step');
  const dispose = bindInputs(
    el,
    director,
    new PerspectiveCamera(),
    hotspotMarkers(plan.hotspots, plan.rail),
    plan.rail.length,
  );

  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 450, cancelable: true }));
  expect(scrollBy).toHaveBeenCalledWith(450 / (SCROLL_PIXELS_PER_VIEWPOINT * (plan.rail.length - 1)));

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  expect(step.mock.calls).toEqual([[1], [-1]]);

  dispose();
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
  expect(scrollBy).toHaveBeenCalledTimes(1);
  el.remove();
});
