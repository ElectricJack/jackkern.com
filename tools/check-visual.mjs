/**
 * Compare captured viewpoint PNGs against committed references.
 *
 *   node tools/check-visual.mjs <actualDir> <refDir> [--update]
 *
 * A capture fails when more than 0.5% of pixels differ (pixelmatch threshold
 * 0.1) or when it has no reference. --update (re)writes every reference.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const MAX_DIFF_RATIO = 0.005;

export async function compare(actualDir, refDir, { update = false } = {}) {
  await mkdir(refDir, { recursive: true });
  const files = (await readdir(actualDir)).filter((file) => file.endsWith('.png')).sort();
  const failures = [];

  for (const file of files) {
    const actualBytes = await readFile(join(actualDir, file));
    const refPath = join(refDir, file);
    let refBytes = null;

    try {
      refBytes = await readFile(refPath);
    } catch {
      refBytes = null;
    }

    if (update || !refBytes) {
      if (!update) {
        failures.push(`${file}: no reference; run with --update to accept`);
        continue;
      }
      await writeFile(refPath, actualBytes);
      continue;
    }

    const actual = PNG.sync.read(actualBytes);
    const reference = PNG.sync.read(refBytes);
    if (actual.width !== reference.width || actual.height !== reference.height) {
      failures.push(`${file}: size ${actual.width}x${actual.height} vs reference ${reference.width}x${reference.height}`);
      continue;
    }

    const diff = pixelmatch(actual.data, reference.data, null, actual.width, actual.height, { threshold: 0.1 });
    const ratio = diff / (actual.width * actual.height);
    if (ratio > MAX_DIFF_RATIO) failures.push(`${file}: ${(ratio * 100).toFixed(2)}% of pixels differ`);
  }

  return { failures, compared: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const [actualDir = 'tmp/visual', refDir = 'tests/visual/refs'] = args.filter((arg) => !arg.startsWith('--'));
  const { failures, compared } = await compare(resolve(actualDir), resolve(refDir), { update });
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log(`visual: ${compared} capture(s) ${update ? 'accepted' : 'match'}`);
}
