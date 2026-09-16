import { join } from 'node:path';
import { buildContent } from '../../tools/content.mjs';

const root = join(__dirname, '..', '..');

test('buildContent renders one entry per project stop in manifest order', async () => {
  const content = await buildContent(root);
  expect(content.map((c) => c.id)).toEqual(['matter-engine', 'outrider-ide', 'agent-queue', 'quilt-trader']);
  expect(content[0].title).toBe('Matter Engine');
  expect(content[0].html).toContain('<p>');
  expect(content[0].html).toContain('href="https://github.com/ElectricJack/matter-engine"');
  expect(Array.isArray(content[0].screenshots)).toBe(true);
});
