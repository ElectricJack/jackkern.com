import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview } from 'vite';

const root = join(__dirname, '..', '..');
// Not dist/: building there would wipe the static captures `npm run build` put in it.
const out = mkdtempSync(join(tmpdir(), 'smoke-dist-'));

afterAll(() => rmSync(out, { recursive: true, force: true }));

test('vite build emits index.html, a bundle, and the CNAME', () => {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error', '--outDir', out, '--emptyOutDir'], { cwd: root, stdio: 'inherit' });
  expect(existsSync(join(out, 'index.html'))).toBe(true);
  expect(existsSync(join(out, 'CNAME'))).toBe(true);
  const scripts = readdirSync(join(out, 'bundle')).filter((f) => f.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(1);

  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const entry = html.match(/<script type="module" crossorigin src="\/bundle\/([^"]+\.js)"><\/script>/)?.[1];
  expect(entry).toBeDefined();
  expect(statSync(join(out, 'bundle', entry!)).size).toBeLessThan(8_000);
  expect(html).toContain('id="fallback"');
  // The villa starts on load: no gate to click, a loading state in its place.
  expect(html).not.toContain('enter-villa');
  expect(html).toContain('id="loading"');
}, 120_000);

test('vite preview answers a missing file with 404, not index.html', async () => {
  const server = await preview({ root, build: { outDir: out }, preview: { port: 4175 }, logLevel: 'error' });
  try {
    const base = server.resolvedUrls!.local[0];
    const page = await fetch(new URL('/?vp=5', base));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('id="fallback"');
    for (const missing of ['/static/no-such-view.jpg', '/no-such-page', '/bundle/no-such-chunk.js']) {
      expect((await fetch(new URL(missing, base))).status).toBe(404);
    }
  } finally {
    await server.close();
  }
}, 30_000);
