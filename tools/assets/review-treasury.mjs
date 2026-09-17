import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {layout} from '../../layout/layout.js';
import {watch,problemCount} from '../console-probe.mjs';
const base=process.argv[2]??'http://192.168.1.69:8000',out='docs/design/gold-treasury';
const plan=layout(JSON.parse(await readFile('content/manifest.json')),JSON.parse(await readFile('kit/contract.json')));
await mkdir(`${out}/views`,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={base,backend:'Chromium SwiftShader, mobile viewport emulation',layoutHash:plan.hash,views:[]};
try{
 for(const [tier,viewport]of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),watcher=watch(page);
  for(const vp of [10,11]){
   await page.goto(`${base}/?capture=1&vp=${vp}&assetTier=${tier}`);
   await page.waitForFunction(v=>window.__villaReady===v,vp,{timeout:120000});
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).visibility==='hidden');
   const state=await page.evaluate(()=>({assets:window.__villaAssets(),render:window.__villaRenderStats(),travel:window.__villaTravel()}));
   for(const id of ['urn-large','gold-bar','gold-coin'])if(state.assets.loaded[id]!=='matter')throw Error(`Missing native ${id}`);
   const name=`${tier}-${plan.rail[vp].id}`;
   await page.screenshot({path:`${out}/views/${name}.png`});
   report.views.push({name,...state});console.log(name,state.render.calls,state.render.triangles);
  }
  watcher.stop();report[tier+'Problems']=watcher.found;
  if(problemCount(watcher.found)||watcher.found.warnings.length)throw Error(JSON.stringify(watcher.found));
  await page.close();
 }
 report.completed=true;
}finally{await writeFile(`${out}/browser-report.json`,JSON.stringify(report,null,2)+'\n');await browser.close()}
