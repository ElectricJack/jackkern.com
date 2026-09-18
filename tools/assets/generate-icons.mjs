/** Rasterize a site's editable favicon.svg. Requires npm ci in tools/assets.
 * Usage: node tools/assets/generate-icons.mjs [site-directory]
 * Apple icons are opaque; browser icons preserve the SVG's rounded corners.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const directory = resolve(process.argv[2] ?? '.');
const publicDir = join(directory, 'public');
const svg = await readFile(join(publicDir, 'favicon.svg'));
const manifest = JSON.parse(await readFile(join(publicDir, 'site.webmanifest'), 'utf8'));
const background = svg.toString().match(/<rect\b[^>]*fill="([^"]+)"/)?.[1];
if (!background) throw Error('Expected an opaque SVG background rectangle');
const raster = (size) => sharp(svg, { density: 384 }).resize(size, size);
for (const size of [16, 32, 192, 512]) {
  await raster(size).png().toFile(join(publicDir, `${size < 100 ? 'favicon' : 'icon'}-${size}.png`));
}
await raster(180).flatten({ background }).png().toFile(join(publicDir, 'apple-touch-icon.png'));

// ICO containers can embed PNG frames; keep both native browser-tab sizes.
const sizes = [16, 32];
const frames = await Promise.all(sizes.map(size => readFile(join(publicDir, `favicon-${size}.png`))));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(join(publicDir, 'favicon.ico'), Buffer.concat([header, ...frames]));
console.log(`Generated favicon, Apple and home-screen icons for ${manifest.short_name}`);
