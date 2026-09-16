/**
 * Capture every rail viewpoint from the built site with headless Chromium.
 *
 *   node tools/render-static.mjs [--png <dir>] [--optional]
 *
 * Writes dist/static/<viewpoint>.jpg (served as the static fallback) and, with
 * --png, lossless copies for the visual check. Requires `vite build` first;
 * `npm run build` runs both.
 *
 * Fails when a capture logs a console error, throws, or has a request fail or
 * answer >= 400: a capture of a broken page is not a usable fallback image.
 *
 * --optional turns "Playwright's Chromium is not installed" into a warning and
 * a clean exit, so `npm run build` still works on a machine without it. Under
 * CI (the CI environment variable) it stays an error, so nothing deploys a
 * site without its fallback images.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { layout } from '../layout/layout.js';
import { problemCount, report, watch } from './console-probe.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const pngIndex = args.indexOf('--png');
const pngDir = pngIndex === -1 ? null : resolve(args[pngIndex + 1]);
const optional = args.includes('--optional') && !process.env.CI;
const outDir = join(root, 'dist/static');

/** A 1x1 transparent GIF. */
const PLACEHOLDER = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
const contract = JSON.parse(await readFile(join(root, 'kit/contract.json'), 'utf8'));
const plan = layout(manifest, contract);

let browser;
try {
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
} catch (error) {
  if (!/Executable doesn't exist/.test(error.message)) throw error;
  if (!optional) {
    console.error(
      'render-static: Playwright\'s Chromium is not installed; install it with ' +
      '`npx playwright install --with-deps chromium`' +
      (process.env.CI ? ' (under CI the capture is required, --optional or not)' : ''),
    );
    process.exit(1);
  }
  console.warn(
    'render-static: SKIPPED — Playwright\'s Chromium is not installed, so dist/ has no static\n' +
    'fallback images and the no-WebGL page will show broken ones. Do not deploy this build.\n' +
    'Install it with `npx playwright install chromium`, then run `npm run build` again.',
  );
  process.exit(0);
}

const server = await preview({ root, preview: { port: 4173 }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

// The page links the very images this run produces, so on a fresh build they
// do not exist yet. The fallback is hidden while the scene is captured; stand
// in for them rather than count their 404s against the capture.
await page.route('**/static/*.jpg', (route) => route.fulfill({ contentType: 'image/gif', body: PLACEHOLDER }));

await mkdir(outDir, { recursive: true });
if (pngDir) await mkdir(pngDir, { recursive: true });

const runs = [];
try {
  for (let index = 0; index < plan.rail.length; index++) {
    const viewpoint = plan.rail[index];
    const watcher = watch(page);
    const path = `/?vp=${index}&capture=1`;
    let failed = false;
    try {
      await page.goto(new URL(path, base).href, { waitUntil: 'load' });
      await page.waitForFunction((expected) => window.__villaReady === expected, index, { timeout: 60_000 });
      await page.waitForTimeout(100);
      await page.screenshot({ path: join(outDir, `${viewpoint.id}.jpg`), type: 'jpeg', quality: 80 });
      if (pngDir) await page.screenshot({ path: join(pngDir, `${viewpoint.id}.png`), type: 'png' });
    } catch (error) {
      // A page that never became ready will not become ready on the next viewpoint either.
      watcher.found.pageErrors.push(`capture: ${error.message}`);
      failed = true;
    } finally {
      watcher.stop();
    }
    if (problemCount(watcher.found)) runs.push({ mode: 'swiftshader', path, renderer: '', steps: [], found: watcher.found });
    console.log(`static ${viewpoint.id}${problemCount(watcher.found) ? ' — problems, see below' : ''}`);
    if (failed) break;
  }
} finally {
  await browser.close();
  await server.close();
}

if (runs.length) {
  report(runs);
  console.error(`render-static: ${runs.length} capture(s) reported problems; the static images are not trustworthy`);
  process.exit(1);
}
