/** Uses a local Vite dev server; writes actual browser captures and comparison metrics.
 * node tools/assets/verify-column.mjs /path/to/export-master [http://127.0.0.1:4322]
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { watch, problemCount } from '../console-probe.mjs';

const [master, base = 'http://127.0.0.1:4322'] = process.argv.slice(2);
if (!master) throw new Error('Pass the native export folder');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'docs/design/matter-pilot-column/export');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { backend: 'Chromium / SwiftShader; mobile viewport emulation, not physical device performance', views: {}, comparisons: {}, site: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const watcher = watch(page);
  await page.route('**/column-review', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><script type="module" src="/tools/assets/review-scene.mjs"></script></body></html>' }));
  await page.route('**/master.glb', (route) => route.fulfill({ contentType: 'model/gltf-binary', path: resolve(master, 'asset.glb') }));
  await page.goto(`${base}/column-review`);
  await page.waitForFunction(() => window.reviewReady);
  for (const tier of ['master', 'desktop', 'mobile']) {
    for (const view of ['overview', 'capital', 'base']) {
      const url = tier === 'master' ? '/master.glb' : `/assets/matter/column-doric/${tier}.glb`;
      report.views[`${tier}-${view}`] = await page.evaluate(({ url, view }) => window.reviewColumn(url, view), { url, view });
      await page.screenshot({ path: resolve(output, `${tier}-${view}.png`) });
    }
  }
  report.inspectionProblems = watcher.found;
  if (problemCount(watcher.found)) throw new Error('Column inspection failed');
  await page.close();
  for (const tier of ['desktop', 'mobile']) for (const view of ['overview', 'capital', 'base']) {
    const a = PNG.sync.read(await readFile(resolve(output, `master-${view}.png`)));
    const b = PNG.sync.read(await readFile(resolve(output, `${tier}-${view}.png`)));
    const mismatched = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
    let sum = 0;
    for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) sum += Math.abs(a.data[i] - b.data[i]);
    report.comparisons[`${tier}-${view}`] = { differingPixels: mismatched, totalPixels: a.width * a.height,
      meanRgbByteDifference: sum / (a.width * a.height * 3), note: 'Whole frame includes background; inspect close-up images too' };
  }
  for (const [tier, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const watcher = watch(page);
    await page.goto(`${base}/?assets=matter&capture=1`);
    await page.waitForFunction(() => window.__villaReady !== undefined, null, { timeout: 60000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).visibility === 'hidden');
    const requests = await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => entry.name.endsWith('.glb')).map((entry) => ({ url: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize })));
    if (requests.length !== 1 || !requests[0].url.endsWith(`/${tier}.glb`)) throw new Error('Wrong asset tier or duplicate downloads');
    await page.screenshot({ path: resolve(output, `villa-${tier}.png`) });
    const travel = await page.evaluate(() => window.__villaTravel());
    report.site.push({ tier, requests, travel, problems: watcher.found });
    if (problemCount(watcher.found) || watcher.found.warnings.length) throw new Error('Villa asset mode has browser problems');
    await page.close();
  }
} finally {
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
