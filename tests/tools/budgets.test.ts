import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS, measure, violations } from '../../tools/budgets.mjs';

const root = join(__dirname, '..', '..');

async function fakeSite(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'budget-'));
  for (const path of ['kit', 'content']) {
    await cp(join(root, path), join(dir, path), { recursive: true });
  }
  await mkdir(join(dir, 'dist/bundle'), { recursive: true });
  await mkdir(join(dir, 'dist/assets/kit'), { recursive: true });
  await mkdir(join(dir, 'dist/assets/bake'), { recursive: true });
  await writeFile(join(dir, 'dist/index.html'), 'x'.repeat(1000));
  await writeFile(join(dir, 'dist/bundle/index.js'), 'x'.repeat(4000));
  return dir;
}

test('measure attributes kit and bake files to the stops that use them', async () => {
  const dir = await fakeSite();
  try {
    await writeFile(join(dir, 'dist/assets/kit/column-doric.obj'), 'x'.repeat(300));
    await writeFile(join(dir, 'dist/assets/kit/column-doric.albedo.ktx2'), 'x'.repeat(700));
    await writeFile(join(dir, 'dist/assets/bake/entry.column-doric.1.lightmap.ktx2'), 'x'.repeat(50));

    const measured = await measure(dir);
    expect(measured.shell).toBe(5000);
    expect(measured.stopBytes.entry).toBe(1050);
    expect(measured.stopBytes['matter-engine']).toBe(1000);
    expect(measured.stopBytes['cy-1']).toBe(1000);
    expect(measured.firstLoad).toBe(5000 + 1050 + 1000);
    expect(measured.largestTexture).toBe(700);
    expect(measured.assets).toBe(1050);
    expect(violations(measured)).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('violations name the budget that was exceeded', () => {
  const measured = {
    shell: 0,
    firstLoad: LIMITS.firstLoad + 1,
    stopBytes: { entry: LIMITS.stop + 1 },
    largestTexture: LIMITS.texture + 1,
    assets: LIMITS.assets + 1,
    total: 0,
  };
  const found = violations(measured);
  expect(found.some((message) => message.startsWith('first load'))).toBe(true);
  expect(found.some((message) => message.startsWith('stop entry'))).toBe(true);
  expect(found.some((message) => message.startsWith('texture'))).toBe(true);
  expect(found.some((message) => message.startsWith('assets folder'))).toBe(true);
});
