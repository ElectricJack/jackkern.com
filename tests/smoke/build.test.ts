import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

test('vite build emits index.html, a bundle, and the CNAME', () => {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
  expect(existsSync(join(root, 'dist/index.html'))).toBe(true);
  expect(existsSync(join(root, 'dist/CNAME'))).toBe(true);
  expect(readdirSync(join(root, 'dist/bundle')).some((f) => f.endsWith('.js'))).toBe(true);
}, 120_000);
