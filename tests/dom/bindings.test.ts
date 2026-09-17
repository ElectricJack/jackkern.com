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

test('wheel and keyboard input cannot interrupt a quick-link transition', () => {
  const el = document.createElement('div');
  document.body.append(el);
  el.dataset.travelling = '';
  const director = new Director(new Rail(plan.rail, plan.path), new PerspectiveCamera(), projects);
  const push = vi.spyOn(director, 'push');
  const step = vi.spyOn(director, 'step');
  const toggle = vi.spyOn(director, 'toggle');
  const dispose = bindInputs(el, director);
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  expect(push).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
  expect(toggle).not.toHaveBeenCalled();
  delete el.dataset.travelling;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(step).toHaveBeenCalledWith(-1);
  dispose(); el.remove();
});

test('page-up wheel gestures move forward and page-down gestures reverse the camera', () => {
  const el = document.createElement('div'); document.body.append(el);
  const director = new Director(new Rail(plan.rail, plan.path), new PerspectiveCamera(), projects);
  director.jump(4);
  const dispose = bindInputs(el, director), start = director.u;
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
  for (let i = 0; i < 90; i++) director.update(1 / 60);
  expect(director.u).toBeGreaterThan(start);
  expect(director.velocity).toBeGreaterThan(0);
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
  for (let i = 0; i < 90; i++) director.update(1 / 60);
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
  expect(step.mock.calls).toEqual([[-1], [1]]);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
  expect(toggle).toHaveBeenCalledTimes(1);

  dispose();
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
  expect(push).toHaveBeenCalledTimes(4);
  el.remove();
});

test.each([['ArrowUp', 1], ['ArrowRight', 1], ['ArrowDown', -1], ['ArrowLeft', -1], ['PageDown', 1], ['PageUp', -1]] as const)(
  '%s moves the camera in direction %s', (key, direction) => {
    const el = document.createElement('div'); document.body.append(el);
    const director = new Director(new Rail(plan.rail, plan.path), new PerspectiveCamera(), projects);
    director.jump(director.readingViews[1]);
    const start = director.u, dispose = bindInputs(el, director);
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    window.dispatchEvent(event);
    for (let i = 0; i < 120; i++) director.update(1 / 60);
    expect(event.defaultPrevented).toBe(true);
    expect((director.u - start) * direction).toBeGreaterThan(0);
    dispose(); el.remove();
  },
);

test('project previews always own scrolling and native controls own space', () => {
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
  expect(push).not.toHaveBeenCalled();
  el.dataset.mode = 'static';
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(push).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
  dispose();
  el.remove();
});

test('pointer and touch activity restart the entrance idle timer and disposal removes the listeners', () => {
  const el = document.createElement('div'); document.body.append(el);
  const director = new Director(new Rail(plan.rail, plan.path), new PerspectiveCamera(), projects);
  const dispose = bindInputs(el, director);
  director.setAutoplay(true);
  for (const type of ['pointermove', 'pointerdown', 'touchstart', 'touchmove', 'keydown']) {
    director.update(9);
    window.dispatchEvent(new Event(type));
    expect(director.autoResumeIn).toBe(10);
  }
  dispose(); director.update(9);
  window.dispatchEvent(new Event('pointermove'));
  expect(director.autoResumeIn).toBe(1);
  el.remove();
});
