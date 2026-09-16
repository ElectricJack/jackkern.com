export type PanelContent = { id: string; title: string; html: string; screenshots: string[] };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Build-time and runtime share this so the served HTML already contains every panel. */
export function panelMarkup(content: PanelContent[]): string {
  return content
    .map((c) => {
      const shots = c.screenshots
        .map((s) => `<img src="${escapeHtml(s)}" alt="${escapeHtml(c.title)} screenshot" loading="lazy">`)
        .join('');
      return `<section class="panel" data-stop="${escapeHtml(c.id)}" hidden><h2>${escapeHtml(c.title)}</h2>${shots}<div class="panel-body">${c.html}</div></section>`;
    })
    .join('\n');
}

export class Panels {
  private sections: Map<string, HTMLElement>;

  constructor(root: HTMLElement, content: PanelContent[]) {
    if (!root.querySelector('section.panel')) root.innerHTML = panelMarkup(content);
    this.sections = new Map(
      [...root.querySelectorAll<HTMLElement>('section.panel')].map((s) => [s.dataset.stop!, s]),
    );
  }

  show(stopId: string | null): void {
    for (const [id, section] of this.sections) section.hidden = id !== stopId;
  }
}
