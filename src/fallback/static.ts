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

/** The no-WebGL version: every viewpoint as an image, every project panel once, in rail order. */
export function staticMarkup(content: PanelContent[], viewpoints: Viewpoint[]): string {
  const byStop = new Map(content.map((item) => [item.id, item]));
  const shown = new Set<string>();
  let html = `<div class="static-intro"><p class="eyebrow">A personal collection</p><h1>A place for<br>things I <em>build.</em></h1><p>Engines, developer tools, and systems for working with AI. A few ongoing explorations, gathered under one roof.</p><p id="view-notice" hidden></p><a class="text-button" href="./?view=scene">Explore in 3D <span aria-hidden="true">↗</span></a></div><section class="static-index" id="work-index" aria-label="Project index"><nav class="project-index">${projectIndexMarkup(content)}</nav></section>`;

  for (const [index, viewpoint] of viewpoints.entries()) {
    // Every view is lazy, the first included. While the villa loads the list is hidden, and a hidden
    // lazy image is never fetched, so a visitor who gets the villa does not also download its
    // picture; when the list does show, the first view is on screen and loads at once. The rest
    // stay folded away so the browser does not fetch full-size screenshots nobody opened.
    const image = `<img src="./static/${escapeHtml(viewpoint.id)}.jpg" alt="View of ${escapeHtml(viewpoint.stop)}" loading="lazy" width="1280" height="720">`;
    html += index === 0
      ? `<figure class="static-view">${image}</figure>`
      : `<details class="static-view"><summary>Show view of ${escapeHtml(viewpoint.stop)}</summary>${image}</details>`;
    const panel = byStop.get(viewpoint.stop);
    if (panel && !shown.has(viewpoint.stop)) {
      shown.add(viewpoint.stop);
      html += `<section class="panel static" id="project-${escapeHtml(panel.id)}" data-stop="${escapeHtml(panel.id)}"><p class="eyebrow">${escapeHtml(panel.discipline ?? 'Selected project')}</p><h2>${escapeHtml(panel.title)}</h2><div class="panel-body">${panel.html}</div></section>`;
    }
  }

  return html + '<div class="static-end"><p class="eyebrow">Always something in the making</p><a class="text-button" href="mailto:jack.w.kern@gmail.com">Let’s talk <span aria-hidden="true">↗</span></a></div>';
}

export function renderStatic(root: HTMLElement, content: PanelContent[], viewpoints: Viewpoint[]): void {
  root.innerHTML = staticMarkup(content, viewpoints);
  root.dataset.mode = 'static';
}
