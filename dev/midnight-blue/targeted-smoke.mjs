import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='qualification.local/midnight-blue/final';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[],errors=[];
try{
 for(const [width,height] of [[390,844],[320,568],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5197'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:5197/setup');
  await expect(page.locator('[data-dealer-game-option="holm-game"]')).toBeVisible();
  await page.screenshot({path:`${output}/${width}-picker.png`,fullPage:true});
  for(const game of ['holm-game','cribbage','gin-rummy','six-card-golf']){
   const tile=page.locator(`[data-dealer-game-option="${game}"]`);
   assert.ok(await tile.evaluate(el=>{const t=el.querySelector('span'),r=t.getBoundingClientRect(),b=el.getBoundingClientRect(),art=el.querySelector('.midnight-art').getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.bottom<=art.top+1&&r.bottom<=b.bottom&&t.scrollWidth<=t.clientWidth+1;}),'Readable title without artwork overlap: '+game);
  }
  for(const [game,category] of [['holm-game','Cards'],['3-5-7','Cards'],['cribbage','Cards'],['gin-rummy','Cards'],['six-card-golf','Cards'],['horses','Dice'],['yahtzee','Dice'],['run21','Other']]){
   await page.getByRole('tab',{name:category,exact:true}).click();await page.locator(`[data-dealer-game-option="${game}"]`).click();
   await expect(page.locator(`[data-dealer-game-start="${game}"]`)).toBeVisible();
   const bounds=await page.locator('.midnight-setup').evaluate(root=>({overflows:[root,...root.querySelectorAll('*')].filter(el=>el.clientHeight>0&&el.scrollHeight>el.clientHeight+1&&['auto','scroll','hidden','clip'].includes(getComputedStyle(el).overflowY)).map(el=>({class:el.className,height:el.clientHeight,scroll:el.scrollHeight})),clipped:[...root.querySelectorAll('.midnight-settings>*,.midnight-footer,.midnight-setup-clock')].filter(el=>{const r=el.getBoundingClientRect();return r.top<0||r.bottom>innerHeight;}).map(el=>el.className)}));
   checks.push({width,height,game,...bounds});
   assert.deepEqual(bounds.overflows,[],`${width} ${game}: no internal scroll/clipping`);assert.deepEqual(bounds.clipped,[],`${width} ${game}: all controls inside viewport`);
   assert.ok(await page.locator('.midnight-setup-body').evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.getBoundingClientRect().bottom<=el.nextElementSibling.getBoundingClientRect().top),`${width} ${game}: settings do not overlap footer`);
   await page.screenshot({path:`${output}/${width}-${game}.png`,fullPage:true});
   if(game==='3-5-7'){
    await page.getByRole('button',{name:/Pot Max \$/}).click();await page.screenshot({path:`${output}/${width}-357-expanded.png`,fullPage:true});
    checks.push({width,height,game:'357-expanded',bottom:await page.locator('.midnight-footer').evaluate(el=>el.getBoundingClientRect().bottom)});
    assert.ok(await page.locator('.midnight-footer').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),`${width}: expanded amount fits`);
    await expect(page.getByLabel('Pot Max',{exact:true})).toBeInViewport();
   }
   await page.getByRole('button',{name:/← Back/}).click();
  }
  await page.goto('http://127.0.0.1:5197/delayed');await expect(page.getByText('Pending acceptance')).toHaveCount(2);
  for(const state of ['own','opponent']){
   const card=page.locator(`[data-acceptance="${state}"]`);const status=card.locator('.midnight-pending');
   assert.equal(await status.innerText(),'Pending acceptance');
   assert.ok(await status.evaluate(el=>el.getBoundingClientRect().height<2*parseFloat(getComputedStyle(el).lineHeight)),'Single-line pending status');
   await card.screenshot({path:`${output}/${width}-pending-${state}.png`});
  }
  await page.screenshot({path:`${output}/${width}-async.png`,fullPage:true});await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(output+'/fit-report.json',JSON.stringify({checks,errors},null,2));}
console.log(JSON.stringify(checks));
