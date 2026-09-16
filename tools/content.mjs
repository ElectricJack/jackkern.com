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
    out.push({ id: stop.id, title: stop.title, html: await marked.parse(markdown), screenshots: stop.screenshots ?? [] });
  }
  return out;
}
