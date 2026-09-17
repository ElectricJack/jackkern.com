/** npm ci --prefix tools/assets; node tools/assets/pack-kit.mjs <native masters folder> [column master folder]
 * Native OBJ/GLB/PBR/height masters are immutable inputs. */
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

const masters = process.argv[2];
if (!masters) throw new Error('Pass the native kit masters directory');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = resolve(root, 'docs/design/matter-kit');
await mkdir(evidence, { recursive: true });
const catalog = JSON.parse(await readFile(resolve(root, 'tools/assets/kit-catalog.json'), 'utf8'));
if (process.argv[3]) catalog.unshift({ id: 'column-doric', module: 'VillaDoricColumnPilot', triangles: 8680,
  bounds: { min: [-0.5, 0, -0.5], max: [0.5, 4, 0.5] }, masterDirectory: resolve(process.argv[3]) });
const existing = JSON.parse(await readFile(resolve(root, 'kit/matter-assets.json'), 'utf8'));
const manifest = { version: 1, parts: { 'column-doric': existing.parts['column-doric'] } };
const report = { source: resolve(masters), geometryPolicy: 'Meshopt high; 16-bit positions/UVs, 8-bit filtered normals/tangents; no simplification', texturePolicy: 'WebP 92 color, lossless data after resize; exactly constant maps are 1 pixel', parts: {} };
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const size = (bytes) => ({ bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length,
  brotliBytes: brotliCompressSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') });
const focal = new Set(['statue-a', 'statue-b', 'relief-a', 'urn-large', 'fountain-wall']);

for (const entry of catalog) {
  const directory = entry.masterDirectory ?? resolve(masters, entry.id), master = await readFile(resolve(directory, 'asset.glb'));
  const native = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (native.triangles !== entry.triangles) throw new Error(`${entry.id}: native triangle count changed`);
  const validation = await validator.validateBytes(master, { maxIssues: 100 });
  if (validation.issues.numErrors || validation.issues.numWarnings) throw new Error(`${entry.id}: native GLB invalid`);
  const output = resolve(root, 'public/assets/matter', entry.id);
  await mkdir(output, { recursive: true });
  const row = { module: entry.module, sourceDirectory: directory, sourceHash: native.source_hash, native: size(master), bounds: entry.bounds,
    triangles: native.triangles, nativeValidation: validation.issues, variants: {} };
  for (const tier of ['desktop', 'mobile']) {
    const doc = await io.readBinary(master);
    const column = entry.id === 'column-doric';
    const edge = column ? (tier === 'desktop' ? 2048 : 1024)
      : tier === 'desktop' ? (focal.has(entry.id) ? 768 : 512) : (focal.has(entry.id) ? 384 : 256);
    for (const texture of doc.getRoot().listTextures()) {
      const image = texture.getImage(), { channels } = await sharp(image).stats();
      if (channels.every((channel) => channel.min === channel.max)) {
        texture.setImage(await sharp(image).extract({ left: 0, top: 0, width: 1, height: 1 }).png().toBuffer());
      }
    }
    await doc.transform(
      weld(), dedup(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, resize: [edge, edge], quality: 92, effort: 100 }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!baseColorTexture$)/, resize: [column ? edge : Math.min(edge, 512), column ? edge : Math.min(edge, 512)], lossless: true, effort: 100 }),
      meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeTexcoord: 16 }),
    );
    const bytes = await io.writeBinary(doc);
    const checked = await validator.validateBytes(bytes, { maxIssues: 100 });
    if (checked.issues.numErrors || checked.issues.numWarnings) throw new Error(`${entry.id}/${tier}: packed GLB invalid`);
    const decoded = await io.readBinary(bytes), bounds = getBounds(decoded.getRoot().getDefaultScene());
    let triangles = 0, geometryBytes = 0;
    for (const accessor of decoded.getRoot().listAccessors()) geometryBytes += accessor.getArray().byteLength;
    for (const mesh of decoded.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) triangles += prim.getIndices().getCount() / 3;
    if (triangles !== native.triangles) throw new Error(`${entry.id}: packing removed triangles`);
    for (const end of ['min', 'max']) for (let i = 0; i < 3; i++) {
      if (Math.abs(bounds[end][i] - entry.bounds[end][i]) > 0.001) throw new Error(`${entry.id}: bounds mismatch`);
    }
    const textures = decoded.getRoot().listTextures().map((t) => ({ size: t.getSize(), slots: listTextureSlots(t), bytes: t.getImage().length }));
    const info = size(bytes);
    row.variants[tier] = { ...info, geometryBytes, textures,
      textureMemoryBytes: Math.ceil(textures.reduce((sum, t) => sum + t.size[0] * t.size[1] * 4 * 4 / 3, 0)),
      validation: checked.issues };
    await writeFile(resolve(output, `${tier}.glb`), bytes);
  }
  manifest.parts[entry.id] = { bounds: entry.bounds, triangles: entry.triangles,
    ...Object.fromEntries(['desktop', 'mobile'].map((tier) => [tier, {
      url: `/assets/matter/${entry.id}/${tier}.glb`, bytes: row.variants[tier].bytes,
      sha256: row.variants[tier].sha256, textureMemoryBytes: row.variants[tier].textureMemoryBytes,
    }])) };
  report.parts[entry.id] = row;
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ id: entry.id, bounds: row.bounds,
    triangles: row.triangles, geometryPolicy: report.geometryPolicy, texturePolicy: report.texturePolicy,
    variants: row.variants }, null, 2) + '\n');
  console.log(`${entry.id}: ${entry.triangles} triangles; desktop ${row.variants.desktop.bytes} B / mobile ${row.variants.mobile.bytes} B`);
  await writeFile(resolve(evidence, 'packing-report.json'), JSON.stringify(report, null, 2) + '\n');
}
await writeFile(resolve(root, 'kit/matter-assets.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(root, 'public/assets/matter/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Packed', Object.keys(manifest.parts).length, 'assets including approved column');
