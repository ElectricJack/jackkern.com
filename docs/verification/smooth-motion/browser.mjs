import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('tmp/motion-review', {recursive:true});
const base=process.env.VILLA_URL || 'http://127.0.0.1:4321';
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base + '/?view=scene');
 await page.waitForFunction(()=>window.__villaReady===0);
 await page.waitForTimeout(500);
 await page.evaluate(()=>{
  window.motionSamples=[];window.sampleMotion=true;
  const tick=t=>{if(!window.sampleMotion)return;window.motionSamples.push({t,...window.__villaTravel()});requestAnimationFrame(tick);};requestAnimationFrame(tick);
  window.travelInput=setInterval(()=>document.querySelector('#villa').dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true})),100);
 });
 await page.waitForFunction(()=>window.__villaTravel().u===1,null,{timeout:120000});
 await page.evaluate(()=>clearInterval(window.travelInput));
 const forward=await page.evaluate(()=>window.motionSamples);
 const order=[...new Set(forward.map(s=>s.viewpoint))];
 assert.deepEqual(order,Array.from({length:14},(_,i)=>i));
 assert.ok(forward.every((s,i)=>!i||s.u>=forward[i-1].u));
 assert.ok(forward.every(s=>s.speed<=4+1e-9));
 await page.screenshot({path:'tmp/motion-review/terrace.png'});
 await page.evaluate(()=>{
  window.motionSamples=[];
  window.travelInput=setInterval(()=>document.querySelector('#villa').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true})),100);
 });
 await page.waitForFunction(()=>window.__villaTravel().u===0,null,{timeout:120000});
 await page.evaluate(()=>{clearInterval(window.travelInput);window.sampleMotion=false;});
 const reverse=await page.evaluate(()=>window.motionSamples);
 assert.deepEqual([...new Set(reverse.map(s=>s.viewpoint))],Array.from({length:14},(_,i)=>13-i));
 assert.ok(reverse.every((s,i)=>!i||s.u<=reverse[i-1].u));
 assert.ok(reverse.every(s=>s.speed>=-4-1e-9));
 assert.deepEqual(errors,[]);
 writeFileSync('tmp/motion-review/browser-results.json',JSON.stringify({forwardFrames:forward.length,reverseFrames:reverse.length,order,forwardSeconds:(forward.at(-1).t-forward[0].t)/1000,reverseSeconds:(reverse.at(-1).t-reverse[0].t)/1000,errors},null,2));
 console.log('PASS complete forward/reverse wheel route; every viewpoint in order; bounded speeds; no reversals or page errors');
}finally{await browser.close();}
