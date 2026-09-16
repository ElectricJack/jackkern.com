import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { compare } from '../../tools/check-visual.mjs';

function png(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Buffer {
  const image = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y);
    const index = (y * w + x) * 4;
    image.data[index] = r;
    image.data[index + 1] = g;
    image.data[index + 2] = b;
    image.data[index + 3] = 255;
  }
  return PNG.sync.write(image);
}

test('compare passes identical images, fails a changed one, and update writes references', async () => {
  const actual = await mkdtemp(join(tmpdir(), 'vis-a-'));
  const refs = await mkdtemp(join(tmpdir(), 'vis-r-'));
  const grey = png(40, 30, () => [128, 128, 128]);
  await writeFile(join(actual, 'a.png'), grey);
  await writeFile(join(actual, 'b.png'), grey);

  const first = await compare(actual, refs, { update: true });
  expect(first.failures).toEqual([]);
  expect(first.compared).toBe(2);

  await writeFile(join(actual, 'b.png'), png(40, 30, (x) => (x < 20 ? [255, 0, 0] : [128, 128, 128])));
  const second = await compare(actual, refs, { update: false });
  expect(second.failures.length).toBe(1);
  expect(second.failures[0]).toMatch(/^b\.png: /);

  await writeFile(join(actual, 'c.png'), grey);
  const third = await compare(actual, refs, { update: false });
  expect(third.failures.some((failure) => failure.startsWith('c.png: no reference'))).toBe(true);

  await rm(actual, { recursive: true, force: true });
  await rm(refs, { recursive: true, force: true });
});
