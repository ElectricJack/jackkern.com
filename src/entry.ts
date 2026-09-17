import { chooseMode } from './boot';
import { debugRequested, installCollector } from './debug/collect';
import { supportsWebGL } from './fallback/static';

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
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const webgl = supportsWebGL();
const notice = document.getElementById('view-notice') as HTMLElement;

// Enhancement only: unobserved, reduced-motion and no-script content stays visible.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    }
  }, { root: fallback, threshold: .08 });
  fallback.querySelectorAll('.reveal').forEach(element => {
    element.classList.add('will-reveal');
    observer.observe(element);
  });
}

const mode = chooseMode({
  webgl,
  capture,
  view: params.get('view'),
});

/** The scene has drawn a frame, so the context coming back should show it again. */
let running = false;
let lost = false;
let readingPage = false;

/**
 * `loading` and `scene` differ only in the loading overlay: it covers the canvas until the
 * first frame is drawn, then fades (styles.css).
 */
function show(next: 'loading' | 'scene' | 'static', reason = ''): void {
  app.dataset.mode = next;
  fallback.hidden = next !== 'static';
  canvas.hidden = next === 'static';
  panels.hidden = next === 'static';
  notice.hidden = next !== 'static' || !reason;
  notice.textContent = reason;
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
      if (!lost && !readingPage) show('scene');
    });
  } catch (error) {
    console.error('villa: falling back to static', error);
    show('static', 'The 3D villa couldn’t start in this browser. You can try opening it again, or read every project here.');
  }
}

// A GPU reset, a driver update or too many contexts on the page loses the
// context and leaves the canvas frozen. three.js keeps the context restorable,
// so show the static page meanwhile and come back when the browser restores it.
canvas.addEventListener('webglcontextlost', () => {
  console.warn('villa: WebGL context lost; showing the static page until it is restored');
  lost = true;
  show('static', 'The 3D view is temporarily unavailable. You can read the projects while it recovers.');
});
canvas.addEventListener('webglcontextrestored', () => {
  lost = false;
  if (running && !readingPage) show('scene');
});

// The capture tool screenshots the first frame; a fading overlay would be in it.
if (capture) app.dataset.capture = '';

if (mode === 'scene') void startScene();
else show('static', !webgl
  ? 'This browser isn’t providing 3D rendering. You can read every project here, or try the villa in a browser with graphics acceleration enabled.'
  : 'You’re viewing the reading version. The full portfolio is also a 3D villa you can explore.');

document.querySelector('.skip-link')?.addEventListener('click', () => {
  readingPage = true;
  show('static', 'You’re viewing the reading version. The full portfolio is also a 3D villa you can explore.');
  fallback.tabIndex = -1;
  fallback.focus();
});
