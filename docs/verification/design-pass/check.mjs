import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.VILLA_URL || 'http://127.0.0.1:4321';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const page = await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.draws = 0;
  for (const context of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const draw = context.prototype.drawElements;
    context.prototype.drawElements = function (...args) { window.draws++; return draw.apply(this, args); };
  }
});
async function scene(path = '/') {
  await page.goto(base + path);
  await page.waitForFunction(() => window.__villaReady !== undefined);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#loading')).visibility === 'hidden');
}
try {
  await scene('/?vp=2');
  await page.waitForTimeout(500);
  const draws = await page.evaluate(() => window.draws);
  await page.waitForTimeout(500);
  assert.ok(draws > 0);
  assert.equal(await page.evaluate(() => window.draws), draws, 'idle scene keeps redrawing');
  console.log('PASS no WebGL draws while idle');
  assert.equal(await page.locator('#panels .panel:visible').count(), 1);
  await page.locator('#panels .panel:visible summary').click();
  const before = await page.evaluate(() => window.__villaTravel().u);
  await page.locator('#panels .panel:visible .details-body').hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__villaTravel().u), before, 'reading moves camera');
  await page.locator('#index-toggle').click();
  assert.equal(await page.locator('dialog[open]').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'index-toggle');
  await page.locator('#index-toggle').click();
  await page.locator('#project-dialog [data-project="quilt-trader"]').click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__villaTravel().mode), 'visit');
  await page.mouse.move(1100, 350);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => window.__villaTravel().mode === 'flight', null, {timeout:10000});
  await page.locator('#index-toggle').click();
  await page.locator('#project-dialog [data-project="quilt-trader"]').click();
  await page.waitForFunction(() => window.__villaTravel().mode === 'paused', null, {timeout:120000});
  assert.equal(await page.locator('#panels .panel:visible').getAttribute('data-stop'), 'quilt-trader');
  assert.match(await page.locator('#panels .panel:visible').innerText(), /Trading research you can trace/);
  console.log('PASS desktop cards, expanded scrolling, dialog keyboard focus, project navigation, glide interruption');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#app').getAttribute('data-mode'), 'static');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'fallback');
  console.log('PASS skip link reaches complete static document');
  const mobile = await browser.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(base + '/?vp=2');
  await mobile.waitForFunction(() => window.__villaReady !== undefined);
  const mobileBefore = await mobile.evaluate(() => window.__villaTravel().u);
  const client = await mobile.context().newCDPSession(mobile);
  await client.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:280,y:350}]});
  for (let y=330;y>=210;y-=20) {
    await client.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:280,y}]});
    await mobile.waitForTimeout(20);
  }
  await client.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
  await mobile.waitForTimeout(250);
  assert.ok(await mobile.evaluate((u) => window.__villaTravel().u > u, mobileBefore));
  assert.ok(await mobile.evaluate(() => document.body.scrollWidth <= innerWidth));
  console.log('PASS mobile touch travel and horizontal layout');
  await mobile.goto(base + '/?view=list');
  await mobile.waitForFunction(() => document.querySelector('#app').dataset.mode === 'static');
  await mobile.locator('#work-index [data-project="quilt-trader"]').click();
  assert.match(mobile.url(), /#project-quilt-trader$/);
  assert.equal(await mobile.locator('#fallback > .panel').count(), 4);
  console.log('PASS mobile document and project links');
  await mobile.close();
  for (const options of [{reducedMotion:'reduce'}, {javaScriptEnabled:false}]) {
    const simple = await browser.newPage(options);
    await simple.goto(base);
    await simple.locator('#fallback').waitFor({state:'visible'});
    assert.equal(await simple.locator('#fallback > .panel').count(), 4);
    await simple.close();
  }
  console.log('PASS reduced-motion and JavaScript-disabled complete content');
  assert.deepEqual(errors, []);
  console.log('PASS no browser exceptions');
} finally { await browser.close(); }
