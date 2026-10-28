import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),checks=[];
try{
 for(const reduced of [false,true])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5213/dev/six-card-golf/smoke-animation-preview.html');await page.getByRole('button').click();
  if(!reduced){await page.locator('[data-sweep-the-legs-overlay]').waitFor();assert.equal(await page.locator('[data-leg-sweep-flight]').count(),2);assert.equal(await page.locator('[data-golf-total="a"]').textContent(),'25');}
  await page.locator('[data-fixture-receipts][data-done="true"]').waitFor();assert.equal(await page.locator('[data-sweep-the-legs-overlay]').count(),0);assert.equal(await page.locator('[data-leg-sweep-flight]').count(),0);
  assert.equal(await page.locator('[data-golf-total="a"]').textContent(),'32');assert.equal(await page.locator('[data-golf-total="b"]').textContent(),'8');assert.deepEqual(errors,[]);
  checks.push({width,reduced,passed:true});await page.close();
 }
}finally{await browser.close();writeFileSync('qualification.local/golf-sweep-smoke/animation-browser.json',JSON.stringify(checks,null,2));console.log(checks);}
