import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {layout} from '../../layout/layout.js';
import {watch,problemCount} from '../console-probe.mjs';
const base=process.argv[2]||'http://127.0.0.1:4322';
const contract=JSON.parse(await readFile('kit/contract.json','utf8')),content=JSON.parse(await readFile('content/manifest.json','utf8'));
const evidence=process.argv[3]||'docs/design/matter-kit';
const plan=layout(content,contract),output=`${evidence}/views`;await mkdir(output,{recursive:true});
const report={backend:'Chromium SwiftShader; mobile viewport emulation',layoutHash:plan.hash,placements:plan.placements.length,parts:[...new Set(plan.placements.map(p=>p.part))],views:[]};
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const [tier,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});
  for(let vp=0;vp<plan.rail.length;vp++){
   const watcher=watch(page);
   await page.goto(`${base}/?vp=${vp}&capture=1`);await page.waitForFunction(v=>window.__villaReady===v,vp,{timeout:120000});
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).visibility==='hidden');
   const state=await page.evaluate(()=>({assets:window.__villaAssets(),render:window.__villaRenderStats(),travel:window.__villaTravel(),requests:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.glb')).map(r=>({url:r.name,bytes:r.encodedBodySize,transferBytes:r.transferSize}))}));
   const name=`${tier}-${plan.rail[vp].id}`;
   await page.screenshot({path:`${output}/${name}.png`});watcher.stop();
   const failed=Object.entries(state.assets.loaded).filter(([,value])=>value!=='matter');
   report.views.push({name,...state,problems:watcher.found});
   await writeFile(`${evidence}/browser-report.json`,JSON.stringify(report,null,2)+'\n');
   console.log(name,`parts ${Object.keys(state.assets.loaded).length}`,`bytes ${state.requests.reduce((s,r)=>s+r.bytes,0)}`);
   if(problemCount(watcher.found)||watcher.found.warnings.length||failed.length)throw Error(JSON.stringify({name,problems:watcher.found,failed}));
  }
  await page.close();
 }
 const loaded=new Set(report.views.flatMap(v=>Object.keys(v.assets.loaded)));
 if(report.parts.some(id=>!loaded.has(id)))throw Error('A placed part was never loaded in the tour');
 console.log('All',report.parts.length,'placed asset types rendered across desktop and mobile viewpoints');
}finally{await browser.close()}
