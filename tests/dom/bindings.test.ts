// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { Director } from '../../src/camera/director';
import { Rail } from '../../src/camera/rail';
import { bindInputs } from '../../src/input/bindings';

const plan = layout(manifest, contract);
const projects = manifest.stops.filter(s => s.kind === 'project').map(s => s.id);

test('page-up wheel gestures move forward and page-down gestures reverse the camera', () => {
  const el = document.createElement('div'); document.body.append(el);
  const director = new Director(new Rail(plan.rail, plan.path), new PerspectiveCamera(), projects);
  director.jump(4);
  const dispose = bindInputs(el, director), start = director.u;
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
  for (let i = 0; i < 240; i++) director.update(1 / 60);
  expect(director.u).toBeGreaterThan(start);
  expect(director.velocity).toBeGreaterThan(0);
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
  for (let i = 0; i < 300; i++) director.update(1 / 60);
  expect(director.velocity).toBeLessThan(0);
  dispose(); el.remove();
});

test('wheel, touch and arrows start the flight; space toggles pause without key-repeat flicker', () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const rail = new Rail(plan.rail, plan.path);
  const director = new Director(rail, new PerspectiveCamera(), projects);
  const push = vi.spyOn(director, 'push');
  const step = vi.spyOn(director, 'step');
  const toggle = vi.spyOn(director, 'toggle');
  const glide = vi.spyOn(director, 'glideTo');
  const dispose = bindInputs(el, director);

  // Removing the spheres also removes their old scene-wide click targets.
  el.dispatchEvent(new MouseEvent('click', { clientX: 400, clientY: 300 }));
  expect(glide).not.toHaveBeenCalled();

  const wheel = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
  el.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  // Page-up scrolling moves forward; Firefox's three lines equal Chrome's 100 px.
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, cancelable: true }));
  expect(push.mock.calls.map(([px]) => Math.round(px))).toEqual([100, 100]);

  // A finger pulled 40 px down the screen travels forward too.
  const touch = (type: string, clientY: number) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientY }] });
    el.dispatchEvent(event);
    return event;
  };
  touch('touchstart', 300);
  expect(touch('touchmove', 340).defaultPrevented).toBe(true);
  touch('touchmove', 350);
  touch('touchend', 0);
  touch('touchmove', 100); // no finger down: ignored
  expect(push.mock.calls.slice(2)).toEqual([[40], [10]]);
  director.update(1 / 60);
  expect(director.travel.velocity).toBeGreaterThan(0);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
  expect(step.mock.calls).toEqual([[1], [-1]]);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
  expect(toggle).toHaveBeenCalledTimes(1);

  dispose();
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
  expect(push).toHaveBeenCalledTimes(4);
  el.remove();
});

test('expanded project details own scrolling and native controls own space', () => {
  const el = document.createElement('div');
  el.innerHTML = '<aside data-ui><section class="panel"><details open><summary>Read more</summary><p>Project details</p></details><button>Next</button></section></aside>';
  document.body.append(el);
  const director = new Director(new Rail(plan.rail, plan.path), new PerspectiveCamera(), projects);
  const push = vi.spyOn(director, 'push');
  const step = vi.spyOn(director, 'step');
  const dispose = bindInputs(el, director);
  const text = el.querySelector('p')!;
  const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  text.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  expect(push).not.toHaveBeenCalled();
  text.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(step).not.toHaveBeenCalled();
  el.querySelector('details')!.open = false;
  const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
  el.querySelector('button')!.dispatchEvent(space);
  expect(space.defaultPrevented).toBe(false);
  expect(step).not.toHaveBeenCalled();
  text.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
  expect(push).toHaveBeenCalledTimes(1);
  el.dataset.mode = 'static';
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(push).toHaveBeenCalledTimes(1);
  expect(step).not.toHaveBeenCalled();
  dispose();
  el.remove();
});
