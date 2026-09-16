// @vitest-environment jsdom
import { Panels, escapeHtml, panelMarkup } from '../../src/panels/panels';

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
