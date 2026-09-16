import { expect, test } from 'vitest';
import { canonical, fnv1a64 } from '../../layout/hash.js';

test('fnv1a64 matches the reference vectors', () => {
  expect(fnv1a64('')).toBe('cbf29ce484222325');
  expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
  expect(fnv1a64('foobar')).toBe('85944171f73967e8');
});

test('canonical sorts keys, drops whitespace and fixes numbers to six decimals', () => {
  expect(canonical({ b: 1, a: [true, null, 'x'] })).toBe('{"a":[true,null,"x"],"b":1.000000}');
  expect(canonical(0.1 + 0.2)).toBe('0.300000');
  expect(canonical({ z: { y: 2, x: 1 } })).toBe('{"z":{"x":1.000000,"y":2.000000}}');
});

test('canonical rejects non-finite numbers and undefined', () => {
  expect(() => canonical(NaN)).toThrow('non-finite');
  expect(() => canonical(undefined)).toThrow('unsupported');
});
