/**
 * Byte budgets over the built site (spec section 8). Fails when any is exceeded.
 *
 *   node tools/budgets.mjs [dist]
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../layout/layout.js';

const MB = 1024 * 1024;

export const LIMITS = {
  firstLoad: 12 * MB,
  stop: 6 * MB,
  texture: 1.5 * MB,
  assets: 80 * MB,
};

async function walk(dir, base = dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full, base));
    } else {
      files.push({
        rel: relative(base, full).split('\\').join('/'),
        bytes: (await stat(full)).size,
      });
    }
  }
  return files;
}

/** Measure the shell, per-stop assets, first-load payload, and aggregate assets. */
export async function measure(root, dist = 'dist') {
  const files = await walk(join(root, dist));
  const sum = (predicate) => files
    .filter(predicate)
    .reduce((bytes, file) => bytes + file.bytes, 0);
  const manifest = JSON.parse(await readFile(join(root, 'content/manifest.json'), 'utf8'));
  const contract = JSON.parse(await readFile(join(root, 'kit/contract.json'), 'utf8'));
  const plan = layout(manifest, contract);

  const partsByStop = new Map();
  const instancesByStop = new Map();
  const order = [];
  for (const placement of plan.placements) {
    if (!partsByStop.has(placement.stop)) {
      partsByStop.set(placement.stop, new Set());
      instancesByStop.set(placement.stop, new Set());
      order.push(placement.stop);
    }
    partsByStop.get(placement.stop).add(placement.part);
    instancesByStop.get(placement.stop).add(placement.instance);
  }

  const stopBytes = {};
  for (const stop of order) {
    const parts = [...partsByStop.get(stop)];
    const instances = [...instancesByStop.get(stop)];
    stopBytes[stop] = sum((file) =>
      parts.some((part) => file.rel.startsWith(`assets/kit/${part}.`)) ||
      instances.some((instance) => file.rel.startsWith(`assets/bake/${instance}.`))
    );
  }

  const shell = sum((file) => file.rel === 'index.html' || file.rel.startsWith('bundle/'));
  const firstLoad = shell + (stopBytes[order[0]] ?? 0) + (stopBytes[order[1]] ?? 0);
  const textures = files.filter((file) =>
    file.rel.startsWith('assets/') && /\.(ktx2|png|jpg|jpeg|webp)$/i.test(file.rel)
  );

  return {
    shell,
    firstLoad,
    stopBytes,
    largestTexture: textures.reduce((largest, texture) => Math.max(largest, texture.bytes), 0),
    assets: sum((file) => file.rel.startsWith('assets/')),
    total: sum(() => true),
  };
}

export function violations(measurement) {
  const format = (bytes) => `${(bytes / MB).toFixed(2)} MB`;
  const found = [];
  if (measurement.firstLoad > LIMITS.firstLoad) {
    found.push(`first load ${format(measurement.firstLoad)} exceeds ${format(LIMITS.firstLoad)}`);
  }
  for (const [stop, bytes] of Object.entries(measurement.stopBytes)) {
    if (bytes > LIMITS.stop) {
      found.push(`stop ${stop} ${format(bytes)} exceeds ${format(LIMITS.stop)}`);
    }
  }
  if (measurement.largestTexture > LIMITS.texture) {
    found.push(`texture ${format(measurement.largestTexture)} exceeds ${format(LIMITS.texture)}`);
  }
  if (measurement.assets > LIMITS.assets) {
    found.push(`assets folder ${format(measurement.assets)} exceeds ${format(LIMITS.assets)}`);
  }
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measurement = await measure(process.cwd(), process.argv[2] ?? 'dist');
  const format = (bytes) => `${(bytes / MB).toFixed(2)} MB`;
  console.log(
    `shell ${format(measurement.shell)}  first load ${format(measurement.firstLoad)}` +
    `  assets ${format(measurement.assets)}  largest texture ${format(measurement.largestTexture)}` +
    `  total ${format(measurement.total)}`
  );
  for (const [stop, bytes] of Object.entries(measurement.stopBytes)) {
    console.log(`  ${stop.padEnd(16)} ${format(bytes)}`);
  }
  const found = violations(measurement);
  if (found.length) {
    console.error(found.join('\n'));
    process.exit(1);
  }
  console.log('budgets: ok');
}
