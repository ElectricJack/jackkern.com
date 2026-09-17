/** Convert verified native ECS poses to the website's metre-scale bottom origins.
 * Usage: node tools/assets/assemble-treasury.mjs <Matter projects/world_demo>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]),dir='docs/design/gold-treasury';
registerHooks({resolve(spec,ctx,next){return next(spec.startsWith('shared-lib/')?pathToFileURL(`${root}/${spec}.js`).href:spec,ctx)}});
const {emitGold}=await import(pathToFileURL(`${root}/shared-lib/villa_gold_treasury.js`));
const geometry={};
for(const kind of ['bar','coin']){
 const vertices=[];
 emitGold({fill(){},beginShape(){},endShape(){},surfaceVertex(...v){vertices.push(v.slice(0,3))}},kind,8);
 geometry[kind]=vertices;
}
const before=JSON.parse(await readFile(`${dir}/before.json`));
const after=JSON.parse(await readFile(`${dir}/settled-final.json`));
const check=JSON.parse(await readFile(`${dir}/settle-check.json`));
if(!check.settled)throw Error('Native simulation has not settled');
const poses=[],corrections=[];
let moved=0,minY=Infinity,maxY=-Infinity,maxRadius=0;
for(let i=0;i<after.length;i++){
 const result=after[i].result,kind=result.name.value.split('-')[0],m=result.placement.world_matrix;
 if(m.some((x,j)=>Math.abs(x-before[i].result.placement.world_matrix[j])>1e-5))moved++;
 let floor=Infinity;
 for(const p of geometry[kind]){
  const pos=[0,1,2].map(row=>(m[row*4]*p[0]+m[row*4+1]*p[1]+m[row*4+2]*p[2]+m[row*4+3])/10);
  floor=Math.min(floor,pos[1]);maxY=Math.max(maxY,pos[1]);maxRadius=Math.max(maxRadius,Math.hypot(pos[0],pos[2]));
 }
 minY=Math.min(minY,floor);
 // Rounded render coins exceed their 16-sided collision proxies at grazing
 // angles. Seat only penetrating floor contacts (at most 8 mm), retaining the
 // native orientation and x/z; never lift the entire pile above the floor.
 const correction=Math.max(0,-floor);
 if(correction>.008)throw Error('Native floor penetration exceeds cleanup tolerance');
 if(correction>0)corrections.push({name:result.name.value,up:correction});
 const origin=kind==='bar'?.08:.014;
 for(let row=0;row<3;row++)m[row*4+3]=m[row*4+3]/10-m[row*4+1]*origin+(row===1?correction:0);
 poses.push([kind,...Array.from({length:16},(_,j)=>Number(m[(j%4)*4+Math.floor(j/4)].toFixed(6)))]);
}
if(moved!==128||maxY>.9||maxRadius>1.8)throw Error('Native pile geometry check failed');
await writeFile('layout/treasury-poses.js','// Native MatterEditor r2 / Box3D result; see docs/design/gold-treasury.\n// Columns: kind, column-major local-to-vase matrix. Metres, bottom origins.\nexport const treasuryPoses = '+JSON.stringify(poses)+';\n');
Object.assign(check,{movedBodies:moved,nativeMinFloorY:minY,maxTopY:maxY,maxRadius,floorContactCorrections:corrections});
await writeFile(`${dir}/settle-check.json`,JSON.stringify(check,null,2)+'\n');
console.log({moved,maxY,maxRadius,correctedFloorContacts:corrections.length});
