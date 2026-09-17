/** Exercise real wheel/touch input, reading pauses and Continue in the production page. */
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {layout} from '../layout/layout.js';
import {watch,problemCount} from './console-probe.mjs';
const base=process.argv[2]??'http://127.0.0.1:4321';
const output=process.argv[3]??'docs/verification/project-pauses';
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile('content/manifest.json')),contract=JSON.parse(await readFile('kit/contract.json'));
const plan=layout(manifest,contract),projects=manifest.stops.filter(s=>s.kind==='project');
const reading=projects.map(p=>({id:p.id,index:plan.rail.findLastIndex(v=>v.stop===p.id)}));
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={base,backend:'Chromium SwiftShader, mobile viewport emulation; greybox geometry and half-resolution rendering for input/behavior checks',layoutHash:plan.hash,stops:[]};
const ready=async page=>{
 await page.waitForFunction(()=>window.__villaReady!==undefined,null,{timeout:120000});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).visibility==='hidden');
};
const state=page=>page.evaluate(()=>window.__villaTravel());
try{
 for(const [tier,viewport] of [['desktop',{width:1024,height:640}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport,deviceScaleFactor:.5}),watcher=watch(page);
  for(const stop of tier==='desktop'?reading:reading.slice(0,1)){
   await page.goto(`${base}/?capture=1&assets=greybox&assetTier=${tier}&vp=${stop.index}`);await ready(page);
   const target=(await state(page)).u;
   await page.goto(`${base}/?capture=1&assets=greybox&assetTier=${tier}&u=${target-.004}`);await ready(page);
   if(tier==='desktop'){await page.mouse.move(350,100);await page.mouse.wheel(0,-200)}
   else await page.evaluate(()=>{
    const app=document.querySelector('#app');
    for(const [type,y]of [['touchstart',300],['touchmove',500],['touchend',500]]){
     const event=new Event(type,{cancelable:true});Object.defineProperty(event,'touches',{value:type==='touchend'?[]:[{clientY:y}]});app.dispatchEvent(event);
    }
   });
   await page.waitForFunction(()=>window.__villaTravel().mode==='flight',null,{timeout:30000});
   await page.waitForFunction(u=>{const t=window.__villaTravel();return t.mode==='paused'&&Math.abs(t.u-u)<1e-8},target,{timeout:120000});
   const arrived=await state(page);console.log(tier,stop.id,'arrived');
   await page.waitForTimeout(750);const held=await state(page);
   const pane=await page.locator(`#panels .panel[data-stop="${stop.id}"]`).evaluate(el=>({hidden:el.hidden,inert:el.inert,opacity:el.style.getPropertyValue('--pane-opacity')}));
   const action=await page.locator('#next-space').innerText();
   if(arrived.speed!==0||arrived.acceleration!==0||arrived.jerk!==0||JSON.stringify(arrived)!==JSON.stringify(held)||pane.hidden||pane.inert||pane.opacity!=='1.000'||!action.includes('Continue'))throw Error('Reading pause is not stationary/readable');
   await page.screenshot({path:`${output}/${tier}-${stop.id}.png`});
   await page.locator('#next-space').click();
   await page.waitForFunction(u=>window.__villaTravel().u>u+1e-5,target,{timeout:60000});
   report.stops.push({tier,project:stop.id,arrived,pane,action,continued:await state(page)});
   await writeFile(`${output}/browser-report.json`,JSON.stringify(report,null,2)+'\n');
   console.log(tier,stop.id,'pauses, holds and continues');
  }
  watcher.stop();report[tier+'Problems']=watcher.found;
  if(problemCount(watcher.found)||watcher.found.warnings.length)throw Error(JSON.stringify(watcher.found));
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1024,height:640},deviceScaleFactor:.5}),watcher=watch(page);
 await page.goto(`${base}/?capture=1&assets=greybox&assetTier=desktop&vp=${reading[0].index}`);await ready(page);
 await page.locator('#next-space').click();
 const samples=[];
 for(const [name,speed,pixels]of [['default',1.44,null],['fast',2.592,200],['slow',.72,20]]){
  if(pixels!==null){await page.mouse.move(350,100);await page.mouse.wheel(0,-pixels)}
  await page.waitForFunction(speed=>Math.abs(window.__villaTravel().speed-speed)<1e-6,speed,{timeout:120000});
  const selected=await state(page);await page.waitForTimeout(600);const sustained=await state(page);
  if(Math.abs(sustained.speed-speed)>1e-6)throw Error('Selected pace did not persist');
  samples.push({name,selected,sustained});console.log(name,'pace',sustained.speed);
 }
 report.pace=samples;
 await page.mouse.wheel(0,100);
 await page.waitForFunction(()=>window.__villaTravel().speed<-.1,null,{timeout:120000});
 report.reverseWheel=await state(page);console.log('page-down wheel reverses the camera');
 watcher.stop();report.paceProblems=watcher.found;
 if(problemCount(watcher.found)||watcher.found.warnings.length)throw Error(JSON.stringify(watcher.found));
 await page.close();report.completed=true;
}finally{await writeFile(`${output}/browser-report.json`,JSON.stringify(report,null,2)+'\n');await browser.close()}
