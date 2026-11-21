import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='qualification.local/midnight-blue/reference-fidelity';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']}),checks=[],errors=[];
try{
 for(const [width,height] of [[390,844],[320,568],[455,488],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5197'?r.continue():r.abort());
  async function capture(name){
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled([...document.images].map(image=>image.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   await page.screenshot({path:`${output}/${width}-${name}.png`,fullPage:true,animations:'disabled'});
  }
  await page.goto('http://127.0.0.1:5197/setup');
  await expect(page.locator('[data-dealer-game-option="holm-game"]')).toBeVisible();
  await capture('picker');
  for(const game of ['holm-game','cribbage','gin-rummy','six-card-golf']){
   const tile=page.locator(`[data-dealer-game-option="${game}"]`);
   assert.ok(await tile.evaluate(el=>{const t=el.querySelector('span'),r=t.getBoundingClientRect(),b=el.getBoundingClientRect(),art=el.querySelector('.midnight-art').getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.bottom<=art.top+1&&r.bottom<=b.bottom&&t.scrollWidth<=t.clientWidth+1;}),'Readable title without artwork overlap: '+game);
  }
  for(const category of ['Cards','Dice','Other']){
   await page.getByRole('tab',{name:category,exact:true}).click();
   for(const tile of await page.locator('[data-dealer-game-option]').all()){
    assert.ok(await tile.evaluate(el=>{const r=el.querySelector('span').getBoundingClientRect(),b=el.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.bottom<=b.bottom;}),`${category}: complete title`);
    assert.ok(await tile.evaluate(el=>!['',':before',':after'].some(pseudo=>getComputedStyle(el,pseudo||null).backgroundImage.includes('url('))),`${category}: no per-tile photograph`);
   }
   if(category!=='Other')assert.ok(await page.locator('.midnight-tile-large').first().evaluate((el,ratio)=>{const r=el.getBoundingClientRect();return Math.abs(r.width/r.height-ratio)<.03;},category==='Cards'?1.4:1.12),'Reference Cards/Dice proportions');
   await capture(category.toLowerCase());
  }
  for(const [game,category] of [['holm-game','Cards'],['3-5-7','Cards'],['cribbage','Cards'],['gin-rummy','Cards'],['six-card-golf','Cards'],['horses','Dice'],['yahtzee','Dice'],['run21','Other']]){
   await page.getByRole('tab',{name:category,exact:true}).click();await page.locator(`[data-dealer-game-option="${game}"]`).click();
   await expect(page.locator(`[data-dealer-game-start="${game}"]`)).toBeVisible();
   const bounds=await page.locator('.midnight-setup').evaluate(root=>({overflows:[root,...root.querySelectorAll('*')].filter(el=>!el.classList.contains('sr-only')&&el.clientHeight>0&&el.scrollHeight>el.clientHeight+1&&['auto','scroll','hidden','clip'].includes(getComputedStyle(el).overflowY)).map(el=>({class:el.className,height:el.clientHeight,scroll:el.scrollHeight})),clipped:[...root.querySelectorAll('.midnight-settings>*,.midnight-footer,.midnight-setup-clock')].filter(el=>{const r=el.getBoundingClientRect();return r.top<0||r.bottom>innerHeight;}).map(el=>el.className)}));
   checks.push({width,height,game,...bounds});
   assert.deepEqual(bounds.overflows,[],`${width} ${game}: no internal scroll/clipping`);assert.deepEqual(bounds.clipped,[],`${width} ${game}: all controls inside viewport`);
   assert.ok(await page.locator('.midnight-setup-body').evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.getBoundingClientRect().bottom<=el.nextElementSibling.getBoundingClientRect().top),`${width} ${game}: settings do not overlap footer`);
   assert.ok(await page.locator('.midnight-scene-header .midnight-art').evaluate(el=>el.getBoundingClientRect().height>=55),'Scene artwork has readable height');
   assert.equal(await page.locator('.midnight-scene-header').evaluate(el=>getComputedStyle(el,':before').backgroundImage.includes('approved-scene-light')),game==='holm-game','Cocktail is specific to Holm');
   assert.equal(await page.locator('.midnight-scene-header .midnight-setup-clock').count(),0,'Utility row is outside the artwork panel');
   for(const input of await page.locator('.midnight-settings input:visible').all())assert.ok(await input.evaluate(el=>el.getBoundingClientRect().width>=32),'Numeric values remain readable');
   await capture(game);
   if(game==='3-5-7'){
    await page.getByRole('button',{name:/Pot Max \$/}).click();await capture('357-expanded');
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
   await card.screenshot({path:`${output}/${width}-pending-${state}.png`,animations:'disabled'});
  }
  await capture('async');await page.close();
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();writeFileSync(output+'/fit-report.json',JSON.stringify({checks,errors},null,2));}
console.log(JSON.stringify(checks));
