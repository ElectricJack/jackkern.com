/** Rebuild mobile LODs from checked-in desktop exports. Native masters remain untouched. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, meshopt, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import validator from 'gltf-validator';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const manifest = JSON.parse(await readFile('kit/matter-assets.json', 'utf8'));
const report = [];
for (const id of ['column-doric', 'olive-small', 'fountain-tiered', 'entablature-3m']) {
  const entry = manifest.parts[id];
  const doc = await io.read(`public${entry.desktop.url}`);
  await doc.transform(weld(), dedup(), simplify({ simplifier: MeshoptSimplifier, ratio: .45, error: .001, lockBorder: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [id === 'column-doric' ? 512 : 256, id === 'column-doric' ? 512 : 256], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeTexcoord: 16 }));
  const bytes = await io.writeBinary(doc);
  const validation = await validator.validateBytes(bytes, { maxIssues: 100 });
  if (validation.issues.numErrors || validation.issues.numWarnings) throw Error(`${id}: invalid optimized GLB`);
  const decoded = await io.readBinary(bytes), bounds = getBounds(decoded.getRoot().getDefaultScene());
  for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(bounds[end][axis] - entry.bounds[end][axis]) > .001) throw Error(`${id}: LOD changed kit bounds`);
  }
  const triangles = decoded.getRoot().listMeshes().reduce((total, mesh) => total + mesh.listPrimitives().reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0), 0);
  const textureMemoryBytes = Math.ceil(decoded.getRoot().listTextures().reduce((sum, t) => { const [w,h] = t.getSize(); return sum + w*h*4*4/3; }, 0));
  report.push({ id, before: { triangles: entry.triangles, bytes: entry.mobile.bytes, textureMemoryBytes: entry.mobile.textureMemoryBytes }, after: { triangles, bytes: bytes.length, textureMemoryBytes } });
  await writeFile(`public${entry.mobile.url}`, bytes);
  Object.assign(entry.mobile, { triangles, bytes: bytes.length, textureMemoryBytes, sha256: createHash('sha256').update(bytes).digest('hex') });
  const metadataPath = `public/assets/matter/${id}/manifest.json`;
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  metadata.geometryPolicy = 'Desktop: original Meshopt export. Mobile: simplified LOD, error <= 0.001, locked borders, verified kit bounds.';
  metadata.texturePolicy = 'Desktop: original export. Mobile: WebP quality 82, maximum 512px columns / 256px other assets.';
  metadata.variants.mobile = { ...entry.mobile, validation: validation.issues };
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
}
await writeFile('kit/matter-assets.json', JSON.stringify(manifest, null, 2) + '\n');
await writeFile('public/assets/matter/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
