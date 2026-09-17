/** Check visible ambient motion, reflection reuse and reduced-motion behavior. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { watch, problemCount } from '../console-probe.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const output = process.argv[3] ?? 'docs/design/garden-pass';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { backend: 'Chromium SwiftShader; viewport emulation, not physical device performance', cases: [] };
try {
  for (const mobile of [false, true]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, reducedMotion });
    const watcher = watch(page);
    // Explicit scene opt-in; reduced motion otherwise opens the reading page.
    await page.goto(`${base}/?view=scene&vp=3`);
    await page.waitForFunction(() => window.__villaReady === 3, null, { timeout: 120000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).visibility === 'hidden');
    await page.waitForTimeout(1200);
    const start = await page.evaluate(() => ({ render: window.__villaRenderStats(), travel: window.__villaTravel() }));
    const before = PNG.sync.read(await page.screenshot());
    await page.waitForTimeout(2000);
    const after = PNG.sync.read(await page.screenshot());
    const end = await page.evaluate(() => ({ render: window.__villaRenderStats(), travel: window.__villaTravel() }));
    const changedPixels = pixelmatch(before.data, after.data, null, before.width, before.height, { threshold: .012 });
    const result = { mobile, reducedMotion, changedPixels, start, end, problems: watcher.found };
    report.cases.push(result);
    if (start.travel.u !== end.travel.u) throw Error('Ambient motion moved the paused camera');
    if (start.render.reflectionPasses !== end.render.reflectionPasses) throw Error('Idle water needlessly recaptured the reflected scene');
    if (reducedMotion === 'reduce' ? changedPixels !== 0 : changedPixels < 5) throw Error(`Unexpected ambient motion: ${JSON.stringify(result)}`);
    await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 1120, height: 740 });
    await page.waitForFunction(passes => window.__villaRenderStats().reflectionPasses > passes, end.render.reflectionPasses, { timeout: 30000 });
    result.afterResize = await page.evaluate(() => window.__villaRenderStats());
    watcher.stop();
    if (problemCount(watcher.found) || watcher.found.warnings.length) throw Error('Ambient scene reported browser problems');
    console.log(mobile ? 'mobile' : 'desktop', reducedMotion, changedPixels, 'changed pixels; reflection reused');
    await page.close();
  }
} finally {
  await writeFile(`${output}/ambient-report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
