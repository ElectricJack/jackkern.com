/** Sample actual asset compositions between all adjacent rail landmarks. */
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {layout} from '../../layout/layout.js';
import {watch,problemCount} from '../console-probe.mjs';
const base=process.argv[2]??'http://127.0.0.1:4322';
const plan=layout(JSON.parse(await readFile('content/manifest.json')),JSON.parse(await readFile('kit/contract.json')));
const evidence=process.argv[3]??'docs/design/matter-kit';
const output=`${evidence}/flight`;await mkdir(output,{recursive:true});
const report=[];
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}});
 // Reuse the landmark review's physical-distance coordinates instead of
 // fetching those same 14 compositions again.
 const landmarks=JSON.parse(await readFile(`${evidence}/browser-report.json`));
 if(landmarks.layoutHash!==plan.hash)throw Error('Run review-kit for the current layout first');
 const points=plan.rail.map(v=>landmarks.views.find(x=>x.name===`desktop-${v.id}`).travel.u);
 for(let i=0;i<points.length-1;i++){
  const u=(points[i]+points[i+1])/2,watcher=watch(page);
  await page.goto(`${base}/?capture=1&u=${u}`);await page.waitForFunction(()=>window.__villaReady!==undefined,null,{timeout:120000});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).visibility==='hidden');
  const state=await page.evaluate(()=>({assets:window.__villaAssets(),travel:window.__villaTravel(),render:window.__villaRenderStats()}));
  await page.screenshot({path:`${output}/${String(i).padStart(2,'0')}.png`});watcher.stop();
  report.push({from:plan.rail[i].id,to:plan.rail[i+1].id,...state,problems:watcher.found});
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
  if(problemCount(watcher.found)||watcher.found.warnings.length||Object.values(state.assets.loaded).some(v=>v!=='matter'))throw Error('Mid-flight load failure');
  console.log(i,plan.rail[i].id,'→',plan.rail[i+1].id);
 }
}finally{await browser.close()}
