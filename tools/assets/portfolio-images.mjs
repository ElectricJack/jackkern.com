/** Optimize existing project captures. Run from the website root after capturing Quilt's demo. */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/images/projects', { recursive: true });
const sources = {
  'matter-engine': '../matter-engine/public/images/stream-mountain.webp',
  'matter-editor': '../matter-engine/public/images/matter-editor.webp',
  'outrider-ide': '../outrider/sites/outrider/public/media/images/churn--desktop--dark.webp',
  'outrider-code': '../outrider/sites/outrider/public/media/images/code-panes--desktop--dark.webp',
  'agent-queue': '../agent-queue/sites/agent-queue/public/media/images/command-center--desktop--dark.webp',
  'agent-graph': '../agent-queue/sites/agent-queue/public/media/images/task-graph--desktop--dark.webp',
  'quilt-trader': 'tmp/feedback/quilt-demo.png',
};
for (const [name, source] of Object.entries(sources)) {
  const info = await sharp(source).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`public/images/projects/${name}.webp`);
  console.log(name, info.size);
}
