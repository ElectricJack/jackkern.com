// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import { bindInputs, hotspotMarkers, setActiveHotspots } from '../../src/input/bindings';

const plan = layout(manifest, contract);

test('hotspotMarkers creates one hidden marker per hotspot with viewpoint indices', () => {
  const group = hotspotMarkers(plan.hotspots, plan.rail);

  expect(group.children.length).toBe(plan.hotspots.length);
  expect(group.children.every((child) => child.visible === false)).toBe(true);
  expect(group.children[0].userData).toEqual({ from: 0, to: 1, label: 'threshold' });

  setActiveHotspots(group, 1);

  expect(group.children.filter((child) => child.visible).map((child) => child.userData.from)).toEqual([1]);
});

test('wheel and touch push the camera by pixels, whatever unit the wheel reports, and arrow keys step', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const rail = new Rail(plan.rail, plan.path);
  const director = new Director(rail, new PerspectiveCamera());
  const push = vi.spyOn(director, 'push');
  const step = vi.spyOn(director, 'step');
  const dispose = bindInputs(el, director, new PerspectiveCamera(), hotspotMarkers(plan.hotspots, plan.rail));

  const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
  el.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  // Firefox's notch: 3 lines, the same distance as Chrome's 100 px.
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true }));
  expect(push.mock.calls.map(([px]) => Math.round(px))).toEqual([100, 100]);

  // A finger dragged 40 px up the screen walks onward, like the wheel.
  const touch = (type: string, clientY: number) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientY }] });
    el.dispatchEvent(event);
    return event;
  };
  touch('touchstart', 300);
  expect(touch('touchmove', 260).defaultPrevented).toBe(true);
  touch('touchmove', 250);
  touch('touchend', 0);
  touch('touchmove', 100); // no finger down: ignored
  expect(push.mock.calls.slice(2)).toEqual([[40], [10]]);
  expect(director.travel.velocity).toBeGreaterThan(0);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  expect(step.mock.calls).toEqual([[1], [-1]]);

  dispose();
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
  expect(push).toHaveBeenCalledTimes(4);
  el.remove();
});
