/**
 * Dev-server middleware for the static fallback images. They are build
 * products (tools/render-static.mjs writes them into dist/static), so `vite`
 * has nothing to serve at /static/<viewpoint>.jpg. Serve the last build's
 * capture when there is one, and otherwise a labelled placeholder, rather than
 * a 404 on every dev page load. Paths that are not a rail viewpoint still 404.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export function placeholderSvg(id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
    `<rect width="1280" height="720" fill="#e8e4dc"/>` +
    `<text x="640" y="360" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" fill="#2a2622">` +
    `No capture of ${id} yet: run npm run build</text></svg>`;
}

/** `viewpoints` is the set of rail viewpoint ids the page links. */
export function devCaptures(root, viewpoints) {
  return async (req, res, next) => {
    const match = /^\/static\/([\w-]+)\.jpg$/.exec((req.url ?? '').split('?')[0]);
    if (!match || !viewpoints.has(match[1])) return next();
    try {
      const bytes = await readFile(join(root, 'dist/static', `${match[1]}.jpg`));
      res.setHeader('Content-Type', 'image/jpeg');
      res.end(bytes);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end(placeholderSvg(match[1]));
    }
  };
}
