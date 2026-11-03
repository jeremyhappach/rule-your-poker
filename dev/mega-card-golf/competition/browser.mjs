import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync as write} from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],checks=[],base='http://127.0.0.1:5198/dev/mega-card-golf/competition/index.html';
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:412,height:915},{width:844,height:390}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width<850,hasTouch:viewport.width<850});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(base);await page.getByRole('button',{name:'Card 1 · concealed',exact:true}).click();await page.getByText('Choose 1 opening card',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Card 2 · concealed',exact:true}).click();await page.getByRole('button',{name:'Stand Pat',exact:true}).waitFor();
  await page.getByRole('button',{name:'Stand Pat',exact:true}).click();await page.getByRole('button',{name:'Tap In?',exact:true}).click();
  await page.getByText('Hole 1 complete',{exact:true}).waitFor({timeout:25000});
  await page.locator('.mega-competition-summary').click();await page.getByRole('region',{name:'Hole-by-hole scores'}).waitFor();
  assert.equal(await page.getByText('Back nine',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
  const overlap=await page.evaluate(()=>{const a=document.querySelector('.mega-competition-summary').getBoundingClientRect(),b=document.querySelector('.mega-tableau').getBoundingClientRect();return a.bottom>b.top&&a.left<b.right&&a.right>b.left;});assert(!overlap,'leaderboard overlaps interactive cards');
  await page.screenshot({path:'qualification.local/mega-competition/scorecard-'+viewport.width+'x'+viewport.height+'.png'});
  checks.push(viewport.width+'×'+viewport.height+': shared opening, stock, stand pat, 18-hole scorecard, no horizontal overflow or covered cards');
  await page.close();
 }
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'?replay&holes=3');await page.locator('.mega-tableau').waitFor();
 assert(await page.locator('.mega-tableau button').evaluateAll(elements=>elements.every(e=>e.disabled)));
 await page.evaluate(()=>window.megaCompetition.advance(15000));assert.equal(await page.evaluate(()=>window.megaCompetition.actions.length),0);checks.push('saved replay has no legal action path');
 assert.deepEqual(errors,[]);write('qualification.local/mega-competition/browser-proof.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();}
