import { ScrollPace } from '../../src/input/scroll-pace';
import { TRAVEL, wheelPixels } from '../../src/camera/travel';

test('gentle, ordinary and quick gestures select increasing, bounded speeds', () => {
  const gentle = new ScrollPace().push(20, 0)!;
  const ordinary = new ScrollPace().push(100, 0)!;
  const quick = new ScrollPace(); quick.push(100, 0);
  const fast = quick.push(100, 50)!;
  expect(gentle.speed).toBeLessThan(ordinary.speed);
  expect(ordinary.speed).toBe(TRAVEL.cruiseSpeed);
  expect(fast.speed).toBeGreaterThan(ordinary.speed);
  expect(quick.push(100000, 70)!.speed).toBe(TRAVEL.maxSpeed);
});

test('equivalent gestures use the same pace regardless of event fragmentation or wheel units', () => {
  const once = new ScrollPace().push(100, 0);
  const pieces = new ScrollPace(); let fragmented;
  for (let i = 0; i < 10; i++) fragmented = pieces.push(10, i * 10);
  expect(fragmented).toEqual(once);
  expect(new ScrollPace().push(wheelPixels({deltaY: 3, deltaMode: 1}), 0)).toEqual(once);
});

test('trackpad momentum retains pace, while a new slower gesture deliberately lowers it', () => {
  const pace = new ScrollPace();
  pace.push(100, 0); const fast = pace.push(100, 50)!;
  for (let time = 100; time < 800; time += 50) expect(pace.push(1, time)!.speed).toBe(fast.speed);
  expect(pace.push(20, 1100)!.speed).toBeLessThan(fast.speed);
  expect(pace.push(-100, 1110)).toEqual({direction: -1, speed: TRAVEL.cruiseSpeed});
});

test('arrival ignores residual motion until the gesture settles, including tiny momentum events', () => {
  const pace = new ScrollPace(); pace.push(100, 0); pace.hold();
  for (let time = 50; time < 1000; time += 50) expect(pace.push(.1, time)).toBeNull();
  expect(pace.push(100, 1000)).toBeNull();
  expect(pace.push(100, 1400)!.speed).toBe(TRAVEL.cruiseSpeed);
  for (const pixels of [0, NaN, Infinity]) expect(pace.push(pixels, 1500)).toBeNull();
});
