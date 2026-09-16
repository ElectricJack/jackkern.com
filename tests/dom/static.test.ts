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

test('staticMarkup emits one image per viewpoint, in rail order, and each project panel once', () => {
  const html = staticMarkup(content, plan.rail);
  expect(html.match(/<figure class="static-view">/g)!.length).toBe(plan.rail.length);
  expect(html.indexOf('/static/entry-view.jpg')).toBeLessThan(html.indexOf('/static/matter-engine-enter.jpg'));
  expect(html.match(/data-stop="matter-engine"/g)!.length).toBe(1);
  expect(html).toContain('<h2>Matter &lt;Engine&gt;</h2>');
  expect(html.indexOf('/static/matter-engine-enter.jpg')).toBeLessThan(html.indexOf('data-stop="matter-engine"'));
});

test('renderStatic replaces the root and marks static mode', () => {
  const root = document.createElement('aside');
  root.innerHTML = '<section class="panel" data-stop="x" hidden></section>';
  renderStatic(root, content, plan.rail);
  expect(root.dataset.mode).toBe('static');
  expect(root.querySelector('[data-stop="x"]')).toBeNull();
  expect(root.querySelectorAll('img').length).toBe(plan.rail.length);
});

test('supportsWebGL is false in jsdom, which has no GL context', () => {
  expect(supportsWebGL()).toBe(false);
});
