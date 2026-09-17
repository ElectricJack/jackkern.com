import type { Viewpoint } from '../types';

export type PanelContent = { id: string; title: string; html: string; screenshots: string[]; discipline?: string; summary?: string; details?: string; links?: string };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Build-time and runtime share this so the served HTML already contains every panel. */
export function panelMarkup(content: PanelContent[]): string {
  return content
    .map((c, index) => {
      const shots = c.screenshots
        .map((s) => `<img src="${escapeHtml(s)}" alt="${escapeHtml(c.title)} screenshot" loading="lazy">`)
        .join('');
      const more = `<div class="project-preview">${shots}${c.id === 'quilt-trader' ? '<p class="preview-caption">Data verification example · synthetic data</p>' : ''}<div class="details-body">${c.details?.match(/^<p>[\s\S]*?<\/p>/)?.[0] ?? ''}</div></div>`;
      return `<section class="panel" data-stop="${escapeHtml(c.id)}" hidden><div class="project-overview"><div class="panel-meta"><span>${String(index + 1).padStart(2, '0')} / SELECTED WORK</span><span>IN THE COLLECTION</span></div><h2>${escapeHtml(c.title)}</h2><p class="discipline">${escapeHtml(c.discipline ?? 'Selected project')}</p><div class="panel-body">${c.summary ?? c.html}</div>${more}</div><div class="project-links">${c.links ?? ''}</div></section>`;
    })
    .join('\n');
}

export class Panels {
  private sections: Map<string, HTMLElement>;
  private windows: { id: string; start: number; end: number; fade: number }[] = [];

  constructor(root: HTMLElement, content: PanelContent[]) {
    if (!root.querySelector('section.panel')) root.innerHTML = panelMarkup(content);
    this.sections = new Map(
      [...root.querySelectorAll<HTMLElement>('section.panel')].map((s) => [s.dataset.stop!, s]),
    );
  }

  setRoute(viewpoints: Viewpoint[], fractions: number[], length: number): void {
    this.windows = [...this.sections.keys()].flatMap((id) => {
      const indices = viewpoints.flatMap((v, i) => v.stop === id ? [i] : []);
      if (!indices.length) return [];
      const first = indices[0], last = indices[indices.length - 1];
      return [{ id, start: fractions[first], end: fractions[last], fade: 1.8 / length }];
    });
  }

  update(u: number): void {
    const current = this.windows.map((w) => ({ id: w.id, opacity: paneVisibility(u, w.start, w.end, w.fade) }))
      .find((w) => w.opacity > 0);
    this.show(current?.id ?? null, current?.opacity ?? 0);
  }

  show(stopId: string | null, opacity = 1): void {
    // Keep a card readable while someone is using its links. Moving the
    // camera must never silently remove keyboard focus; leaving the card releases it.
    const focused = [...this.sections.entries()].find(([, section]) => section.contains(document.activeElement));
    if (focused) { stopId = focused[0]; opacity = 1; }
    for (const [id, section] of this.sections) {
      const visible = id === stopId && opacity > 0.001;
      section.hidden = !visible;
      section.style.setProperty('--pane-opacity', visible ? opacity.toFixed(3) : '0');
      section.inert = !visible || opacity < 0.15;
      if (!visible) section.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
    }
  }
}

/** Distance-based fades work identically when travelling forwards or backwards. */
export function paneVisibility(u: number, start: number, end: number, fade: number): number {
  const t = Math.max(0, Math.min(1, (u - start + fade) / fade, (end + fade - u) / fade));
  return t * t * (3 - 2 * t);
}

export function projectIndexMarkup(content: PanelContent[]): string {
  return content.map((c, i) => `<a href="#project-${escapeHtml(c.id)}" data-project="${escapeHtml(c.id)}"><span class="index-number">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(c.title)}<small>${escapeHtml(c.discipline ?? 'Selected project')}</small></span><span aria-hidden="true">↗</span></a>`).join('\n');
}
