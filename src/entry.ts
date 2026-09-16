import { chooseMode } from './boot';
import { debugRequested, installCollector } from './debug/collect';
import { prefersReducedMotion, supportsWebGL } from './fallback/static';

// First, so ?debug=1 also sees what goes wrong while the page starts. The
// overlay that shows it is a separate chunk only debug visits download.
const debugLog = debugRequested(location.search) ? installCollector(window) : null;
if (debugLog) {
  import('./debug/overlay')
    .then(({ mountOverlay }) => mountOverlay(debugLog))
    .catch((error) => console.error('debug: the overlay failed to load', error));
}

const app = document.getElementById('app') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;
const fallback = document.getElementById('fallback') as HTMLElement;
const canvas = document.getElementById('villa') as HTMLCanvasElement;
const panels = document.getElementById('panels') as HTMLElement;
const capture = new URLSearchParams(location.search).has('capture');

const mode = chooseMode({
  webgl: supportsWebGL(),
  reducedMotion: prefersReducedMotion(),
  capture,
});

/** The scene has drawn a frame, so the context coming back should show it again. */
let running = false;
let lost = false;

/**
 * `loading` and `scene` differ only in the loading overlay: it covers the canvas until the
 * first frame is drawn, then fades (styles.css).
 */
function show(next: 'loading' | 'scene' | 'static'): void {
  app.dataset.mode = next;
  fallback.hidden = next !== 'static';
  canvas.hidden = next === 'static';
  panels.hidden = next === 'static';
}

/** Moves the progress line to `fraction`, taking `seconds` to get there. */
function progress(fraction: number, seconds = 0.3): void {
  const line = loading.firstElementChild as HTMLElement;
  line.style.setProperty('--progress-seconds', `${seconds}s`);
  line.style.setProperty('--progress', String(fraction));
  loading.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
}

async function startScene(): Promise<void> {
  show('loading');
  // Most of the wait is the three.js chunk, which reports no progress of its own, so the line
  // creeps most of the way over what a slow connection takes and then catches up.
  progress(0.7, 8);

  try {
    const { boot } = await import('./main');
    progress(0.8);
    await boot((fraction) => {
      progress(0.8 + 0.2 * fraction);
      if (fraction < 1) return;
      running = true;
      if (!lost) show('scene');
    });
  } catch (error) {
    console.error('villa: falling back to static', error);
    show('static');
  }
}

// A GPU reset, a driver update or too many contexts on the page loses the
// context and leaves the canvas frozen. three.js keeps the context restorable,
// so show the static page meanwhile and come back when the browser restores it.
canvas.addEventListener('webglcontextlost', () => {
  console.warn('villa: WebGL context lost; showing the static page until it is restored');
  lost = true;
  show('static');
});
canvas.addEventListener('webglcontextrestored', () => {
  lost = false;
  if (running) show('scene');
});

// The capture tool screenshots the first frame; a fading overlay would be in it.
if (capture) app.dataset.capture = '';

if (mode === 'scene') void startScene();
else show('static');
