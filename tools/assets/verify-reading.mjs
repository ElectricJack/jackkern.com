/** Ensure the new ambient effects stop consuming GPU work in reading mode. */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { watch, problemCount } from '../console-probe.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:4321';
const output = process.argv[3] ?? 'docs/design/garden-pass';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const watcher = watch(page);
  await page.goto(`${base}/?view=scene`);
  await page.waitForFunction(() => window.__villaReady === 0, null, { timeout: 120000 });
  console.log('Scene ready; checking live graphics recovery and reading-mode draw calls');
  const state = await page.evaluate(async () => {
    const canvas = document.querySelector('#villa'), app = document.querySelector('#app');
    const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_lose_context');
    const event = type => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(`Timed out waiting for ${type}`)), 60000);
      canvas.addEventListener(type, () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    let pending = event('webglcontextlost'); ext.loseContext(); await pending;
    const during = app.dataset.mode;
    await new Promise(resolve => requestAnimationFrame(resolve));
    pending = event('webglcontextrestored'); ext.restoreContext(); await pending;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const restored = app.dataset.mode;
    let draws = 0;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = gl[name].bind(gl);
      gl[name] = (...args) => { draws++; return original(...args); };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const activeDraws = draws;
    document.querySelector('.skip-link').click(); draws = 0;
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { during, restored, activeDraws, readingDraws: draws, mode: app.dataset.mode, canvasHidden: canvas.hidden };
  });
  watcher.stop();
  watcher.found.warnings = watcher.found.warnings.filter(text => !text.startsWith('villa: WebGL context lost'));
  await writeFile(`${output}/reading-report.json`, JSON.stringify({ ...state, problems: watcher.found }, null, 2) + '\n');
  if (state.during !== 'static' || state.restored !== 'scene' || state.activeDraws === 0 || state.readingDraws !== 0 || state.mode !== 'static' || !state.canvasHidden) throw Error(JSON.stringify(state));
  if (problemCount(watcher.found) || watcher.found.warnings.length) throw Error('Reading-mode check reported browser problems');
  console.log(JSON.stringify(state));
} finally { await browser.close(); }
