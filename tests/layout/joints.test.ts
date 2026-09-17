import {Box3,Matrix4,Vector3} from 'three';
import contract from '../../kit/contract.json';
import assets from '../../kit/matter-assets.json';
import manifest from '../../content/manifest.json';
import {layout} from '../../layout/layout.js';

test('exported column capitals and bases do not penetrate room walls or doorway frames',()=>{
 const plan=layout(manifest,contract);
 const boxes=plan.placements.map(p=>({p,box:new Box3(new Vector3(...(assets.parts as any)[p.part].bounds.min),new Vector3(...(assets.parts as any)[p.part].bounds.max)).applyMatrix4(new Matrix4().fromArray(p.transform))}));
 const walls=boxes.filter(x=>['wall-3m','wall-3m-doorway'].includes(x.p.part));
 const penetrations=[];
 for(const column of boxes.filter(x=>x.p.part==='column-doric'))for(const wall of walls){
  const size=column.box.clone().intersect(wall.box).getSize(new Vector3());
  if(Math.min(size.x,size.y,size.z)>.002)penetrations.push(`${column.p.instance} / ${wall.p.instance}`);
 }
 expect(penetrations).toEqual([]);
});

test('shared colonnades contain one column per position and one beam per axis',()=>{
 const plan=layout(manifest,contract),keys=plan.placements.filter(p=>['column-doric','entablature-3m'].includes(p.part)).map(p=>`${p.part}:${p.transform.slice(12,15)}:${p.part==='entablature-3m'?Math.abs(p.transform[0]):0}`);
 expect(new Set(keys).size).toBe(keys.length);
});
