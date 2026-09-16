/**
 * Browser checks for landing straight in the villa and for wheel travel (clear-stone.2).
 *
 *   npm run dev -- --port 5177 --strictPort                 # or npm run preview
 *   VILLA_URL=http://localhost:5177 node docs/verification/villa-travel/travel.mjs
 *
 * Every screenshot is the composited frame Chromium puts on screen, not a canvas readback
 * (three.js leaves preserveDrawingBuffer off, so a readback comes back blank). Motion is read
 * per animation frame from window.__villaTravel, which src/main.ts exposes for this.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { layout } from '../../../layout/layout.js';

const BASE = process.env.VILLA_URL ?? 'http://localhost:5177';
const W = 1280, H = 720;
const SHOTS = 'tmp/verify/travel';
// Mirrors TRAVEL in src/camera/travel.ts.
const TRAVEL = { metresPerPixel: 0.005, maxSpeed: 4 };
mkdirSync(SHOTS, { recursive: true });

const plan = layout(
  JSON.parse(readFileSync('content/manifest.json', 'utf8')),
  JSON.parse(readFileSync('kit/contract.json', 'utf8')),
);

const results = [];
const record = (title, pass, detail) => {
  results.push({ title, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${title}\n      ${detail}\n`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(path, { holdMain = 0, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (holdMain) {
    // Hold back the scene's chunk (src/main.ts under vite dev, bundle/main-*.js when built) so the
    // loading state stays up long enough to photograph.
    await page.route((url) => /\/(src\/main\.ts|bundle\/main-[^/]+\.js)$/.test(url.pathname), async (route) => {
      await new Promise((done) => setTimeout(done, holdMain));
      await route.continue();
    });
  }
  await page.goto(BASE + path, { waitUntil: 'commit' });
  return { context, page, errors };
}

const ready = (page) => page.waitForFunction(
  () => window.__villaReady !== undefined && document.getElementById('app')?.dataset.mode === 'scene',
  null, { timeout: 60000 },
);

const dom = (page) => page.evaluate(() => {
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0;
  return {
    mode: document.getElementById('app')?.dataset.mode,
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()),
    loading: shown(document.getElementById('loading')),
    progress: document.getElementById('loading')?.getAttribute('aria-valuenow'),
    fallback: shown(document.getElementById('fallback')),
    canvas: shown(document.getElementById('villa')),
    panels: [...document.querySelectorAll('#panels section.panel')].filter((s) => !s.hidden).map((s) => s.dataset.stop),
  };
});

/** Records metres, speed and viewpoint on every animation frame until stopped. */
const startSampler = (page) => page.evaluate(() => {
  window.__samples = [];
  window.__sampling = true;
  const tick = (t) => {
    const s = window.__villaTravel?.();
    if (s) window.__samples.push({ t, metres: s.metres, speed: s.speed, viewpoint: s.viewpoint, position: s.position });
    if (window.__sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const stopSampler = (page) => page.evaluate(() => { window.__sampling = false; return window.__samples; });

/** Share of the frame within 8 of the loading colour #e8e4dc, and whether a dark line crosses the middle row. */
function loadingLook(buffer) {
  const png = PNG.sync.read(buffer);
  let sky = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (Math.abs(png.data[i] - 0xe8) < 8 && Math.abs(png.data[i + 1] - 0xe4) < 8 && Math.abs(png.data[i + 2] - 0xdc) < 8) sky++;
  }
  let line = 0;
  for (let y = H / 2 - 2; y <= H / 2 + 2; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (png.data[i] < 0xd8) line++;
    }
  }
  return { sky: sky / (png.width * png.height), line };
}

/** A strip of thumbnails, for the README. */
function contactSheet(buffers, columns = 4, scale = 4) {
  const tw = W / scale, th = H / scale;
  const rows = Math.ceil(buffers.length / columns);
  const sheet = new PNG({ width: tw * columns, height: th * rows });
  sheet.data.fill(255);
  buffers.forEach((buffer, n) => {
    const png = PNG.sync.read(buffer);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const from = (y * scale * png.width + x * scale) * 4;
      const to = ((Math.floor(n / columns) * th + y) * sheet.width + (n % columns) * tw + x) * 4;
      png.data.copy(sheet.data, to, from, from + 4);
    }
  });
  return PNG.sync.write(sheet);
}

// ── Landing: the entry court on load, with no gate ────────────────────────────
{
  const { context, page, errors } = await open('/', { holdMain: 2500 });
  await page.waitForFunction(() => document.getElementById('app')?.dataset.mode === 'loading', null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const during = await dom(page);
  const loadingShot = await page.screenshot({ path: `${SHOTS}/1-loading.png` });
  const look = loadingLook(loadingShot);
  await ready(page);
  await page.waitForTimeout(1500);
  const after = await dom(page);
  await page.screenshot({ path: `${SHOTS}/2-entry-court-on-load.png` });
  const ok = during.loading && !during.fallback && look.sky > 0.97 && look.line > 0 &&
    after.mode === 'scene' && !after.loading && !after.fallback && after.canvas && after.buttons.length === 0 &&
    after.panels.length === 0 && errors.length === 0;
  record('/ opens straight into the entry court: a loading state, then the scene, with nothing to click', ok,
    `While the three.js chunk was held back: #app[data-mode]=${during.mode}, loading overlay shown=${during.loading} at ${during.progress}%, static list shown=${during.fallback}; ` +
    `${(look.sky * 100).toFixed(1)}% of the frame is the sky colour #e8e4dc and ${look.line} darker pixels form the progress line. ` +
    `Once ready, with no input: mode=${after.mode}, overlay shown=${after.loading}, static list shown=${after.fallback}, canvas shown=${after.canvas}, ` +
    `buttons on the page=[${after.buttons}], panel=[${after.panels}]. Console errors=${errors.length}. ` +
    `Screenshots ${SHOTS}/1-loading.png, ${SHOTS}/2-entry-court-on-load.png`);
  await context.close();
}

// ── One notch, and a flick ────────────────────────────────────────────────────
{
  const { context, page, errors } = await open('/');
  await ready(page);
  await page.mouse.move(400, 360);
  await page.waitForTimeout(500);
  const rest = await page.evaluate(() => window.__villaTravel());
  await page.mouse.wheel(0, 100);
  await page.waitForFunction((m) => window.__villaTravel().metres > m, rest.metres);
  await page.waitForFunction(() => window.__villaTravel().speed === 0, null, { timeout: 5000 });
  const notch = (await page.evaluate(() => window.__villaTravel())).metres - rest.metres;

  // A trackpad flick: a burst of pixel deltas, then nothing.
  await startSampler(page);
  for (const px of [6, 18, 40, 70, 90, 90, 70, 45, 25, 10]) await page.mouse.wheel(0, px);
  const lastEvent = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.__villaTravel().speed === 0, null, { timeout: 5000 });
  const samples = await stopSampler(page);
  const stoppedAt = samples.find((s) => s.t > lastEvent && s.speed === 0)?.t ?? Infinity;
  const coast = (stoppedAt - lastEvent) / 1000;
  const peak = Math.max(...samples.map((s) => s.speed));
  const flick = samples.at(-1).metres - samples[0].metres;
  const ok = notch > 0.45 && notch < 0.55 && coast <= 1.05 && peak <= TRAVEL.maxSpeed && errors.length === 0;
  record('a wheel notch walks about half a metre; a trackpad flick coasts to rest within about a second', ok,
    `One 100 px notch from rest moved the camera ${notch.toFixed(3)} m along the rail and came to rest. ` +
    `A flick of 10 wheel events (464 px) peaked at ${peak.toFixed(2)} m/s (cap ${TRAVEL.maxSpeed}), covered ${flick.toFixed(2)} m, ` +
    `and was at rest ${coast.toFixed(2)} s after its last event. Console errors=${errors.length}.`);
  await context.close();
}

// ── Touch uses the same model ─────────────────────────────────────────────────
{
  const { context, page, errors } = await open('/', { hasTouch: true });
  await ready(page);
  await page.waitForTimeout(500);
  const cdp = await context.newCDPSession(page);
  const rest = await page.evaluate(() => window.__villaTravel());
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 400, y }] });
  await touch('touchStart', 500);
  let peak = 0;
  for (let y = 480; y >= 300; y -= 20) {
    await touch('touchMove', y);
    peak = Math.max(peak, (await page.evaluate(() => window.__villaTravel())).speed);
  }
  await touch('touchEnd');
  const coasting = (await page.evaluate(() => window.__villaTravel())).speed;
  await page.waitForFunction(() => window.__villaTravel().speed === 0, null, { timeout: 5000 });
  const moved = (await page.evaluate(() => window.__villaTravel())).metres - rest.metres;
  const ok = moved > 0 && moved <= 200 * TRAVEL.metresPerPixel + 1e-6 && peak <= TRAVEL.maxSpeed && errors.length === 0;
  record('a swipe up the screen walks onward through the same velocity model', ok,
    `A 200 px swipe up in 10 moves pushed the camera to ${peak.toFixed(2)} m/s, it was still moving at ${coasting.toFixed(2)} m/s when the finger lifted, ` +
    `and it came to rest ${moved.toFixed(3)} m on (at most ${(200 * TRAVEL.metresPerPixel).toFixed(2)} m for 200 px). Console errors=${errors.length}.`);
  await context.close();
}

// ── The wheel from the entry court to the terrace ─────────────────────────────
{
  const { context, page, errors } = await open('/');
  await ready(page);
  await page.mouse.move(400, 360);
  await page.waitForTimeout(500);
  await startSampler(page);
  const shots = [await page.screenshot({ path: `${SHOTS}/walk-00-${plan.rail[0].id}.png` })];
  let shotOf = 0;
  const started = Date.now();
  let now = await page.evaluate(() => window.__villaTravel());
  // A steady spin: a 100 px notch every 100 ms, faster than the camera may go.
  while (now.u < 1 && Date.now() - started < 180000) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    now = await page.evaluate(() => window.__villaTravel());
    if (now.viewpoint > shotOf) {
      shotOf = now.viewpoint;
      shots.push(await page.screenshot({ path: `${SHOTS}/walk-${String(shotOf).padStart(2, '0')}-${plan.rail[shotOf].id}.png` }));
    }
  }
  await page.waitForFunction(() => window.__villaTravel().speed === 0, null, { timeout: 5000 });
  const samples = await stopSampler(page);
  const end = await dom(page);
  await page.screenshot({ path: `${SHOTS}/walk-terrace-at-rest.png` });
  writeFileSync(`${SHOTS}/walk-contact-sheet.png`, contactSheet(shots));

  const order = [];
  let worst = -Infinity;
  let largest = { step: 0, dt: 0, at: 0 };
  let world = 0, backwards = 0, fastest = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (order.at(-1) !== s.viewpoint) order.push(s.viewpoint);
    fastest = Math.max(fastest, s.speed);
    if (i === 0) continue;
    const p = samples[i - 1];
    const step = s.metres - p.metres;
    const dt = (s.t - p.t) / 1000;
    if (step < -1e-9) backwards++;
    // main.ts clamps a frame's dt to 0.1 s, which can only shorten a step, so top speed × elapsed bounds it.
    const allowed = TRAVEL.maxSpeed * dt;
    worst = Math.max(worst, step - allowed);
    if (step > largest.step) largest = { step, dt, at: s.metres };
    world = Math.max(world, Math.hypot(...s.position.map((v, k) => v - p.position[k])));
  }
  const expected = plan.rail.map((_, i) => i);
  const seconds = (samples.at(-1).t - samples[0].t) / 1000;
  const ok = JSON.stringify(order) === JSON.stringify(expected) && worst <= 1e-6 && backwards === 0 &&
    fastest <= TRAVEL.maxSpeed && now.u === 1 && end.panels.length === 0 && errors.length === 0;
  record('a steady wheel carries the camera from the entry court to the terrace, smoothly and under the speed cap', ok,
    `${samples.length} animation frames over ${seconds.toFixed(1)} s. Viewpoints passed in order [${order}] (expected every one of 0..${plan.rail.length - 1}, none skipped); ` +
    `frames moving backwards=${backwards}; top speed ${fastest.toFixed(2)} m/s (cap ${TRAVEL.maxSpeed}); ` +
    `every frame's step along the rail ${worst <= 1e-6 ? 'within' : 'OVER'} top speed × its frame time (the closest came ${(-worst * 1000).toFixed(1)} mm under it); ` +
    `largest step ${largest.step.toFixed(3)} m, in a ${(largest.dt * 1000).toFixed(0)} ms frame at ${largest.at.toFixed(1)} m; largest straight-line camera move in one frame ${world.toFixed(3)} m. ` +
    `Ended at u=${now.u} (${plan.rail.at(-1).id}) with no panel (shown=[${end.panels}]). Console errors=${errors.length}. ` +
    `Screenshots ${SHOTS}/walk-*.png, contact sheet ${SHOTS}/walk-contact-sheet.png`);
  await context.close();
}

await browser.close();
console.log('-'.repeat(72));
console.log(`${results.filter((r) => r.pass).length}/${results.length} checks PASS`);
for (const r of results) if (!r.pass) console.log(`  FAILED: ${r.title}`);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
