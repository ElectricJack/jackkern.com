/** Native Matter exports -> shared, losslessly shaped web meshes. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, meshopt, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import validator from 'gltf-validator';

const masters=process.argv[2];
if(!masters)throw Error('Pass the native treasury masters directory');
const evidence='docs/design/gold-treasury';
await mkdir(evidence,{recursive:true});
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const manifest=JSON.parse(await readFile('kit/matter-assets.json'));
const report={masters:resolve(masters),scale:.1,policy:'Native geometry, no simplification; Meshopt high, 16-bit positions/UVs. Uniform PBR maps reduced to exact 1-pixel maps.',parts:{}};
for(const [id,originY]of [['urn-large',0],['gold-bar',.08],['gold-coin',.014]]){
 const source=await readFile(`${masters}/${id}/asset.glb`),native=JSON.parse(await readFile(`${masters}/${id}/manifest.json`));
 const original=await validator.validateBytes(source,{maxIssues:100});
 if(original.issues.numErrors||original.issues.numWarnings)throw Error(`${id}: invalid master`);
 const doc=await io.readBinary(source);
 for(const node of doc.getRoot().getDefaultScene().listChildren()){
  node.setScale(node.getScale().map(x=>x*.1));
  node.setTranslation(node.getTranslation().map((x,i)=>x*.1+(i===1?originY:0)));
 }
 const expectedBounds=getBounds(doc.getRoot().getDefaultScene());
 for(const texture of doc.getRoot().listTextures()){
  const image=texture.getImage(),{channels}=await sharp(image).stats();
  if(channels.every(c=>c.min===c.max))texture.setImage(await sharp(image).extract({left:0,top:0,width:1,height:1}).png().toBuffer());
 }
 await doc.transform(weld(),dedup(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[256,256],lossless:true}),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeTexcoord:16}));
 const bytes=await io.writeBinary(doc),check=await validator.validateBytes(bytes,{maxIssues:100});
 if(check.issues.numErrors||check.issues.numWarnings)throw Error(`${id}: invalid packed GLB`);
 const decoded=await io.readBinary(bytes),bounds=getBounds(decoded.getRoot().getDefaultScene());
 for(const end of ['min','max'])for(let i=0;i<3;i++)if(!Number.isFinite(bounds[end][i])||Math.abs(bounds[end][i]-expectedBounds[end][i])>.0001)throw Error(`${id}: packing changed bounds`);
 const triangles=decoded.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0);
 if(triangles!==native.triangles)throw Error(`${id}: triangles changed`);
 const textures=decoded.getRoot().listTextures().map(t=>({size:t.getSize(),bytes:t.getImage().length}));
 const info={url:`/assets/matter/${id}/desktop.glb`,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),textureMemoryBytes:Math.ceil(textures.reduce((n,t)=>n+t.size[0]*t.size[1]*16/3,0))};
 manifest.parts[id]={bounds,triangles,desktop:info,mobile:{...info,url:`/assets/matter/${id}/mobile.glb`}};
 const row={bounds,triangles,sourceHash:native.source_hash,nativeBytes:source.length,packedBytes:bytes.length,gzipBytes:gzipSync(bytes).length,brotliBytes:brotliCompressSync(bytes).length,textures,validation:check.issues};
 report.parts[id]=row;
 await mkdir(`public/assets/matter/${id}`,{recursive:true});
 for(const tier of ['desktop','mobile'])await writeFile(`public/assets/matter/${id}/${tier}.glb`,bytes);
 await writeFile(`public/assets/matter/${id}/manifest.json`,JSON.stringify(row,null,2)+'\n');
 console.log(id,row);
}
for(const path of ['kit/matter-assets.json','public/assets/matter/manifest.json'])await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
await writeFile(`${evidence}/packing-report.json`,JSON.stringify(report,null,2)+'\n');
