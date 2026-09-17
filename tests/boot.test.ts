import { chooseMode } from '../src/boot';

test('the scene runs only with WebGL and without a reduced-motion preference, except during capture', () => {
  expect(chooseMode({ webgl: true, reducedMotion: false, capture: false })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: false, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: true })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: false, capture: true })).toBe('static');
});

test('an explicit 3D choice overrides reduced motion but still requires WebGL', () => {
  expect(chooseMode({ webgl: true, reducedMotion: true, capture: false, view: 'scene' })).toBe('scene');
  expect(chooseMode({ webgl: false, reducedMotion: true, capture: false, view: 'scene' })).toBe('static');
  expect(chooseMode({ webgl: true, reducedMotion: false, capture: false, view: 'list' })).toBe('static');
});
