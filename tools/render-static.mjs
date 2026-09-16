/**
 * Capture every rail viewpoint from the built site with headless Chromium.
 *
 *   node tools/render-static.mjs [--png <dir>]
 *
 * Writes dist/static/<viewpoint>.jpg (served as the static fallback) and, with
 * --png, lossless copies for the visual check. Requires `npm run build` first.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { layout } from '../layout/layout.js';

const root = process.cwd();
const args = process.argv.slice(2);
const pngIndex = args.indexOf('--png');
const pngDir = pngIndex === -1 ? null : resolve(args[pngIndex + 1]);
const outDir = join(root, 'dist/static');

const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
const contract = JSON.parse(await readFile(join(root, 'kit/contract.json'), 'utf8'));
const plan = layout(manifest, contract);

const server = await preview({ root, preview: { port: 4173, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

await mkdir(outDir, { recursive: true });
if (pngDir) await mkdir(pngDir, { recursive: true });

try {
  for (let index = 0; index < plan.rail.length; index++) {
    const viewpoint = plan.rail[index];
    await page.goto(`${base}?vp=${index}&capture=1`, { waitUntil: 'load' });
    await page.waitForFunction((expected) => window.__villaReady === expected, index, { timeout: 60_000 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: join(outDir, `${viewpoint.id}.jpg`), type: 'jpeg', quality: 80 });
    if (pngDir) await page.screenshot({ path: join(pngDir, `${viewpoint.id}.png`), type: 'png' });
    console.log(`static ${viewpoint.id}`);
  }
} finally {
  await browser.close();
  await server.close();
}
