/** npm ci --prefix tools/assets
 * node tools/assets/pack-column.mjs /path/to/Matter/export-master
 * Keeps the native export untouched. Only browser derivatives enter public/.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, meshopt, textureCompress, getBounds, listTextureSlots } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import validator from 'gltf-validator';

const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/assets/pack-column.mjs <Matter export folder>');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'public/assets/matter/column-doric');
const evidence = resolve(root, 'docs/design/matter-pilot-column/export');
await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const master = await readFile(resolve(source, 'asset.glb'));
const native = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sizes = (bytes) => ({ bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length,
  brotliBytes: brotliCompressSync(bytes).length, sha256: sha256(bytes) });
const report = {
  source: { directory: resolve(source), ...sizes(master), manifest: native },
  pipeline: { mesh: 'EXT_meshopt_compression, 16-bit positions/UVs, 14-bit normals; no simplification',
    color: 'WebP quality 92', data: 'lossless WebP after resize; exactly uniform maps reduced to 1 pixel',
    height: '16-bit master retained separately; POM not enabled',
    transfer: 'gzip/Brotli values are offline estimates, not measured HTTP transfer',
    textureMemory: 'RGBA8 including mipmaps estimate; WebP does not remain GPU-compressed' },
  variants: {},
};
const nativeValidation = await validator.validateBytes(master, { maxIssues: 100 });
await writeFile(resolve(evidence, 'master-validation.json'), JSON.stringify(nativeValidation, null, 2) + '\n');
if (nativeValidation.issues.numErrors || nativeValidation.issues.numWarnings) throw new Error('Native GLB validation failed');

for (const [tier, edge] of [['desktop', 2048], ['mobile', 1024]]) {
  const doc = await io.readBinary(master);
  const constantMaps = [];
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    const { channels } = await sharp(image).stats();
    if (channels.every((channel) => channel.min === channel.max)) {
      constantMaps.push({ slots: listTextureSlots(texture), values: channels.map((channel) => channel.min) });
      texture.setImage(await sharp(image).extract({ left: 0, top: 0, width: 1, height: 1 }).png().toBuffer());
    }
  }
  await doc.transform(
    weld(), dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, resize: [edge, edge], quality: 92, effort: 100 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!baseColorTexture$)/, resize: [edge, edge], lossless: true, effort: 100 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16, quantizeNormal: 14, quantizeTexcoord: 16 }),
  );
  const bytes = await io.writeBinary(doc);
  const validation = await validator.validateBytes(bytes, { maxIssues: 100 });
  await writeFile(resolve(evidence, `${tier}-validation.json`), JSON.stringify(validation, null, 2) + '\n');
  if (validation.issues.numErrors || validation.issues.numWarnings) throw new Error(`${tier} GLB validation failed`);
  // Decode the actual written file, checking compression and transforms together.
  const decoded = await io.readBinary(bytes);
  const scene = decoded.getRoot().getDefaultScene();
  const bounds = getBounds(scene);
  let triangles = 0, vertices = 0;
  for (const mesh of decoded.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    triangles += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
    vertices += prim.getAttribute('POSITION').getCount();
  }
  if (triangles !== native.triangles) throw new Error('Packing changed the triangle count');
  const expected = { min: [-0.5, 0, -0.5], max: [0.5, 4, 0.5] };
  for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(bounds[end][axis] - expected[end][axis]) > 0.0002) throw new Error('Packed column changed scale or origin');
  }
  const textures = decoded.getRoot().listTextures().map((texture) => ({
    size: texture.getSize(), slots: listTextureSlots(texture), bytes: texture.getImage().length,
  }));
  const file = `${tier}.glb`;
  report.variants[tier] = { file, ...sizes(bytes), bounds, triangles, vertices, textures, constantMaps,
    textureMemoryBytes: Math.ceil(textures.reduce((sum, t) => sum + t.size[0] * t.size[1] * 4 * 4 / 3, 0)),
    validation: { errors: validation.issues.numErrors, warnings: validation.issues.numWarnings } };
  await writeFile(resolve(output, file), bytes);
}
const publicReport = { ...report, source: { ...report.source, directory: undefined } };
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(publicReport, null, 2) + '\n');
await writeFile(resolve(evidence, 'packing-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
