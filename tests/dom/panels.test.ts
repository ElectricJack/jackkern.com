// @vitest-environment jsdom
import { Panels, escapeHtml, panelMarkup, paneVisibility } from '../../src/panels/panels';
import type { Viewpoint } from '../../src/types';

const content = [
  { id: 'a', title: 'A & B', html: '<p>alpha</p>', screenshots: ['/img/a.jpg'] },
  { id: 'b', title: 'B', html: '<p>beta</p>', screenshots: [] },
];

test('escapeHtml escapes the four HTML specials', () => {
  expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});

test('panelMarkup renders hidden sections with escaped titles and screenshots', () => {
  const html = panelMarkup(content);
  expect(html).toContain('<section class="panel" data-stop="a" hidden>');
  expect(html).toContain('<h2>A &amp; B</h2>');
  expect(html).toContain('<img src="/img/a.jpg"');
  expect(html).toContain('<p>alpha</p>');
});

test('Panels shows one section at a time and reuses injected markup', () => {
  const root = document.createElement('aside');
  root.innerHTML = panelMarkup(content);
  const panels = new Panels(root, content);
  panels.show('b');
  expect(root.querySelector<HTMLElement>('[data-stop="a"]')!.hidden).toBe(true);
  expect(root.querySelector<HTMLElement>('[data-stop="b"]')!.hidden).toBe(false);
  panels.show(null);
  expect(root.querySelector<HTMLElement>('[data-stop="b"]')!.hidden).toBe(true);
});

test('Panels renders markup itself when the root is empty', () => {
  const root = document.createElement('aside');
  new Panels(root, content);
  expect(root.querySelectorAll('section.panel').length).toBe(2);
});

test('project fades are continuous in either direction and courtyards have no pane', () => {
  expect(paneVisibility(0.19, 0.2, 0.3, 0.02)).toBeCloseTo(0.5);
  expect(paneVisibility(0.31, 0.2, 0.3, 0.02)).toBeCloseTo(0.5);
  const root = document.createElement('aside');
  const panels = new Panels(root, content);
  panels.setRoute(['entry', 'a', 'a', 'courtyard', 'b'].map((stop) => ({ stop }) as Viewpoint), [0, 0.2, 0.3, 0.5, 0.7], 90);
  const a = root.querySelector<HTMLElement>('[data-stop="a"]')!;
  for (const u of [0.19, 0.25, 0.31]) {
    panels.update(u);
    expect(a.hidden).toBe(false);
    expect(a.inert).toBe(false);
  }
  panels.update(0.181);
  expect(a.inert).toBe(true); // almost transparent cards cannot receive input
  panels.update(0.5);
  expect([...root.querySelectorAll<HTMLElement>('.panel')].every((s) => s.hidden && s.inert)).toBe(true);
});

test('a focused project remains readable until focus leaves, then closes its details', () => {
  const root = document.createElement('aside');
  document.body.append(root);
  const panels = new Panels(root, content);
  panels.show('a');
  const a = root.querySelector<HTMLElement>('[data-stop="a"]')!;
  const details = a.querySelector('details')!;
  details.open = true;
  details.querySelector('summary')!.focus();
  panels.show('b');
  expect(a.hidden).toBe(false);
  expect(details.open).toBe(true);
  expect(a.style.getPropertyValue('--pane-opacity')).toBe('1.000');
  (document.activeElement as HTMLElement).blur();
  panels.show('b');
  expect(a.hidden).toBe(true);
  expect(a.inert).toBe(true);
  expect(details.open).toBe(false);
  root.remove();
});
