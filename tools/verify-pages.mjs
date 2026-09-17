/** Check the built site under GitHub's project path, or a supplied public URL. */
import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { watch, problemCount } from './console-probe.mjs';

const server = process.argv[2] ? null : await preview({ base: '/jackkern.com/', preview: { host: '127.0.0.1', port: 4178, strictPort: true }, logLevel: 'error' });
const base = process.argv[2] ?? 'http://127.0.0.1:4178/jackkern.com/';
const output = process.argv[3] ?? 'tmp/pages-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { base, mobileViewport: { width: 390, height: 844 }, views: [] };
try {
  const page = await browser.newPage({ viewport: report.mobileViewport, isMobile: true, hasTouch: true });
  const watcher = watch(page);
  for (const vp of [0, 11]) {
    await page.goto(new URL(`?vp=${vp}`, base).href);
    await page.waitForFunction(v => window.__villaReady === v, vp, { timeout: 120000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).visibility === 'hidden');
    const assets = await page.evaluate(() => window.__villaAssets());
    if (assets.tier !== 'mobile' || Object.values(assets.loaded).some(value => value === 'fallback')) throw Error('Mobile assets did not load');
    if (vp === 11 && !['urn-large', 'gold-bar', 'gold-coin'].every(id => assets.loaded[id] === 'matter')) throw Error('Gold room is incomplete');
    const requests = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
    if (requests.some(url => new URL(url).origin === new URL(base).origin && !new URL(url).pathname.startsWith(new URL(base).pathname))) throw Error('A resource escaped the project path');
    await page.screenshot({ path: `${output}/mobile-${vp}.png` });
    report.views.push({ vp, assets, requests });
    if (vp === 0) {
      await page.evaluate(() => {
        const app = document.querySelector('#app');
        for (const [type, y] of [['touchstart', 300], ['touchmove', 450], ['touchend', 450]]) {
          const event = new Event(type, { cancelable: true });
          Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientY: y }] });
          app.dispatchEvent(event);
        }
      });
      await page.waitForFunction(() => window.__villaTravel().u > .00001, null, { timeout: 60000 });
      report.downwardSwipeMovesForward = true;
    }
  }
  await page.locator('.journey-actions a').click();
  await page.waitForFunction(() => document.querySelector('#app').dataset.mode === 'static');
  if (!page.url().startsWith(base)) throw Error('Reading mode left the project path');
  await page.waitForFunction(() => { const image = document.querySelector('#fallback img'); return image.complete && image.naturalWidth > 0; });
  const sceneLink = await page.locator('.static-intro a').getAttribute('href');
  if (!new URL(sceneLink, page.url()).href.startsWith(base)) throw Error('Scene link left the project path');
  report.staticImagesAndLinks = true;
  watcher.stop(); report.problems = watcher.found;
  if (problemCount(watcher.found) || watcher.found.warnings.length) throw Error(JSON.stringify(watcher.found));
  report.completed = true;
  console.log('Mobile scene, gold assets, swipe direction and reading mode pass at', base);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await server?.close();
}
