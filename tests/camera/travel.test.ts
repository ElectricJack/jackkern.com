import { TRAVEL, Travel, wheelPixels } from '../../src/camera/travel';

/** Runs the model at `hz` for `seconds`, returning the metres covered. */
const run = (travel: Travel, seconds: number, hz = 60) => {
  let metres = 0;
  for (let i = 0; i < Math.round(seconds * hz); i++) metres += travel.advance(1 / hz);
  return metres;
};

test('one mouse-wheel notch travels about half a metre and then stops', () => {
  const travel = new Travel();
  travel.push(100); // Chrome, Edge and Safari report a notch as 100 px
  expect(travel.velocity).toBeGreaterThan(0);
  const metres = run(travel, 2);
  expect(metres).toBeGreaterThan(0.45);
  expect(metres).toBeLessThan(0.55);
  expect(travel.velocity).toBe(0);
});

test('a push is spread over many frames, each shorter than the last, rather than taken in one step', () => {
  const travel = new Travel();
  travel.push(100);
  const first = travel.advance(1 / 60);
  const total = first + run(travel, 2);
  // Most of a notch is still to come after the first frame, and each frame covers less than the one before.
  expect(first).toBeLessThan(total * 0.1);
  let last = Infinity;
  const fresh = new Travel();
  fresh.push(100);
  for (let i = 0; i < 30; i++) {
    const step = fresh.advance(1 / 60);
    expect(step).toBeLessThanOrEqual(last);
    last = step;
  }
});

test('a hard trackpad flick coasts to a stop within a second of the last event', () => {
  const travel = new Travel();
  // A flick as a trackpad reports it: a quick burst of pixel deltas, one per frame.
  for (const px of [6, 18, 40, 70, 90, 90, 70, 45, 25, 10]) {
    travel.push(px);
    travel.advance(1 / 60);
  }
  expect(travel.velocity).toBeGreaterThan(0);
  expect(run(travel, 0.4)).toBeGreaterThan(0);
  expect(travel.velocity).toBeGreaterThan(0); // still coasting, not cut off
  run(travel, 0.6);
  expect(travel.velocity).toBe(0);
});

test('from top speed the camera stops within a second', () => {
  const travel = new Travel();
  for (let i = 0; i < 20; i++) travel.push(TRAVEL.maxEventPx);
  expect(travel.velocity).toBe(TRAVEL.maxSpeed);
  run(travel, 1);
  expect(travel.velocity).toBe(0);
});

test('speed is capped, so however fast the wheel spins no frame moves further than top speed allows', () => {
  const travel = new Travel();
  const dt = 1 / 60;
  let worst = 0;
  for (let frame = 0; frame < 120; frame++) {
    for (let event = 0; event < 8; event++) travel.push(120);
    worst = Math.max(worst, travel.advance(dt));
  }
  expect(travel.velocity).toBeLessThanOrEqual(TRAVEL.maxSpeed);
  expect(worst).toBeLessThanOrEqual(TRAVEL.maxSpeed * dt + 1e-12);
  // And the excess is dropped rather than banked: letting go stops it within a second.
  run(travel, 1);
  expect(travel.velocity).toBe(0);
});

test('a single event contributes at most maxEventPx', () => {
  const huge = new Travel();
  huge.push(100_000);
  const capped = new Travel();
  capped.push(TRAVEL.maxEventPx);
  const back = new Travel();
  back.push(-100_000);
  expect(huge.velocity).toBe(capped.velocity);
  expect(back.velocity).toBe(-capped.velocity);
  expect(run(huge, 2)).toBeCloseTo(run(capped, 2), 9);
});

test('pushing the other way brakes before it reverses', () => {
  const travel = new Travel();
  travel.push(100);
  travel.advance(1 / 60);
  const onward = travel.velocity;
  travel.push(-50);
  expect(travel.velocity).toBeGreaterThan(0);
  expect(travel.velocity).toBeLessThan(onward);
  travel.push(-150);
  expect(travel.velocity).toBeLessThan(0);
});

test('the distance a push covers does not depend on the frame rate', () => {
  const at = (hz: number) => {
    const travel = new Travel();
    travel.push(100);
    let metres = run(travel, 0.25, hz);
    travel.push(60);
    metres += run(travel, 2, hz);
    return metres;
  };
  expect(Math.abs(at(144) - at(60))).toBeLessThan(0.01);
  expect(Math.abs(at(30) - at(60))).toBeLessThan(0.01);
});

test('stop drops the velocity at once', () => {
  const travel = new Travel();
  travel.push(100);
  travel.stop();
  expect(travel.velocity).toBe(0);
  expect(travel.advance(1 / 60)).toBe(0);
});

test('wheelPixels normalises pixel, line and page deltas', () => {
  expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
  // Firefox reports a mouse-wheel notch as 3 lines; it should travel as far as Chrome's 100 px.
  expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(100, 9);
  expect(wheelPixels({ deltaY: -1, deltaMode: 2 })).toBe(-TRAVEL.pageHeightPx);
});
