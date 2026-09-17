import { escapeHtml, projectIndexMarkup, type PanelContent } from '../panels/panels';
import type { Viewpoint } from '../types';

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    // Hand the test context back now rather than whenever it is collected:
    // browsers cap live contexts per page and evict the oldest.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A complete editorial portfolio, also readable without JavaScript or WebGL. */
export function staticMarkup(content: PanelContent[], viewpoints: Viewpoint[]): string {
  let html = `<div class="static-intro"><p class="eyebrow">A personal collection</p><h1>A place for<br>things I <em>build.</em></h1><p>Engines, developer tools, and systems for working with AI. A few ongoing explorations, gathered under one roof.</p><p id="view-notice" hidden></p><a class="text-button" href="./?view=scene">Explore in 3D <span aria-hidden="true">↗</span></a></div><section class="static-index" id="work-index" aria-label="Project index"><nav class="project-index">${projectIndexMarkup(content)}</nav></section>`;
  for (const [index, panel] of content.entries()) {
    const viewpoint = viewpoints.find(v => v.stop === panel.id);
    const shots = panel.screenshots.length ? panel.screenshots : viewpoint ? [`./static/${viewpoint.id}.jpg`] : [];
    html += `<section class="panel static reveal" id="project-${escapeHtml(panel.id)}" data-stop="${escapeHtml(panel.id)}"><div class="static-copy"><p class="eyebrow">${String(index + 1).padStart(2, '0')} / ${escapeHtml(panel.discipline ?? 'Selected project')}</p><h2>${escapeHtml(panel.title)}</h2><div class="panel-body">${panel.html}</div></div><div class="static-gallery">${shots.map((src, i) => `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(panel.title)} — project preview ${i + 1}" width="1280" height="800" loading="lazy" decoding="async"><figcaption>${escapeHtml(panel.title)} / ${panel.id === 'quilt-trader' ? 'Data verification example · synthetic data' : i === 0 ? 'A closer look' : 'Inside the project'}</figcaption></figure>`).join('')}</div></section>`;
  }
  return html + '<section class="environment-story reveal"><p class="eyebrow">About the place</p><h2>A small world, made of matter.</h2><p>The architecture and material assets in the 3D villa were built in Matter Engine and exported to three.js. Sunlit stone, moving water, and quiet gardens make a place to spend a little time with the work.</p><a class="text-button" href="./?view=scene">Step into the villa <span aria-hidden="true">↗</span></a></section><div class="static-end"><p class="eyebrow">Always something in the making</p><a class="text-button" href="mailto:jack.w.kern@gmail.com">Let’s talk <span aria-hidden="true">↗</span></a></div>';
}

export function renderStatic(root: HTMLElement, content: PanelContent[], viewpoints: Viewpoint[]): void {
  root.innerHTML = staticMarkup(content, viewpoints);
  root.dataset.mode = 'static';
}
