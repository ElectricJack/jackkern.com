/**
 * Load the built site in headless Chromium and record everything the browser
 * complains about: console errors and warnings, uncaught page errors, failed
 * requests, every response >= 400, and images that did not decode.
 *
 *   node tools/console-probe.mjs [--url <base>] [--modes swiftshader,gl,no-gpu]
 *                                [--paths /,/?vp=5] [--headed] [--no-interact] [--strict]
 *
 * Without --url it serves dist/ with `vite preview` (run `npm run build` first).
 * Each path is loaded once per GL mode; the scene is entered with the launch
 * button, then driven with a wheel, ArrowDown and a hotspot click. Exits 1 on
 * any error, page error, failed request, >= 400 response or broken image;
 * --strict also fails on warnings.
 *
 * Headless Chromium has no GPU, so every mode renders through SwiftShader
 * there (`renderer:` in the report says which backend WebGL really got).
 * --headed opens real windows, which on a desktop, or WSLg, reaches the GPU.
 * Headless `gl` and `no-gpu` also composite in software and log Chromium's
 * own "GPU stall due to ReadPixels" warning for any WebGL canvas, this page's
 * or a blank one; that is the browser setup, not the site.
 *
 * `watch(page)` is exported so the static capture can hold itself to the same
 * standard.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Chromium flags per GL backend. `no-gpu` is what a machine without a usable GPU looks like. */
export const GL_MODES = {
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  gl: ['--use-gl=angle', '--use-angle=gl'],
  'no-gpu': ['--disable-gpu'],
};

/**
 * Attach listeners that collect every problem the page reports. `stop()`
 * detaches them, so closing the page afterwards does not count the requests
 * the close itself aborts.
 */
export function watch(page) {
  const found = { errors: [], warnings: [], pageErrors: [], failedRequests: [], badResponses: [] };
  const onConsole = (message) => {
    const where = message.location()?.url ? ` (${message.location().url})` : '';
    if (message.type() === 'error') found.errors.push(message.text() + where);
    else if (message.type() === 'warning') found.warnings.push(message.text() + where);
  };
  const onPageError = (error) => found.pageErrors.push(error.stack || String(error));
  const onRequestFailed = (request) =>
    found.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`);
  const onResponse = (response) => {
    if (response.status() >= 400) found.badResponses.push(`${response.status()} ${response.url()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  return {
    found,
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    },
  };
}

/** Problems that fail a run. Warnings are reported separately. */
export function problemCount(found) {
  return found.errors.length + found.pageErrors.length + found.failedRequests.length +
    found.badResponses.length + (found.brokenImages?.length ?? 0);
}

/**
 * Every <img> on the page, lazy ones included, must be served as an image.
 * Fetching them checks the ones the browser has not requested yet, and the
 * content type catches a server answering a missing file with index.html.
 */
async function brokenImages(page) {
  return page.evaluate(async () => {
    const sources = [...new Set([...document.images].map((img) => img.currentSrc || img.src).filter(Boolean))];
    const broken = [];
    for (const src of sources) {
      try {
        const response = await fetch(src, { cache: 'no-store' });
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('image/')) broken.push(`${src} — ${response.status} ${type}`);
      } catch (error) {
        broken.push(`${src} — ${error}`);
      }
    }
    for (const img of document.images) {
      if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) broken.push(`${img.src} — did not decode`);
    }
    return [...new Set(broken)];
  });
}

async function glRenderer(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'no WebGL';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(name);
  });
}

/** Enter the scene and drive it the way a visitor would. Returns what happened, for the report. */
async function interact(page, found) {
  const steps = [];
  const launch = page.locator('#enter-villa');
  if (!(await launch.isVisible())) {
    steps.push(`static mode (${await page.evaluate(() => document.getElementById('app')?.dataset.mode)}), no launch button`);
    return steps;
  }
  await launch.click();
  await page.waitForFunction(
    () => window.__villaReady !== undefined || document.getElementById('app')?.dataset.mode === 'static',
    null,
    { timeout: 60_000 },
  );
  const mode = await page.evaluate(() => document.getElementById('app')?.dataset.mode);
  if (mode !== 'scene') {
    steps.push('launch fell back to static');
    return steps;
  }
  steps.push('scene');

  const box = await page.locator('#villa').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1_000);
  steps.push('wheel');

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1_500);
  steps.push('ArrowDown');

  // A GPU reset: the page should drop to the static view while the context is
  // lost and return to the scene once the browser restores it.
  const warningsBefore = found.warnings.length;
  const loss = await page.evaluate(async () => {
    const canvas = document.getElementById('villa');
    const app = document.getElementById('app');
    const ext = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!ext) return 'no WEBGL_lose_context';
    const next = (type) => new Promise((done) => canvas.addEventListener(type, done, { once: true }));
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const lost = next('webglcontextlost');
    ext.loseContext();
    await lost;
    await frame();
    const during = app.dataset.mode;
    const restored = next('webglcontextrestored');
    ext.restoreContext();
    await restored;
    await frame();
    return `${during} -> ${app.dataset.mode}`;
  });
  // The page announces the loss with one expected warning; anything else stays counted.
  const expected = found.warnings.findIndex((text, i) => i >= warningsBefore && text.startsWith('villa: WebGL context lost'));
  if (expected !== -1) found.warnings.splice(expected, 1);
  steps.push(`context loss ${loss}`);
  await page.waitForTimeout(500);

  const hotspots = await page.evaluate(() => window.__villaHotspots?.() ?? []);
  const target = hotspots.find((h) => h.onScreen);
  if (target) {
    const before = await page.evaluate(() => window.__villaViewpoint);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(2_000);
    const after = await page.evaluate(() => window.__villaViewpoint);
    steps.push(`hotspot ${before}->${after} (aimed at ${target.to})`);
  } else {
    steps.push(`no hotspot on screen (${hotspots.length} active)`);
  }
  return steps;
}

export async function probe({ base, modes, paths, interactive = true, launchOptions = {} }) {
  const { chromium } = await import('playwright');
  const runs = [];
  for (const mode of modes) {
    const browser = await chromium.launch({ ...launchOptions, args: [...(launchOptions.args ?? []), ...GL_MODES[mode]] });
    try {
      for (const path of paths) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const watcher = watch(page);
        const run = { mode, path, renderer: '', steps: [], found: watcher.found };
        try {
          await page.goto(new URL(path, base).href, { waitUntil: 'load' });
          run.renderer = await glRenderer(page);
          watcher.found.brokenImages = await brokenImages(page);
          if (interactive) run.steps = await interact(page, watcher.found);
          await page.waitForTimeout(500);
        } catch (error) {
          watcher.found.pageErrors.push(`probe: ${error.message}`);
        } finally {
          watcher.stop();
          await page.close();
        }
        runs.push(run);
      }
    } finally {
      await browser.close();
    }
  }
  return runs;
}

export function report(runs, { strict = false } = {}) {
  let failures = 0;
  for (const run of runs) {
    const { found } = run;
    const bad = problemCount(found) + (strict ? found.warnings.length : 0);
    failures += bad;
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${run.mode.padEnd(11)} ${run.path.padEnd(8)} ` +
      `errors ${found.errors.length}, page errors ${found.pageErrors.length}, ` +
      `failed requests ${found.failedRequests.length}, >=400 ${found.badResponses.length}, ` +
      `broken images ${found.brokenImages?.length ?? 0}, warnings ${found.warnings.length}`,
    );
    if (run.renderer) console.log(`     renderer: ${run.renderer}`);
    if (run.steps.length) console.log(`     steps: ${run.steps.join(' → ')}`);
    const list = (label, items) => { for (const item of items) console.log(`     ${label}: ${item}`); };
    list('error', found.errors);
    list('page error', found.pageErrors);
    list('failed request', found.failedRequests);
    list('response', found.badResponses);
    list('broken image', found.brokenImages ?? []);
    list('warning', found.warnings);
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1];
  };
  const modes = option('--modes', Object.keys(GL_MODES).join(',')).split(',');
  for (const mode of modes) {
    if (!GL_MODES[mode]) {
      console.error(`console-probe: unknown mode ${mode}; use ${Object.keys(GL_MODES).join(', ')}`);
      process.exit(2);
    }
  }
  const paths = option('--paths', '/,/?vp=5').split(',');

  let base = option('--url', null);
  let server = null;
  if (!base) {
    const { preview } = await import('vite');
    server = await preview({ root: process.cwd(), preview: { port: 4174 }, logLevel: 'error' });
    base = server.resolvedUrls.local[0];
  }

  try {
    const runs = await probe({
      base,
      modes,
      paths,
      interactive: !args.includes('--no-interact'),
      launchOptions: { headless: !args.includes('--headed') },
    });
    const failures = report(runs, { strict: args.includes('--strict') });
    console.log(failures ? `console-probe: ${failures} problem(s)` : 'console-probe: clean');
    process.exitCode = failures ? 1 : 0;
  } finally {
    await server?.close();
  }
}
