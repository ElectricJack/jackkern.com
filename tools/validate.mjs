/**
 * Validate kit/contract.json and content/manifest.json against their schemas
 * and against each other. Exits non-zero on any error when run as a CLI.
 *
 *   node tools/validate.mjs
 */
import Ajv from 'ajv';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function validateAll(root) {
  const errors = [];
  const ajv = new Ajv({ allErrors: true });
  const load = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));

  const contract = await load('kit/contract.json');
  const manifest = await load('content/manifest.json');

  const validContract = ajv.compile(await load('kit/contract.schema.json'));
  if (!validContract(contract)) {
    errors.push(...validContract.errors.map((error) => `contract ${error.instancePath} ${error.message}`));
  }

  const validManifest = ajv.compile(await load('content/manifest.schema.json'));
  if (!validManifest(manifest)) {
    errors.push(...validManifest.errors.map((error) => `manifest ${error.instancePath} ${error.message}`));
  }

  const ids = new Set(contract.parts.map((part) => part.id));
  if (ids.size !== contract.parts.length) errors.push('contract: duplicate part ids');

  const category = new Map(contract.parts.map((part) => [part.id, part.category]));
  const stopIds = new Set();
  for (const stop of manifest.stops) {
    if (stopIds.has(stop.id)) errors.push(`manifest: duplicate stop id ${stop.id}`);
    stopIds.add(stop.id);
    if (stop.kind !== 'project') continue;
    if (category.get(stop.focal) !== 'focal') {
      errors.push(`manifest ${stop.id}: focal ${stop.focal} is not a focal part`);
    }
    if (stop.panel) {
      try {
        await access(join(root, stop.panel));
      } catch {
        errors.push(`manifest ${stop.id}: panel file ${stop.panel} missing`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await validateAll(process.cwd());
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('validate: ok');
}
