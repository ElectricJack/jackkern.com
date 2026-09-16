import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

test('vite build emits index.html, a bundle, and the CNAME', () => {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
  expect(existsSync(join(root, 'dist/index.html'))).toBe(true);
  expect(existsSync(join(root, 'dist/CNAME'))).toBe(true);
  const scripts = readdirSync(join(root, 'dist/bundle')).filter((f) => f.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(1);

  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  const entry = html.match(/<script type="module" crossorigin src="\/bundle\/([^"]+\.js)"><\/script>/)?.[1];
  expect(entry).toBeDefined();
  expect(statSync(join(root, 'dist/bundle', entry!)).size).toBeLessThan(8_000);
  expect(html).toContain('id="fallback"');
}, 120_000);
