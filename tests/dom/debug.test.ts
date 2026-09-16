// @vitest-environment jsdom
import { debugRequested, describe as describeValue, installCollector, type DebugLog } from '../../src/debug/collect';
import { formatEntry, mountOverlay, reportText } from '../../src/debug/overlay';

let log: DebugLog | null = null;
const silence = { error: console.error, warn: console.warn };

beforeEach(() => {
  // The collector passes console calls through; keep them out of the test output.
  console.error = vi.fn();
  console.warn = vi.fn();
  // jsdom has no WebGL and reports that as a console error, which the collector would then record.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  document.head.innerHTML = '';
  document.body.innerHTML = '<main id="app" data-mode="static"></main>';
});

afterEach(() => {
  log?.dispose();
  log = null;
  vi.restoreAllMocks();
  console.error = silence.error;
  console.warn = silence.warn;
});

test('debug is on for ?debug and ?debug=1, off for ?debug=0, ?debug=false and no parameter', () => {
  expect(debugRequested('?debug=1')).toBe(true);
  expect(debugRequested('?vp=5&debug')).toBe(true);
  expect(debugRequested('?debug=0')).toBe(false);
  expect(debugRequested('?debug=false')).toBe(false);
  expect(debugRequested('?vp=5')).toBe(false);
});

test('describe keeps an error name, message and stack, and stringifies other values', () => {
  const error = new TypeError('boom');
  expect(describeValue(error)).toContain('TypeError: boom');
  expect(describeValue(error)).toContain('debug.test.ts');
  expect(describeValue('plain')).toBe('plain');
  expect(describeValue({ a: 1 })).toBe('{"a":1}');
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(describeValue(cyclic)).toBe('[object Object]');
});

test('the collector records uncaught errors, rejections, console errors and warnings, and failed resources', () => {
  const passedThrough = console.error;
  log = installCollector(window);

  window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught'), message: 'uncaught' }));
  window.dispatchEvent(new ErrorEvent('error', { message: 'script error', filename: 'a.js', lineno: 3, colno: 7 }));
  const rejection = new Event('unhandledrejection');
  Object.assign(rejection, { reason: new Error('rejected') });
  window.dispatchEvent(rejection);
  console.error('villa: falling back to static', new Error('no context'));
  console.warn('villa: WebGL context lost');
  const img = document.createElement('img');
  img.setAttribute('src', '/static/missing.jpg');
  document.body.append(img);
  img.dispatchEvent(new Event('error'));

  expect(log.entries.map((entry) => entry.kind)).toEqual([
    'error', 'error', 'rejection', 'console.error', 'console.warn', 'resource',
  ]);
  const messages = log.entries.map((entry) => entry.message);
  expect(messages[0]).toContain('Error: uncaught');
  expect(messages[1]).toBe('script error (a.js:3:7)');
  expect(messages[2]).toContain('Error: rejected');
  expect(messages[3]).toMatch(/^villa: falling back to static Error: no context/);
  expect(messages[4]).toBe('villa: WebGL context lost');
  expect(messages[5]).toBe('failed to load <img> /static/missing.jpg');
  expect(passedThrough).toHaveBeenCalledWith('villa: falling back to static', expect.any(Error));
});

test('dispose restores console and stops collecting', () => {
  const before = console.error;
  log = installCollector(window);
  expect(console.error).not.toBe(before);
  log.dispose();
  expect(console.error).toBe(before);
  window.dispatchEvent(new ErrorEvent('error', { message: 'after' }));
  expect(log.entries).toEqual([]);
});

test('a subscriber that logs an error does not loop', () => {
  log = installCollector(window);
  const seen = vi.fn(() => console.error('from the listener'));
  log.subscribe(seen);
  console.error('first');
  expect(seen).toHaveBeenCalledTimes(1);
  expect(log.entries.map((entry) => entry.message)).toEqual(['first', 'from the listener']);
});

test('the overlay lists entries collected before and after it mounts', () => {
  log = installCollector(window);
  console.error('early');
  const root = mountOverlay(log, window);

  expect(document.getElementById('debug-overlay')).toBe(root);
  expect(root.querySelectorAll('li').length).toBe(1);
  expect(root.querySelector('[data-count]')!.textContent).toBe('1 entry');

  console.warn('late');
  const items = [...root.querySelectorAll('li')];
  expect(items.map((item) => item.dataset.kind)).toEqual(['console.error', 'console.warn']);
  expect(items[1].textContent).toBe(formatEntry(log.entries[1]));
  expect(root.querySelector('[data-count]')!.textContent).toBe('2 entries');
});

test('the overlay says when nothing has been collected', () => {
  log = installCollector(window);
  const root = mountOverlay(log, window);
  expect(root.querySelector('li.empty')?.textContent).toContain('Nothing collected yet');
  console.error('now something');
  expect(root.querySelector('li.empty')).toBeNull();
});

test('copy puts the environment and every entry on the clipboard', async () => {
  log = installCollector(window);
  console.error('copied error');
  const writeText = vi.fn(async (_text: string) => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  const root = mountOverlay(log, window);
  const copy = root.querySelector('[data-action="copy"]') as HTMLButtonElement;
  copy.click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

  const text = writeText.mock.calls[0][0];
  expect(text).toBe(reportText(log, window));
  expect(text).toContain(`url: ${location.href}`);
  expect(text).toContain('mode: static');
  expect(text).toContain('entries: 1');
  expect(text).toContain('console.error: copied error');
  expect(copy.textContent).toBe('Copied');
});

test('copy falls back to selected text when the clipboard is refused', async () => {
  log = installCollector(window);
  console.warn('kept');
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => { throw new Error('denied'); } },
    configurable: true,
  });

  const root = mountOverlay(log, window);
  (root.querySelector('[data-action="copy"]') as HTMLButtonElement).click();
  const manual = root.querySelector('textarea') as HTMLTextAreaElement;
  await vi.waitFor(() => expect(manual.hidden).toBe(false));
  expect(manual.value).toContain('console.warn: kept');
});

test('hide collapses the list and show brings it back', () => {
  log = installCollector(window);
  const root = mountOverlay(log, window);
  const toggle = root.querySelector('[data-action="toggle"]') as HTMLButtonElement;
  const list = root.querySelector('ol') as HTMLOListElement;

  toggle.click();
  expect(list.hidden).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  toggle.click();
  expect(list.hidden).toBe(false);
  expect(toggle.textContent).toBe('Hide');
});
