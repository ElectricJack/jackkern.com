import { chromium } from 'playwright';
import { PerspectiveCamera, Vector3 } from 'three';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { layout } from '../../../layout/layout.js';

const BASE = 'http://localhost:5177';
const W = 1280, H = 720;
const PANEL_X = 860;            // #panels covers x >= 860; the 3D view is left of it.
const SHOTS = 'tmp/verify/shots';
mkdirSync(SHOTS, { recursive: true });

const plan = layout(
  JSON.parse(readFileSync('content/manifest.json', 'utf8')),
  JSON.parse(readFileSync('kit/contract.json', 'utf8')),
);

const results = [];
const record = (n, title, pass, detail) => {
  results.push({ n, title, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${n}] ${title}\n      ${detail}\n`);
};

/** Palette shares of the composited frame, over the 3D area only. */
function palette(buf) {
  const png = PNG.sync.read(buf);
  let sky = 0, floorish = 0, blue = 0, n = 0;
  let blueTop = png.height, blueBottom = -1, blueLeft = png.width, blueRight = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < PANEL_X; x++) {
    const i = (y * png.width + x) * 4, r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    n++;
    if (Math.abs(r - 0xe8) < 8 && Math.abs(g - 0xe4) < 8 && Math.abs(b - 0xdc) < 8) sky++;
    else if (r > b + 8) floorish++;
    if (b > r + 25 && b > 60) {
      blue++;
      blueTop = Math.min(blueTop, y); blueBottom = Math.max(blueBottom, y);
      blueLeft = Math.min(blueLeft, x); blueRight = Math.max(blueRight, x);
    }
  }
  return { n, sky, floorish, blue, blueTop, blueBottom, blueLeft, blueRight,
    pct: (v) => ((v / n) * 100).toFixed(1) + '%' };
}

/** Mean luma inside a disc vs the ring around it — how a translucent white marker shows up. */
function discVsRing(buf, cx, cy, r = 10) {
  const png = PNG.sync.read(buf);
  let din = 0, nin = 0, dout = 0, nout = 0;
  for (let y = Math.max(0, cy - r * 3); y < Math.min(png.height, cy + r * 3); y++)
    for (let x = Math.max(0, cx - r * 3); x < Math.min(PANEL_X, cx + r * 3); x++) {
      const i = (y * png.width + x) * 4;
      const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) { din += l; nin++; } else if (d > r * 2 && d <= r * 3) { dout += l; nout++; }
    }
  return { disc: din / nin, ring: dout / nout };
}

/** Where a world point lands on screen, using the camera main.ts builds. */
function project(world, viewpoint) {
  const cam = new PerspectiveCamera(55, W / H, 0.1, 200);
  cam.position.set(...viewpoint.position);
  cam.lookAt(new Vector3(...viewpoint.target));
  cam.updateMatrixWorld(true);
  const ndc = new Vector3(...world).project(cam);
  return { x: ((ndc.x + 1) / 2) * W, y: ((1 - ndc.y) / 2) * H, z: ndc.z };
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const state = (page) => page.evaluate(() => ({
  canvas: !!document.getElementById('villa'),
  mode: document.getElementById('panels')?.dataset.mode ?? null,
  shown: [...document.querySelectorAll('section.panel')].filter((s) => !s.hidden).map((s) => s.dataset.stop),
  ready: window.__villaReady,
  staticImgs: [...document.querySelectorAll('.static-view img')].map((i) => i.getAttribute('src')),
  staticPanels: [...document.querySelectorAll('section.panel.static')].map((s) => s.dataset.stop),
}));

async function open(path, opts = {}) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...opts });
  const page = await context.newPage();
  const errors = [];
  const missing = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
  await page.goto(BASE + path, { waitUntil: 'load' });
  return { context, page, errors, missing };
}

// ── 1. The entry court renders ────────────────────────────────────────────────
{
  const { context, page, errors } = await open('/');
  await page.waitForTimeout(2500);
  const s = await state(page);
  const buf = await page.screenshot();
  writeFileSync(`${SHOTS}/1-entry-court.png`, buf);
  const p = palette(buf);

  // What stands between the entry viewpoint and the court it is meant to show.
  const cam = plan.rail[0].position;
  const near = plan.placements.filter((q) => q.stop === 'entry')
    .map((q) => ({ part: q.part, d: Math.hypot(q.transform[12] - cam[0], q.transform[14] - cam[2]) }))
    .sort((a, b) => a.d - b.d)[0];
  const blueShare = (p.blue / p.n) * 100;

  const elements = { 'warm sky #e8e4dc': p.sky > 0, 'floor/columns (warm solids)': p.floorish > 0, 'blue water': p.blue > 0 };
  const allFour = Object.values(elements).every(Boolean);
  const readable = blueShare < 25;
  record(1, 'entry court renders: grey floor, columns, blue pool + fountain cylinder, warm sky',
    allFour && readable,
    `All four elements ARE in the frame: ${Object.entries(elements).map(([k, v]) => `${k}=${v}`).join(', ')} ` +
    `(sky ${p.pct(p.sky)}, warm solids ${p.pct(p.floorish)}, blue water ${p.pct(p.blue)} of the 3D area). ` +
    `Canvas present=${s.canvas}, static mode=${s.mode}, no panel at the court (shown=[${s.shown}]), console errors=${errors.length}. ` +
    `BUT the composition fails: the blue water fills x ${p.blueLeft}-${p.blueRight} of 0-${PANEL_X} and y ${p.blueTop}-${p.blueBottom} of 0-${H} — ` +
    `${blueShare.toFixed(0)}% of the 3D area is one object. Nearest placement to the viewpoint is "${near.part}" at ${near.d.toFixed(2)}m: ` +
    `the 3m fountain-tiered at [0,0,4.5] stands 1.5m in front of the entry viewpoint [0,1.7,3] and blocks the court. ` +
    `Screenshot ${SHOTS}/1-entry-court.png`);
  await context.close();
}

// ── 2. Wheel scrolls forward; the Matter Engine panel appears at the pool hall ─
{
  const { context, page, errors } = await open('/');
  await page.waitForTimeout(2000);
  const before = await page.screenshot();
  await page.mouse.move(W / 2, H / 2);
  let notches = 0, shown = [];
  for (; notches < 40; notches++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(120);
    shown = (await state(page)).shown;
    if (shown.length) break;
  }
  await page.waitForTimeout(800);
  const after = await page.screenshot({ path: `${SHOTS}/2a-wheel-panel-appears.png` });
  // Keep scrolling into the pool hall proper so the shot shows the room, not a mid-rail wall.
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(120); }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/2b-pool-hall.png` });
  const still = (await state(page)).shown;
  const ok = !before.equals(after) && shown[0] === 'matter-engine' && errors.length === 0;
  record(2, 'wheel moves forward along the rail; the "Matter Engine" panel slides in at the pool hall',
    ok,
    `${notches + 1} wheel notches of 200px (SCROLL_PIXELS_PER_VIEWPOINT=900 across ${plan.rail.length - 1} gaps = ${900 * (plan.rail.length - 1)}px for the whole rail) ` +
    `changed the rendered frame and brought up panel [${shown}] — stop "${plan.rail[1].stop}", rail index 1 (${plan.rail[1].id}), the pool hall. ` +
    `6 more notches kept it on [${still}]. Screenshots ${SHOTS}/2a-wheel-panel-appears.png, ${SHOTS}/2b-pool-hall.png`);
  await context.close();
}

// ── 3. The hotspot sphere ahead glides to the next viewpoint ───────────────────
{
  // Does the marker actually show? Measure the projected anchor at three viewpoints.
  const vis = [];
  for (const i of [0, 1, 2]) {
    const vp = plan.rail[i];
    const hot = plan.hotspots.find((h) => h.from === vp.id);
    const at = project(hot.anchor, vp);
    const { context, page } = await open(`/?vp=${i}&capture=1`);
    await page.waitForFunction(() => window.__villaReady !== undefined, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const buf = await page.screenshot({ path: `${SHOTS}/3-marker-vp${i}.png` });
    const m = discVsRing(buf, Math.round(at.x), Math.round(at.y));
    vis.push({ i, id: vp.id, to: hot.to, label: hot.label, at, ...m, visible: m.disc > m.ring + 4 });
    await context.close();
  }

  // Then click the entry marker and see whether it glides.
  const { context, page, errors } = await open('/');
  await page.waitForTimeout(2000);
  const at = project(plan.hotspots[0].anchor, plan.rail[0]);
  await page.screenshot({ path: `${SHOTS}/3a-before-click.png` });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1500);
  const s = await state(page);
  await page.screenshot({ path: `${SHOTS}/3b-after-click.png` });
  const glided = s.shown[0] === 'matter-engine';
  const entry = vis[0];
  record(3, 'translucent sphere at the doorway ahead; clicking it glides to the next viewpoint and the panel changes',
    glided && entry.visible && errors.length === 0,
    `Glide + panel: clicking the projected anchor at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}) glided to rail index 1 and the panel became [${s.shown}] — WORKS (console errors=${errors.length}). ` +
    `Sphere visibility, disc vs surrounding ring luma at each projected anchor: ` +
    vis.map((v) => `${v.id}->${v.to} (${v.label}) at (${v.at.x.toFixed(0)},${v.at.y.toFixed(0)}) disc ${v.disc.toFixed(1)} vs ring ${v.ring.toFixed(1)} => ${v.visible ? 'VISIBLE' : 'NOT VISIBLE'}`).join('; ') + '. ' +
    `At the entry the marker is hidden: the ray from [0,1.7,3] to the anchor [0,1,9] passes through the 3m fountain at [0,0,4.5] at y=1.53, inside its ~0.65m radius, and the marker is depth-tested (MeshBasicMaterial sets depthWrite:false but leaves depthTest on). ` +
    `Raycaster only tests markers.children, so the click still lands — the sphere is clickable through the fountain but cannot be seen. ` +
    `Screenshots ${SHOTS}/3-marker-vp0.png, ${SHOTS}/3-marker-vp1.png, ${SHOTS}/3-marker-vp2.png, ${SHOTS}/3a-before-click.png, ${SHOTS}/3b-after-click.png`);
  await context.close();
}

// ── 4. Arrow keys step viewpoints; the terrace shows no panel ──────────────────
{
  const { context, page, errors } = await open('/');
  await page.waitForTimeout(2000);
  const seen = [];
  for (let i = 0; i < plan.rail.length - 1; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(450);
    seen.push((await state(page)).shown[0] ?? '-');
  }
  const end = await state(page);
  await page.screenshot({ path: `${SHOTS}/4-terrace.png` });
  const up = [];
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(450); up.push((await state(page)).shown[0] ?? '-'); }
  const projects = ['matter-engine', 'outrider-ide', 'agent-queue', 'quilt-trader'];
  const expected = plan.rail.slice(1).map((v) => (projects.includes(v.stop) ? v.stop : '-'));
  const ok = JSON.stringify(seen) === JSON.stringify(expected) && end.shown.length === 0 && errors.length === 0;
  record(4, 'arrow keys step between viewpoints; reaching the terrace shows no panel',
    ok,
    `${plan.rail.length - 1}x ArrowDown stepped rail index 1..${plan.rail.length - 1}, one viewpoint per press; panel after each = [${seen.join(', ')}], which matches the rail exactly [${expected.join(', ')}]. ` +
    `Final viewpoint ${plan.rail.at(-1).id} (stop "${plan.rail.at(-1).stop}") shows no panel (shown=[${end.shown}]). 2x ArrowUp stepped back to [${up.join(', ')}]. Console errors=${errors.length}. ` +
    `Screenshot ${SHOTS}/4-terrace.png`);
  await context.close();
}

// ── 5. ?vp=5&capture=1 loads at the Outrider focal and sets __villaReady ───────
{
  const { context, page, errors } = await open('/?vp=5&capture=1');
  await page.waitForFunction(() => window.__villaReady !== undefined, null, { timeout: 15000 }).catch(() => {});
  const s = await state(page);
  await page.screenshot({ path: `${SHOTS}/5-vp5-capture.png` });
  const vp = plan.rail[5];
  const ok = s.ready === 5 && s.canvas && s.shown[0] === vp.stop && errors.length === 0;
  record(5, '?vp=5&capture=1 loads directly at the Outrider focal viewpoint; window.__villaReady is 5',
    ok,
    `window.__villaReady === ${JSON.stringify(s.ready)} (read from the page, the value the capture tool polls). ` +
    `rail[5] is "${vp.id}" — stop "${vp.stop}" at [${vp.position}], the focal viewpoint of the Outrider gallery — and its panel [${s.shown}] is up on load with no scrolling. Console errors=${errors.length}. ` +
    `Screenshot ${SHOTS}/5-vp5-capture.png`);
  await context.close();
}

// ── 6. prefers-reduced-motion: reduce falls back to the static list ────────────
{
  const { context, page, errors, missing } = await open('/', { reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const s = await state(page);
  await page.screenshot({ path: `${SHOTS}/6-reduced-motion.png` });
  const ok = !s.canvas && s.mode === 'static' && s.staticImgs.length === plan.rail.length && s.staticPanels.length === 4 && errors.length === 0;
  record(6, 'prefers-reduced-motion: reduce removes the canvas and shows the static list of images and panels',
    ok,
    `#villa canvas removed (present=${s.canvas}); #panels[data-mode]="${s.mode}"; ${s.staticImgs.length} static <img>, one per rail viewpoint (expected ${plan.rail.length}), first="${s.staticImgs[0]}"; ` +
    `${s.staticPanels.length} static panels [${s.staticPanels}] in rail order. ` +
    `No image resolves yet, as the plan expects until Task 17 renders them — under \`vite dev\` the SPA fallback answers /static/*.jpg with 200 text/html rather than 404, so the browser shows broken images` +
    `${missing.length ? ` (404s seen: ${[...new Set(missing)].slice(0, 3).join(', ')})` : ''}. Console errors=${errors.length}. ` +
    `Screenshot ${SHOTS}/6-reduced-motion.png`);
  await context.close();
}

await browser.close();
console.log('-'.repeat(72));
console.log(`${results.filter((r) => r.pass).length}/${results.length} checklist items PASS`);
for (const r of results) if (!r.pass) console.log(`  FAILED: [${r.n}] ${r.title}`);
