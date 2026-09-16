/**
 * Link check over the built output — not over src/, because the build is what
 * ships and the build is what rewrites things.
 *
 *   node tools/link-check.mjs [dist] [--external] [--timeout 10000]
 *
 * Three classes of link, three policies:
 *
 *   in-page (#about)     an element with that id must exist in the same file.
 *   local   (/site.js)   the file must exist under dist/.
 *   external (https://)  only checked with --external. A 404/410 or a dead
 *                        host fails. A 401/403/405/429 does not: those are
 *                        bot defences, and a CI runner tripping GitHub's rate
 *                        limiter is not a broken link on the page.
 *
 * mailto:, tel: and data: are left alone.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const checkExternal = args.includes('--external');
const timeoutIdx = args.indexOf('--timeout');
const timeout = timeoutIdx === -1 ? 10000 : Number(args[timeoutIdx + 1]);
const dist = resolve(args.find((a) => !a.startsWith('--') && a !== String(timeout)) ?? 'dist');

/** Statuses that mean "the server does not want a robot", not "no such page". */
const TOLERATED = new Set([401, 403, 405, 429, 999]);

const problems = [];
const checked = { anchor: 0, local: 0, external: 0, skipped: 0 };

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** href="…" / src="…", single or double quoted. */
function extractRefs(html) {
  const refs = [];
  const re = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const m of html.matchAll(re)) refs.push(m[1] ?? m[2]);
  return refs;
}

function extractIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    ids.add(m[1] ?? m[2]);
  }
  return ids;
}

async function head(url) {
  const attempt = async (method) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      return await fetch(url, {
        method,
        redirect: 'follow',
        signal: ac.signal,
        headers: { 'user-agent': 'jackkern.com-link-check' },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  // Some hosts answer HEAD with 403/405 but serve GET fine; try both before
  // calling a link dead.
  const first = await attempt('HEAD');
  if (first.ok || !TOLERATED.has(first.status)) return first;
  return attempt('GET');
}

async function main() {
  const files = await walk(dist);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const present = new Set(files.map((f) => '/' + relative(dist, f).split(/[\\/]/).join('/')));

  if (!htmlFiles.length) {
    console.error(`link-check: no HTML found under ${dist} — did the build run?`);
    process.exit(1);
  }

  const external = new Map(); // url -> [where]

  for (const file of htmlFiles) {
    const where = relative(dist, file);
    const html = await readFile(file, 'utf8');
    const ids = extractIds(html);

    for (const raw of extractRefs(html)) {
      const ref = raw.trim();
      if (!ref || /^(mailto:|tel:|data:|javascript:)/i.test(ref)) {
        checked.skipped += 1;
        continue;
      }

      if (ref.startsWith('#')) {
        checked.anchor += 1;
        const id = decodeURIComponent(ref.slice(1));
        if (id && !ids.has(id)) problems.push(`${where}: "${ref}" — no element with id="${id}"`);
        continue;
      }

      if (/^https?:\/\//i.test(ref)) {
        const url = ref.split('#')[0];
        if (!external.has(url)) external.set(url, []);
        external.get(url).push(where);
        continue;
      }

      if (ref.startsWith('//')) {
        problems.push(`${where}: "${ref}" — protocol-relative URL, use https://`);
        continue;
      }

      // Local path, absolute or relative to the file.
      checked.local += 1;
      const path = ref.startsWith('/')
        ? ref.split(/[?#]/)[0]
        : '/' + relative(dist, resolve(join(dist, where), '..', ref.split(/[?#]/)[0]))
            .split(/[\\/]/)
            .join('/');

      if (!present.has(path) && !present.has(path.replace(/\/$/, '/index.html'))) {
        problems.push(`${where}: "${ref}" — no such file in the build (looked for ${path})`);
      }
    }
  }

  if (checkExternal) {
    const entries = [...external.entries()];
    const results = await Promise.all(
      entries.map(async ([url, wheres]) => {
        try {
          const res = await head(url);
          if (res.ok || TOLERATED.has(res.status)) {
            return { url, note: res.ok ? null : `${res.status} (tolerated)` };
          }
          return { url, problem: `${wheres[0]}: ${url} — HTTP ${res.status}` };
        } catch (err) {
          const reason = err.name === 'AbortError' ? `no response in ${timeout}ms` : err.message;
          return { url, problem: `${wheres[0]}: ${url} — ${reason}` };
        }
      })
    );

    for (const r of results) {
      checked.external += 1;
      if (r.problem) problems.push(r.problem);
      else if (r.note) console.log(`  tolerated  ${r.url} — ${r.note}`);
    }
  } else {
    checked.skipped += external.size;
  }

  const counts =
    `${checked.anchor} in-page, ${checked.local} local, ` +
    (checkExternal ? `${checked.external} external` : `${external.size} external (skipped)`);

  if (problems.length) {
    console.error(`link-check: ${problems.length} broken (${counts})`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(`link-check: ok — ${counts}`);
}

main().catch((err) => {
  console.error(`link-check: ${err.message}`);
  process.exit(1);
});
