import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devCaptures } from '../../tools/dev-captures.mjs';

type Served = { passed: boolean; type?: string; body?: string };

async function request(root: string, url: string): Promise<Served> {
  const middleware = devCaptures(root, new Set(['entry-view', 'cy-1-view']));
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; },
      end: (body: Buffer | string) => resolve({ passed: false, type: headers['content-type'], body: String(body) }),
    };
    void middleware({ url }, res, () => resolve({ passed: true }));
  });
}

test('dev serves the last build\'s capture, a placeholder before any build, and leaves other paths to 404', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dev-captures-'));
  try {
    await mkdir(join(root, 'dist/static'), { recursive: true });
    await writeFile(join(root, 'dist/static/entry-view.jpg'), 'jpeg bytes');

    expect(await request(root, '/static/entry-view.jpg?t=1')).toEqual({ passed: false, type: 'image/jpeg', body: 'jpeg bytes' });

    const placeholder = await request(root, '/static/cy-1-view.jpg');
    expect(placeholder.type).toBe('image/svg+xml');
    expect(placeholder.body).toContain('No capture of cy-1-view yet: run npm run build');

    expect(await request(root, '/static/no-such-view.jpg')).toEqual({ passed: true });
    expect(await request(root, '/static/entry-view.png')).toEqual({ passed: true });
    expect(await request(root, '/src/entry.ts')).toEqual({ passed: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
