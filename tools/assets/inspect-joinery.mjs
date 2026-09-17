import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.argv[2]??'http://localhost:4322',output=process.argv[3]??'docs/design/joinery-cleanup';
await mkdir(`${output}/details`,{recursive:true});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text())});
try{
 await page.goto(`${base}/tools/assets/review-joinery.html`);await page.waitForFunction(()=>window.reviewReady,null,{timeout:120000});
 const views=[
 {name:'entry-platform',eye:[9,4,-6],target:[0,1.4,2]},
 {name:'column-beam',eye:[7,4.7,1.2],target:[4.5,3.8,3]},
 {name:'door-front',eye:[2,2.7,5.4],target:[0,2,9],stop:'matter-engine'},
 {name:'door-reveal',eye:[.2,1.8,8.3],target:[-.7,2.6,9],stop:'matter-engine'},
 {name:'wall-corner',eye:[7,2.7,6],target:[4.5,1.9,9],stop:'matter-engine'},
 {name:'pool-edge',eye:[2.3,1.1,22],target:[0,.2,22.5],stop:'cy-1'},
 {name:'lower-transition',eye:[-17,3,39],target:[-20,1,42],stop:'quilt-trader'}
 ];
 const report=[];
 for(const view of views){const state=await page.evaluate(v=>window.reviewJoinery(v),view);await page.screenshot({path:`${output}/details/${view.name}.png`});report.push({view,state});console.log(view.name)}
 for(const name of ['column-beam','door-front','door-reveal','pool-edge'])for(const shift of [-.18,.18]){
  const original=views.find(v=>v.name===name),view={...original,eye:original.eye.map((v,i)=>v+(i===0?shift:0))};
  const state=await page.evaluate(v=>window.reviewJoinery(v),view);
  await page.screenshot({path:`${output}/details/${name}-${shift<0?'left':'right'}.png`});report.push({view,state});
 }
 await writeFile(`${output}/detail-report.json`,JSON.stringify({errors,report},null,2));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close()}
