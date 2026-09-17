/** Browser checks for the portfolio feedback pass. Start Vite first. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { preview } from 'vite';
const server = process.argv[2] ? null : await preview({ preview: { host: '127.0.0.1', port: 4182, strictPort: true }, logLevel: 'error' });
const base = process.argv[2] ?? 'http://127.0.0.1:4182/';
const output = 'tmp/feedback';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { base, errors: [], views: [], shortcuts: [] };
const projects = ['matter-engine', 'outrider-ide', 'agent-queue', 'quilt-trader'];
try {
  for (const mobile of [false, true]) {
    console.log('Checking', mobile ? 'mobile' : 'desktop');
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}?capture=1`);
    await page.waitForFunction(() => window.__villaReady !== undefined, null, { timeout: 120000 });
    const initial = await page.evaluate(() => ({ stats: window.__villaRenderStats(), assets: window.__villaAssets(), pixels: document.querySelector('canvas').width * document.querySelector('canvas').height }));
    assert.deepEqual(initial.stats.residentStops, ['entry', 'matter-engine']);
    if (mobile) assert.equal(initial.stats.reflectionPasses, 0);
    report.views.push({ mobile, initial });
    assert.equal(await page.locator('#route-map [data-stop^="cy-"]').count(), 0);
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-entry.png` });
    const go = async stop => {
      await page.locator(`#route-map [data-stop="${stop}"]`).click();
      await page.waitForFunction(id => document.querySelector('#app').dataset.place === id && !document.querySelector('#app').hasAttribute('data-travelling'), stop);
    };
    for (const from of projects) {
      console.log('Project', from);
      await go(from);
      await page.waitForTimeout(1100);
      await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-${from}.png` });
      assert.equal(await page.locator(`#panels [data-stop="${from}"] details`).count(), 0);
      assert.equal(await page.locator(`#panels [data-stop="${from}"] .project-links a`).first().isVisible(), true);
      const card = await page.locator(`#panels [data-stop="${from}"]`).boundingBox();
      const link = await page.locator(`#panels [data-stop="${from}"] .project-links a`).first().boundingBox();
      assert.ok(link.y + link.height <= card.y + card.height, 'Project CTA must be inside the visible card');
      const image = await page.locator(`#panels [data-stop="${from}"] img`).first().evaluate(img => {
        const rect = img.getBoundingClientRect(), style = getComputedStyle(img);
        return { ratio: rect.width / rect.height, nativeRatio: img.naturalWidth / img.naturalHeight, background: style.backgroundColor, width: rect.width, available: img.parentElement.clientWidth };
      });
      assert.ok(Math.abs(image.ratio - image.nativeRatio) < .01);
      assert.ok(Math.abs(image.width - image.available) < 1);
      assert.equal(image.background, 'rgba(0, 0, 0, 0)');
    }
    await go('terrace');
    assert.equal(await page.locator('.site-header .contact-link').isVisible(), true);
    for (const link of await page.locator('.site-header .social-link').all()) assert.equal(await link.isVisible(), true);
    await page.goto(`${base}?view=list`);
    for (const id of projects) {
      await page.locator(`#project-${id}`).scrollIntoViewIfNeeded();
      await page.waitForFunction(id => [...document.querySelectorAll(`#project-${id} img`)].every(img => img.complete && img.naturalWidth > 0), id);
    }
    assert.equal(await page.locator('#fallback details').count(), 0);
    assert.equal(await page.locator('.site-header .social-link').count(), 2);
    assert.equal(await page.evaluate(() => document.querySelector('#fallback').scrollWidth > innerWidth), false);
    await page.locator('#project-matter-engine').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${output}/${mobile ? 'mobile' : 'desktop'}-reading.png` });
    await page.close();
  }
  // Isolate navigation timing from SwiftShader's multi-second material compilation.
  // Full Matter assets and layouts are exercised above; this uses the same production
  // director, streaming, DOM and fade path with the built-in lightweight scene kit.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`${base}?capture=1&assets=greybox`);
  await page.waitForFunction(() => window.__villaReady !== undefined);
  const go = async stop => {
    await page.locator(`#route-map [data-stop="${stop}"]`).click();
    await page.waitForFunction(id => document.querySelector('#app').dataset.place === id && !document.querySelector('#app').hasAttribute('data-travelling'), stop);
  };
  for (const from of projects) {
      console.log('Checking animated shortcuts from', from);
      for (const to of projects.filter(id => id !== from)) {
        await go(from);
        await page.evaluate(() => {
          window.visited = [];
          window.motionFrames = [];
          window.monitorMotion = true;
          const sample = () => {
            if (!window.monitorMotion) return;
            const motion = window.__villaTravel();
            if (motion.quickVisiting) window.motionFrames.push({ time: performance.now(), u: motion.u, opacity: motion.transitionOpacity });
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
          window.routeObserver?.disconnect();
          window.routeObserver = new MutationObserver(entries => { for (const entry of entries) if (entry.attributeName === 'data-place') window.visited.push(entry.target.dataset.place); });
          window.routeObserver.observe(document.querySelector('#app'), { attributes: true });
        });
        const start = Date.now();
        await go(to);
        const { visited, frames } = await page.evaluate(() => { window.monitorMotion = false; return { visited: window.visited, frames: window.motionFrames }; });
        assert.deepEqual([...new Set(visited.filter(id => projects.includes(id) && id !== from))], [to]);
        const ms = Date.now() - start;
        report.shortcuts.push({ from, to, scene: 'greybox', ms, frames: frames.length, minOpacity: Math.min(...frames.map(f => f.opacity)) });
        assert.ok(ms >= 1400, 'Quick navigation must animate, not instantly jump');
        assert.ok(frames.length > 1 && new Set(frames.map(f => f.u)).size > 1, 'The camera must move during navigation');
        const adjacent = Math.abs(projects.indexOf(from) - projects.indexOf(to)) === 1;
        if (adjacent) assert.ok(frames.every(f => f.opacity === 1), 'Adjacent visits must remain visible');
        else assert.ok(frames.some(f => f.opacity < .15), 'Distant visits must fade around the cut');
      }
  }
  await page.close();
  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(base);
  await reduced.waitForFunction(() => window.__villaReady !== undefined, null, { timeout: 120000 });
  await reduced.waitForFunction(() => window.__villaAssets().loaded['gold-coin'] === 'matter', null, { timeout: 60000 });
  assert.equal(await reduced.evaluate(() => window.__villaTravel().autoResumeIn), null);
  report.backgroundLoading = true;
  await reduced.goto(`${base}?view=list`);
  assert.equal(await reduced.locator('.will-reveal').count(), 0);
  await reduced.close();
  const noJS = await browser.newPage({ javaScriptEnabled: false });
  await noJS.goto(base);
  assert.equal(await noJS.locator('#fallback').isVisible(), true);
  assert.equal(await noJS.locator('#fallback .panel').count(), 4);
  await noJS.close();
  assert.deepEqual(report.errors, []);
  report.completed = true;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await server?.close();
}
console.log(JSON.stringify(report, null, 2));
