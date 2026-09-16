import { chooseMode } from './boot';
import { prefersReducedMotion, supportsWebGL } from './fallback/static';

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

function restoreStatic(error?: unknown): void {
  if (error) console.error('villa: falling back to static', error);
  app.dataset.mode = 'static';
  fallback.hidden = false;
  canvas.hidden = true;
  panels.hidden = true;
  if (!capture && mode === 'scene') launch.hidden = false;
}

async function startScene(): Promise<void> {
  if (starting) return;
  starting = true;
  launch.disabled = true;
  app.dataset.mode = 'scene';
  fallback.hidden = true;
  canvas.hidden = false;
  panels.hidden = false;
  launch.hidden = true;

  try {
    const { boot } = await import('./main');
    await boot();
  } catch (error) {
    restoreStatic(error);
  }
}

if (mode === 'scene') {
  launch.hidden = false;
  launch.addEventListener('click', () => { void startScene(); });
  if (capture) void startScene();
}
