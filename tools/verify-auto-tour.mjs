/** Check real ten-second waits, default 3D and manual/reduced-motion controls in a built or public site. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { watch, problemCount } from './console-probe.mjs';

const server = process.argv[2] ? null : await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: true }, logLevel: 'error' });
const base = process.argv[2] ?? 'http://127.0.0.1:4179/';
const output = process.argv[3] ?? 'tmp/auto-tour';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { base, geometry: 'greybox for timing on software-rendered CI; verify-pages.mjs checks native mobile assets', checks: [] };
const landing = new URL('?assets=greybox', base).href;
const state = page => page.evaluate(() => ({ ...window.__villaTravel(), time: performance.now(), pageMode: document.querySelector('#app').dataset.mode }));
const ready = page => page.waitForFunction(() => window.__villaReady !== undefined && document.querySelector('#app').dataset.mode === 'scene', null, { timeout: 120000 });
const pose = value => [value.u, value.speed, value.acceleration, value.jerk];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1024, height: 640 }, deviceScaleFactor: .5, isMobile: mobile, hasTouch: mobile });
    const watcher = watch(page);
    await page.goto(landing); await ready(page);
    // Real time without capture mode, a view override, or any navigation input.
    const initial = await state(page);
    assert.equal(initial.pageMode, 'scene');
    assert.ok(initial.autoResumeIn > 8 && initial.autoResumeIn <= 10);
    await page.waitForTimeout(8500);
    const waiting = await state(page);
    assert.deepEqual(pose(waiting), [0, 0, 0, 0]);
    await page.waitForFunction(() => window.__villaTravel().mode === 'flight', null, { timeout: 10000 });
    const started = await state(page);
    assert.ok(started.time - initial.time >= 9000, 'Flight began before ten idle seconds');
    assert.ok(started.time - initial.time < 14000, 'Flight did not start promptly');
    console.log(mobile ? 'mobile' : 'desktop', 'default 3D and ten-second idle start pass');

    // The first reading stop must be reached by flight, not by a debug jump.
    await page.waitForFunction(() => {
      const travel = window.__villaTravel();
      return travel.u > 0 && travel.mode === 'paused' && travel.autoResumeIn > 9;
    }, null, { timeout: 180000 });
    const arrived = await state(page);
    const panel = page.locator('#panels .panel[data-stop="matter-engine"]');
    assert.equal(await panel.evaluate(el => !el.hidden && !el.inert && el.style.getPropertyValue('--pane-opacity') === '1.000'), true);
    await page.waitForTimeout(8500);
    assert.deepEqual(pose(await state(page)), pose(arrived));
    await page.waitForFunction(() => window.__villaTravel().mode === 'flight', null, { timeout: 10000 });
    const continued = await state(page);
    assert.ok(continued.time - arrived.time >= 9000, 'Project departure was early');
    assert.ok(continued.time - arrived.time < 14000, 'Project departure was late');
    console.log(mobile ? 'mobile' : 'desktop', 'project pause and automatic continuation pass');

    // A visitor can still pause for longer than the automatic reading interval.
    await page.locator('#next-space').click();
    await page.waitForFunction(() => window.__villaTravel().mode === 'paused');
    const paused = await state(page);
    await page.waitForTimeout(11000);
    assert.deepEqual(pose(await state(page)), pose(paused));
    assert.equal((await state(page)).autoResumeIn, null);
    watcher.stop();
    assert.equal(problemCount(watcher.found), 0, JSON.stringify(watcher.found));
    assert.equal(watcher.found.warnings.length, 0, JSON.stringify(watcher.found));
    report.checks.push({ mobile, initial, started, arrived, continued, manualPause: true, problems: watcher.found });
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: .5, reducedMotion: 'reduce' });
  const watcher = watch(page);
  await page.goto(landing); await ready(page);
  const initial = await state(page);
  assert.equal(initial.pageMode, 'scene');
  assert.equal(initial.autoResumeIn, null);
  await page.waitForTimeout(11000);
  assert.deepEqual(pose(await state(page)), pose(initial));
  await page.locator('#next-space').click();
  await page.waitForFunction(() => window.__villaTravel().u > 0);
  await page.locator('.journey-actions a').click();
  await page.waitForFunction(() => document.querySelector('#app').dataset.mode === 'static');
  watcher.stop();
  assert.equal(problemCount(watcher.found), 0, JSON.stringify(watcher.found));
  assert.equal(watcher.found.warnings.length, 0, JSON.stringify(watcher.found));
  report.reducedMotion = { default3D: true, waitsForInput: true, readingModeAvailable: true, problems: watcher.found };
  report.completed = true;
  console.log('Reduced motion opens stationary 3D; manual navigation and reading mode pass');
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await server?.close();
}
