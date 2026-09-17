// @vitest-environment jsdom
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { renderStatic, staticMarkup, supportsWebGL } from '../../src/fallback/static';

const plan = layout(manifest, contract);
const content = [
  { id: 'matter-engine', title: 'Matter <Engine>', html: '<p>m</p>', screenshots: [] },
  { id: 'agent-queue', title: 'Agent Queue', html: '<p>a</p>', screenshots: [] },
];

test('the scrolling portfolio includes every project and visible lazy imagery without expansion', () => {
  const html = staticMarkup(content, plan.rail);
  expect(html).not.toContain('<details');
  expect(html.match(/loading="lazy"/g)!.length).toBe(content.length);
  expect(html).toContain('matter-engine-enter.jpg');
  expect(html.match(/data-stop="matter-engine"/g)!.length).toBe(1);
  expect(html).toContain('<h2>Matter &lt;Engine&gt;</h2>');
  expect(html.indexOf('data-stop="matter-engine"')).toBeLessThan(html.indexOf('data-stop="agent-queue"'));
});

test('renderStatic replaces the root and marks static mode', () => {
  const root = document.createElement('aside');
  root.innerHTML = '<section class="panel" data-stop="x" hidden></section>';
  renderStatic(root, content, plan.rail);
  expect(root.dataset.mode).toBe('static');
  expect(root.querySelector('[data-stop="x"]')).toBeNull();
  expect(root.querySelectorAll('img').length).toBe(content.length);
});

test('supportsWebGL is false in jsdom, which has no GL context', () => {
  expect(supportsWebGL()).toBe(false);
});
