import { TRAVEL, Travel, wheelPixels } from '../../src/camera/travel';

const run = (travel: Travel, seconds: number, hz = 60) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) travel.advance(1 / hz);
};
const sample = (travel: Travel) => [travel.position, travel.velocity, travel.acceleration, travel.jerk];

test('a single start cruises the whole path, with ramps only at its ends', () => {
  const travel = new Travel(100);
  travel.start();
  expect(sample(travel)).toEqual([0, 0, 0, 0]);
  run(travel, 5);
  for (let i = 0; i < Math.floor(100 / TRAVEL.cruiseSpeed) - 6; i++) {
    expect(travel.velocity).toBe(TRAVEL.cruiseSpeed);
    expect(travel.acceleration).toBe(0);
    expect(travel.jerk).toBe(0);
    travel.advance(1);
  }
  run(travel, 20);
  expect(sample(travel)).toEqual([100, 0, 0, 0]);
  expect(travel.idle).toBe(true);
});

test('repeated start commands do not change position, speed, acceleration or jerk', () => {
  const once = new Travel(100), repeated = new Travel(100);
  once.start();
  for (let i = 0; i < 900; i++) {
    repeated.start();
    once.advance(1 / 60);
    repeated.advance(1 / 60);
    expect(sample(repeated)).toEqual(sample(once));
  }
});

test('the takeoff, cruise and arrival seams have continuous velocity, acceleration and jerk', () => {
  const offset = TRAVEL.controlSeconds / 2;
  const length = 100;
  for (const time of [0, TRAVEL.controlSeconds, TRAVEL.rampSeconds + offset, length / TRAVEL.cruiseSpeed + offset, length / TRAVEL.cruiseSpeed + TRAVEL.rampSeconds + offset]) {
    const left = new Travel(length), right = new Travel(length);
    left.start(); right.start();
    left.advance(Math.max(0, time - 1e-6)); right.advance(time + 1e-6);
    for (let k = 1; k < 4; k++) expect(Math.abs(sample(left)[k] - sample(right)[k])).toBeLessThan(1e-5);
  }
});

test('explicit pause and reversal preserve all three derivatives, including quick repeated commands', () => {
  const travel = new Travel(100);
  travel.reset(50);
  travel.start(); run(travel, 3);
  const before = sample(travel);
  travel.pause();
  expect(sample(travel)).toEqual(before);
  run(travel, 0.5);
  const pausing = sample(travel);
  travel.start(-1);
  expect(sample(travel)).toEqual(pausing);
  // The pause finishes before the queued reversal begins, with no derivative reset.
  run(travel, TRAVEL.controlSeconds - 0.5 - 1 / 60);
  const lastJerk = travel.jerk;
  travel.advance(1 / 60);
  expect(travel.velocity).toBeCloseTo(0, 9);
  expect(travel.acceleration).toBeCloseTo(0, 9);
  expect(travel.jerk).toBeCloseTo(0, 9);
  expect(Math.abs(lastJerk)).toBeLessThan(0.25);
  run(travel, 3);
  expect(travel.velocity).toBe(-TRAVEL.cruiseSpeed);
  travel.pause(); run(travel, 2);
  const resting = sample(travel);
  expect(resting.slice(1)).toEqual([0, 0, 0]);
  run(travel, 5);
  expect(sample(travel)).toEqual(resting);
});

test('pause/resume inside the arrival ramp is continuous and never overshoots the endpoint', () => {
  const travel = new Travel(100);
  travel.reset(99);
  travel.start(); run(travel, 0.5);
  const before = sample(travel);
  travel.pause(); expect(sample(travel)).toEqual(before);
  run(travel, 4);
  expect(travel.position).toBeLessThanOrEqual(100);
  expect(travel.velocity).toBe(0);
  travel.start(); run(travel, 10);
  expect(sample(travel)).toEqual([100, 0, 0, 0]);
});

test('flight and control transitions are independent of frame rate', () => {
  const at = (hz: number) => {
    const travel = new Travel(100);
    travel.start(); run(travel, 8, hz);
    travel.pause(); run(travel, 0.5, hz);
    travel.start(-1); run(travel, 4, hz);
    return sample(travel);
  };
  const baseline = at(60);
  for (const hz of [30, 144]) at(hz).forEach((value, i) => expect(value).toBeCloseTo(baseline[i], 9));
});

test('short visits lower peak speed and reverse flights arrive at exact endpoints', () => {
  for (const length of [0, 0.01, 1, 100]) {
    const travel = new Travel(length);
    travel.start(); run(travel, 100);
    expect(sample(travel)).toEqual([length, 0, 0, 0]);
    travel.start(-1); run(travel, 100);
    expect(sample(travel)).toEqual([0, 0, 0, 0]);
  }
});

test('wheelPixels normalises pixel, line and page deltas', () => {
  expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
  expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(100, 9);
  expect(wheelPixels({ deltaY: -1, deltaMode: 2 })).toBe(-TRAVEL.pageHeightPx);
});

test('speed changes preserve all derivatives and settle at the selected pace without new input', () => {
  const travel = new Travel(100); travel.start(); run(travel, 5);
  for (const speed of [TRAVEL.maxSpeed, TRAVEL.minSpeed, TRAVEL.cruiseSpeed]) {
    const before = sample(travel); travel.start(1, speed);
    expect(sample(travel)).toEqual(before);
    const left = new Travel(100), right = new Travel(100);
    for (const t of [left, right]) { t.start(); t.advance(5); t.start(1, speed); }
    left.advance(TRAVEL.controlSeconds - 1e-6); right.advance(TRAVEL.controlSeconds + 1e-6);
    for (let k = 1; k < 4; k++) expect(Math.abs(sample(left)[k] - sample(right)[k])).toBeLessThan(1e-4);
    run(travel, 3);
    expect(travel.velocity).toBeCloseTo(speed, 10);
    run(travel, 2);
    expect(travel.velocity).toBeCloseTo(speed, 10);
    expect(travel.acceleration).toBe(0); expect(travel.jerk).toBe(0);
  }
});

test('queued pace changes are frame-rate independent and always finish at rest on the destination', () => {
  const at = (hz: number) => {
    const t = new Travel(100); t.start(); run(t, 6, hz);
    t.start(1, TRAVEL.maxSpeed); run(t, .5, hz);
    t.start(1, TRAVEL.minSpeed); run(t, 4, hz);
    return sample(t);
  };
  const baseline = at(60);
  for (const hz of [30, 144]) at(hz).forEach((v, i) => expect(v).toBeCloseTo(baseline[i], 9));
  for (const length of [.01, 1, 100]) {
    const t = new Travel(length); t.start(1, TRAVEL.maxSpeed); run(t, .5);
    t.start(1, TRAVEL.minSpeed); run(t, 1); t.start(1, TRAVEL.maxSpeed);
    run(t, 150); expect(sample(t)).toEqual([length, 0, 0, 0]);
  }
});
