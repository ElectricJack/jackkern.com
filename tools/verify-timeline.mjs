/** Exercise the real Matter scene, not just the lightweight navigation fixture. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const server = process.argv[2] ? null : await preview({ preview: { host: '127.0.0.1', port: 4182, strictPort: true }, logLevel: 'error' });
const base = process.argv[2] ?? 'http://127.0.0.1:4182/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: .5 });
page.setDefaultTimeout(120000);
const results = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = 'tmp/timeline';
await mkdir(output, { recursive: true });
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
  await page.emulateMedia({ reducedMotion });
  await page.goto(`${base}?capture=1&vp=2`);
  await page.waitForFunction(() => window.__villaReady !== undefined);
  for (const [to, distant] of [['outrider-ide', false], ['quilt-trader', true], ['matter-engine', true], ['entry', false], ['agent-queue', true], ['terrace', true]]) {
    console.log('Timeline →', to, reducedMotion);
    await page.evaluate(() => {
      window.motionFrames = [];
      window.monitorMotion = true;
      const sample = () => {
        if (!window.monitorMotion) return;
        const motion = window.__villaTravel();
        if (motion.quickVisiting) {
          const overlay = getComputedStyle(document.querySelector('#app'), '::after');
          window.motionFrames.push({ metres: motion.metres, position: motion.position, opacity: motion.transitionOpacity,
            white: Number(overlay.opacity), color: overlay.backgroundColor, canvasOpacity: getComputedStyle(document.querySelector('#villa')).opacity });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.locator(`#route-map [data-stop="${to}"]`).click();
    await page.waitForFunction(id => document.querySelector('#app').dataset.place === id && !document.querySelector('#app').hasAttribute('data-travelling'), to);
    const frames = await page.evaluate(() => { window.monitorMotion = false; return window.motionFrames; });
    results.push({ to, distant, reducedMotion, frames });
    assert.ok(frames.length >= 10, 'Render stalls must not swallow the animation');
    assert.ok(new Set(frames.map(f => f.position.join(','))).size >= 10, 'The camera must visibly move');
    assert.ok(frames.every(f => f.canvasOpacity === '1' && f.color === 'rgb(255, 255, 255)'));
    if (distant) {
      const covered = frames.findIndex(f => f.white === 1);
      assert.ok(covered > 1);
      assert.ok(frames.slice(0, covered).some(f => f.white === 0));
      assert.ok(frames.slice(covered + 1).some(f => f.white === 0));
      for (const phase of [frames.slice(0, covered), frames.slice(covered + 1)]) {
        const fading = phase.filter(f => f.white > 0 && f.white < 1);
        assert.ok(new Set(fading.map(f => f.metres)).size > 1, 'Camera motion must continue during each fade');
      }
      const cut = frames.findIndex((f, i) => i > 0 && Math.abs(f.metres - frames[i - 1].metres) > 10);
      assert.ok(cut > 0, 'Distant links must skip along the path');
      assert.equal(frames[cut - 1].white, 1);
      assert.equal(frames[cut].white, 1);
    } else assert.ok(frames.every(f => f.white === 0), 'Adjacent timeline links must fly without fading');
  }
  if (reducedMotion === 'reduce') assert.equal(await page.evaluate(() => window.__villaTravel().autoResumeIn), null);
  }
  assert.deepEqual(errors, []);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#route-map [data-stop="quilt-trader"]').click();
  await page.waitForFunction(() => document.querySelector('#app').dataset.place === 'quilt-trader' && !document.querySelector('#app').hasAttribute('data-travelling'));
  assert.equal(await page.evaluate(() => window.__villaTravel().quickVisiting), false);
  await page.locator('#route-map [data-stop="agent-queue"]').click();
  await page.waitForFunction(() => document.querySelector('#app').dataset.place === 'agent-queue' && !document.querySelector('#app').hasAttribute('data-travelling'));
  assert.ok((await page.locator('#panels [data-stop="agent-queue"] img').first().getAttribute('src')).endsWith('/agent-graph.webp'));
  const pause = async () => {
    await page.locator('#next-space').click();
    await page.waitForFunction(() => window.__villaTravel().mode === 'paused');
  };
  for (const [key, sign] of [['ArrowUp', 1], ['ArrowDown', -1], ['ArrowRight', 1], ['ArrowLeft', -1]]) {
    const start = await page.evaluate(() => window.__villaTravel().u);
    await page.keyboard.press(key);
    await page.waitForFunction(({ start, sign }) => (window.__villaTravel().u - start) * sign > .001, { start, sign });
    await pause();
  }
  // ArrowLeft was the last movement; the visible forward button must override it.
  const beforeForward = await page.evaluate(() => window.__villaTravel().u);
  await page.locator('#next-space').click();
  await page.waitForFunction(start => window.__villaTravel().u > start + .001, beforeForward);
  await pause();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}?view=list`);
    await page.locator('#project-agent-queue').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('#project-agent-queue img')].every(img => img.complete && img.naturalWidth > 0));
    const header = await page.locator('.site-header').evaluate(el => {
      const rect = el.getBoundingClientRect(), backdrop = getComputedStyle(el, '::before');
      return { top: rect.top, coveredTop: rect.top + parseFloat(backdrop.top), bottom: backdrop.bottom, background: backdrop.backgroundImage };
    });
    assert.equal(header.top, width === 390 ? 16 : 30, 'Keep the original header position');
    assert.equal(header.coveredTop, 0, 'Backdrop must cover the gap above the header');
    assert.equal(header.bottom, '-28px', 'Fade out below the header');
    const screenshot = await page.screenshot({ path: `${output}/header-${width}.png` });
    const png = PNG.sync.read(screenshot);
    const pixel = (2 * png.width + Math.floor(png.width / 2)) * 4;
    assert.deepEqual([...png.data.slice(pixel, pixel + 3)], [244, 242, 233], 'Top edge must remain opaque over scrolled content');
    assert.ok((await page.locator('#project-agent-queue img').first().getAttribute('src')).endsWith('/agent-graph.webp'));
  }
  assert.deepEqual(errors, []);
  console.log('All timeline buttons animate under both motion preferences; arrow keys, forward button, header and screenshot order: passed');
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ errors, results }, null, 2));
  await browser.close();
  await server?.close();
}
