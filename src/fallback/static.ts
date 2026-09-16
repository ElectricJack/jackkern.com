import { escapeHtml, type PanelContent } from '../panels/panels';
import type { Viewpoint } from '../types';

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
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
  let html = '';

  for (const [index, viewpoint] of viewpoints.entries()) {
    const image = `<img src="/static/${escapeHtml(viewpoint.id)}.jpg" alt="View of ${escapeHtml(viewpoint.stop)}" loading="${index === 0 ? 'eager' : 'lazy'}" width="1280" height="720">`;
    // The first view gives the page a fast, useful visual. The rest remain
    // available in the no-JS fallback without prompting the browser to fetch
    // several full-size screenshots before the visitor asks for them.
    html += index === 0
      ? `<figure class="static-view">${image}</figure>`
      : `<details class="static-view"><summary>Show view of ${escapeHtml(viewpoint.stop)}</summary>${image}</details>`;
    const panel = byStop.get(viewpoint.stop);
    if (panel && !shown.has(viewpoint.stop)) {
      shown.add(viewpoint.stop);
      html += `<section class="panel static" data-stop="${escapeHtml(panel.id)}"><h2>${escapeHtml(panel.title)}</h2><div class="panel-body">${panel.html}</div></section>`;
    }
  }

  return html;
}

export function renderStatic(root: HTMLElement, content: PanelContent[], viewpoints: Viewpoint[]): void {
  root.innerHTML = staticMarkup(content, viewpoints);
  root.dataset.mode = 'static';
}
