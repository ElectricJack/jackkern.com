import { chooseMode } from '../src/boot';

test('the scene runs only with WebGL and without a reduced-motion preference, except during capture', () => {
  expect(chooseMode({ webgl: true, reducedMotion: false, capture: false })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: false, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: true })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: false, capture: true })).toBe('static');
});
