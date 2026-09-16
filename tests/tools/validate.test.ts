import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '../../tools/validate.mjs';

const root = join(__dirname, '..', '..');

async function copyRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'villa-'));
  for (const path of ['kit', 'content']) {
    await cp(join(root, path), join(dir, path), { recursive: true });
  }
  return dir;
}

async function mutate(dir: string, file: string, fn: (doc: any) => void) {
  const doc = JSON.parse(await readFile(join(dir, file), 'utf8'));
  fn(doc);
  await writeFile(join(dir, file), JSON.stringify(doc));
}

test('the committed contract and manifest validate', async () => {
  expect(await validateAll(root)).toEqual([]);
});

test('a project stop without a panel is a named schema error', async () => {
  const dir = await copyRepo();
  await mutate(dir, 'content/manifest.json', (manifest) => delete manifest.stops[1].panel);
  const errors = await validateAll(dir);
  expect(errors.some((error) => error.startsWith('manifest') && error.includes('panel'))).toBe(true);
  await rm(dir, { recursive: true, force: true });
});

test('a focal that is not a focal part is reported', async () => {
  const dir = await copyRepo();
  await mutate(dir, 'content/manifest.json', (manifest) => (manifest.stops[1].focal = 'column-doric'));
  const errors = await validateAll(dir);
  expect(errors).toContain('manifest matter-engine: focal column-doric is not a focal part');
  await rm(dir, { recursive: true, force: true });
});

test('a missing panel file is reported', async () => {
  const dir = await copyRepo();
  await rm(join(dir, 'content/agent-queue.md'));
  const errors = await validateAll(dir);
  expect(errors).toContain('manifest agent-queue: panel file content/agent-queue.md missing');
  await rm(dir, { recursive: true, force: true });
});

test('duplicate part ids are reported', async () => {
  const dir = await copyRepo();
  await mutate(dir, 'kit/contract.json', (contract) => contract.parts.push({ ...contract.parts[0] }));
  expect(await validateAll(dir)).toContain('contract: duplicate part ids');
  await rm(dir, { recursive: true, force: true });
});
