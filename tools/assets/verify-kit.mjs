/** Browser behavior checks on the assembled kit, including a deliberate asset failure.
 * node tools/assets/verify-kit.mjs [http://127.0.0.1:4321]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { watch, problemCount } from '../console-probe.mjs';
const base=process.argv[2]??'http://127.0.0.1:4321';
const output=process.argv[3]??'docs/design/matter-kit';await mkdir(output,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={backend:'Chromium SwiftShader; behavior checks, not physical device performance'};
const ready=async page=>{await page.waitForFunction(()=>window.__villaReady!==undefined,null,{timeout:120000});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).visibility==='hidden');};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),watcher=watch(page);
 await page.goto(`${base}/?capture=1&vp=2`);await ready(page);
 const before=PNG.sync.read(await page.screenshot());
 const loss=await page.evaluate(async()=>{
  const canvas=document.querySelector('#villa'),app=document.querySelector('#app');
  const ext=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
  if(!ext)throw Error('Missing context loss extension');
  const event=type=>new Promise(r=>canvas.addEventListener(type,r,{once:true}));
  let pending=event('webglcontextlost');ext.loseContext();await pending;
  await new Promise(r=>requestAnimationFrame(r));const during=app.dataset.mode;
  pending=event('webglcontextrestored');ext.restoreContext();await pending;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return {during,after:app.dataset.mode};
 });
 const after=PNG.sync.read(await page.screenshot({path:`${output}/restored-context.png`}));
 const diff=pixelmatch(before.data,after.data,null,before.width,before.height,{threshold:.1});
 report.context={...loss,changedPixels:diff,totalPixels:before.width*before.height,changedRatio:diff/(before.width*before.height)};
 watcher.found.warnings=watcher.found.warnings.filter(x=>!x.startsWith('villa: WebGL context lost'));
 report.context.problems=watcher.found;watcher.stop();
 await writeFile(`${output}/behavior-report.json`,JSON.stringify(report,null,2)+'\n');
 if(loss.during!=='static'||loss.after!=='scene'||report.context.changedRatio>.005||problemCount(watcher.found)||watcher.found.warnings.length)throw Error('Context restoration changed appearance or reported errors');
 await page.goto(`${base}/?capture=1`);await ready(page);
 await page.locator('#next-space').click();
 await page.waitForFunction(()=>window.__villaTravel().u>.003,null,{timeout:120000});
 const start=await page.evaluate(()=>window.__villaTravel());
 await page.waitForFunction(u=>window.__villaTravel().u>u+.003,start.u,{timeout:120000});
 const end=await page.evaluate(()=>window.__villaTravel());
 report.cruise={start,end};if(end.mode!=='flight'||end.metres<=start.metres)throw Error('Cruising stopped');
 await page.close();
 const broken=await browser.newPage();await broken.route('**/column-doric/desktop.glb',r=>r.fulfill({status:404,body:'Deliberate missing-asset test'}));
 await broken.goto(`${base}/?capture=1&assetTier=desktop`);await ready(broken);
 report.fallback=await broken.evaluate(()=>({mode:document.querySelector('#app').dataset.mode,assets:window.__villaAssets()}));
 if(report.fallback.mode!=='scene'||report.fallback.assets.loaded['column-doric']!=='fallback')throw Error('Missing export did not fall back');
 await broken.close();
 const plain=await browser.newPage();await plain.goto(`${base}/?view=list`);await plain.waitForFunction(()=>document.querySelector('#app').dataset.mode==='static');
 report.static=await plain.evaluate(()=>({mode:document.querySelector('#app').dataset.mode,glbRequests:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.glb')).length}));
 if(report.static.glbRequests)throw Error('Static reading mode loaded 3D assets');await plain.close();
 console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${output}/behavior-report.json`,JSON.stringify(report,null,2)+'\n');await browser.close()}
