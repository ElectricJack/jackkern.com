/**
 * The whole build. No dependencies, no lockfile, no install step.
 *
 *   public/  -> dist/            (verbatim: CNAME, favicon, robots, sitemap)
 *   src/     -> dist/            (site.js verbatim; index.html transformed)
 *
 * The one transform that matters: src/styles.css is inlined into a <style>
 * tag in place of its <link>. On a single page of this size the stylesheet is
 * smaller than the round trip it would cost, and inlining removes the only
 * render-blocking request on the critical path.
 *
 *   node tools/build.mjs [--out dist]
 */
import { mkdir, readdir, readFile, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repo, 'src');
const publicDir = join(repo, 'public');

const outArg = process.argv.indexOf('--out');
const outDir = resolve(repo, outArg === -1 ? 'dist' : process.argv[outArg + 1]);

/** Recursively copy a directory into dist, creating parents as needed. */
async function copyTree(from, to) {
  let entries;
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  let count = 0;
  for (const entry of entries) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) {
      await mkdir(dest, { recursive: true });
      count += await copyTree(src, dest);
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
      count += 1;
    }
  }
  return count;
}

/**
 * Comment and whitespace squeeze. Deliberately conservative — it never touches
 * string contents, and it leaves the cascade alone. Saves roughly a quarter of
 * the file, which is the whole point of a build this small.
 */
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s*([{};:,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/** Strip HTML comments, except the TODO markers that are the point of them. */
function stripComments(html) {
  return html.replace(/<!--([\s\S]*?)-->/g, (match, body) =>
    /TODO\(/.test(body) ? match : ''
  );
}

function humanBytes(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

async function build() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const copiedPublic = await copyTree(publicDir, outDir);

  // Everything in src except the two files index.html consumes directly.
  const srcEntries = await readdir(srcDir, { withFileTypes: true });
  let copiedSrc = 0;
  for (const entry of srcEntries) {
    if (!entry.isFile() || entry.name === 'index.html' || entry.name === 'styles.css') continue;
    await copyFile(join(srcDir, entry.name), join(outDir, entry.name));
    copiedSrc += 1;
  }

  const rawHtml = await readFile(join(srcDir, 'index.html'), 'utf8');
  const rawCss = await readFile(join(srcDir, 'styles.css'), 'utf8');
  const css = minifyCss(rawCss);

  const linkTag = '<link rel="stylesheet" href="/styles.css" />';
  if (!rawHtml.includes(linkTag)) {
    throw new Error(
      `build: expected the stylesheet link \`${linkTag}\` in src/index.html so it could be inlined`
    );
  }

  const html = stripComments(rawHtml.replace(linkTag, `<style>${css}</style>`))
    // A stripped comment leaves its indentation behind as a blank-looking line.
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

  await writeFile(join(outDir, 'index.html'), html + '\n', 'utf8');

  // A placeholder left on the page is not an error — the site is meant to go
  // up before every blank is filled — but it should never be a surprise.
  const todos = [...html.matchAll(/data-todo="([^"]+)"/g)].map((m) => m[1]);

  const out = relative(repo, outDir) || '.';
  console.log(`built ${out}/`);
  console.log(
    `  index.html   ${humanBytes(Buffer.byteLength(html))}` +
      `   (css ${humanBytes(Buffer.byteLength(rawCss))} -> ${humanBytes(Buffer.byteLength(css))}, inlined)`
  );
  console.log(`  copied       ${copiedPublic} from public/, ${copiedSrc} from src/`);

  if (todos.length) {
    console.log(`  placeholders ${todos.length} unfilled: ${todos.join(', ')}`);
    console.log('               see CONTENT-TODO.md');
  } else {
    console.log('  placeholders none — CONTENT-TODO.md can go');
  }

  await stat(join(outDir, 'CNAME')).catch(() => {
    throw new Error('build: dist/CNAME is missing — GitHub Pages would drop the custom domain');
  });
}

build().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
