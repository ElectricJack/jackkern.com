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
const fallback = document.getElementById('fallback') as HTMLElement;
const canvas = document.getElementById('villa') as HTMLCanvasElement;
const panels = document.getElementById('panels') as HTMLElement;
const launch = document.getElementById('enter-villa') as HTMLButtonElement;
const capture = new URLSearchParams(location.search).has('capture');

const mode = chooseMode({
  webgl: supportsWebGL(),
  reducedMotion: prefersReducedMotion(),
  capture,
});

let starting = false;
let running = false;

function showScene(): void {
  app.dataset.mode = 'scene';
  fallback.hidden = true;
  canvas.hidden = false;
  panels.hidden = false;
  launch.hidden = true;
}

function showStatic(): void {
  app.dataset.mode = 'static';
  fallback.hidden = false;
  canvas.hidden = true;
  panels.hidden = true;
}

async function startScene(): Promise<void> {
  if (starting) return;
  starting = true;
  launch.disabled = true;
  showScene();

  try {
    const { boot } = await import('./main');
    await boot();
    running = true;
  } catch (error) {
    console.error('villa: falling back to static', error);
    // The launch button stays hidden: the same boot would fail the same way.
    showStatic();
  }
}

// A GPU reset, a driver update or too many contexts on the page loses the
// context and leaves the canvas frozen. three.js keeps the context restorable,
// so show the static page meanwhile and come back when the browser restores it.
canvas.addEventListener('webglcontextlost', () => {
  console.warn('villa: WebGL context lost; showing the static page until it is restored');
  showStatic();
});
canvas.addEventListener('webglcontextrestored', () => {
  if (running) showScene();
});

if (mode === 'scene') {
  launch.hidden = false;
  launch.addEventListener('click', () => { void startScene(); });
  if (capture) void startScene();
}
