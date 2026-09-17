/** Panel content: manifest project stops plus their Markdown, rendered to HTML. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { marked } from 'marked';

export async function buildContent(root) {
  const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
  const out = [];
  for (const stop of manifest.stops) {
    if (stop.kind !== 'project') continue;
    const markdown = await readFile(join(root, stop.panel), 'utf8');
    const html = await marked.parse(markdown);
    const summary = html.match(/^<p>[\s\S]*?<\/p>/)?.[0] ?? '';
    const links = html.match(/<p><a\s[\s\S]*?<\/p>\s*$/)?.[0] ?? '';
    const details = html.slice(summary.length, links ? html.lastIndexOf(links) : undefined).trim();
    out.push({ id: stop.id, title: stop.title, discipline: stop.discipline ?? 'Selected project', html, summary, details, links, screenshots: stop.screenshots ?? [] });
  }
  return out;
}
