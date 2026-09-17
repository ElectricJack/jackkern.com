import { chooseMode } from '../src/boot';

test('WebGL visits land in the scene; unsupported browsers retain the reading fallback', () => {
  expect(chooseMode({ webgl: true, capture: false })).toBe('scene');
  expect(chooseMode({ webgl: false, capture: false })).toBe('static');
  expect(chooseMode({ webgl: true, capture: true })).toBe('scene');
  expect(chooseMode({ webgl: false, capture: true })).toBe('static');
});

test('reading mode remains available by explicit choice; capture always requests the scene', () => {
  expect(chooseMode({ webgl: true, capture: false, view: 'scene' })).toBe('scene');
  expect(chooseMode({ webgl: false, capture: false, view: 'scene' })).toBe('static');
  expect(chooseMode({ webgl: true, capture: false, view: 'list' })).toBe('static');
  expect(chooseMode({ webgl: true, capture: true, view: 'list' })).toBe('scene');
  expect(chooseMode({ webgl: true, capture: false, view: 'unknown' })).toBe('scene');
});
