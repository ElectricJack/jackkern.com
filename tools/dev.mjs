/**
 * Local preview server. Node builtins only.
 *
 *   node tools/dev.mjs            serve src/ over public/ (edit and reload)
 *   node tools/dev.mjs --dist     serve dist/ (what actually ships)
 *   node tools/dev.mjs --port 8080
 *
 * In source mode the roots are stacked so /styles.css resolves from src/ and
 * /CNAME from public/ — the same two trees the build merges, without the
 * build step in the loop.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = Number(portIdx === -1 ? process.env.PORT || 4321 : args[portIdx + 1]);
const serveDist = args.includes('--dist');

const roots = serveDist
  ? [join(repo, 'dist')]
  : [join(repo, 'src'), join(repo, 'public')];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Resolve a URL path against the stacked roots, refusing to escape them. */
async function locate(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = clean.endsWith('/') ? [join(clean, 'index.html')] : [clean, join(clean, 'index.html')];

  for (const root of roots) {
    for (const candidate of candidates) {
      const full = resolve(root, '.' + (candidate.startsWith('/') ? candidate : '/' + candidate));
      if (!full.startsWith(root)) continue;
      try {
        const info = await stat(full);
        if (info.isFile()) return full;
      } catch {
        /* next candidate */
      }
    }
  }
  return null;
}

createServer(async (req, res) => {
  const file = await locate(req.url || '/');

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`404 ${req.url}\n`);
    console.log(`404 ${req.url}`);
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] || 'application/octet-stream',
    // Nothing is cached in dev: a reload must always show the last save.
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`serving ${serveDist ? 'dist/' : 'src/ + public/'} on http://localhost:${port}`);
});
