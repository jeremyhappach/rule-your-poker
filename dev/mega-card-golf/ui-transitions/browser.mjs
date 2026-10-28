import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base='http://127.0.0.1:5198/dev/mega-card-golf/ui-transitions/index.html';
const dir='dev/mega-card-golf/ui-transitions/evidence.local/';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],external=[],checks=[];
const make=async options=>{const page=await browser.newPage(options);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort();}return r.continue();});return page;};
try{
 const page=await make({viewport:{width:1000,height:850}});await page.goto(base);
 const discard=page.getByRole('button',{name:'Discard',exact:true}),stand=page.getByRole('button',{name:'Stand Pat',exact:true});
 await stand.waitFor();
 await page.evaluate(()=>{window.transitionViolations=[];new MutationObserver(()=>{
  const animation=document.querySelector('[data-replacement-stage]');
  if(animation&&document.querySelector('.mega-draw-area>.mega-start,.mega-draw-area>.mega-secondary'))window.transitionViolations.push(animation.getAttribute('data-replacement-stage'));
 }).observe(document.querySelector('.mega-game-host'),{subtree:true,childList:true,attributes:true});});
 for(const [label,index,stage] of [['concealed',1,'reveal'],['exposed',0,'arrive']]){
  await page.locator('.mega-tableau>.mega-card').nth(index).click();
  await page.locator(`[data-replacement-stage="${stage}"]`).waitFor();
  assert.equal(await discard.count(),0);assert.equal(await stand.count(),0);
  if(label==='concealed')await page.screenshot({path:dir+'concealed-reveal.png'});
  await discard.waitFor();assert(await discard.isEnabled());assert(await stand.isEnabled());checks.push(label+' replacement stays hidden until next stock settles');
 }
 await discard.click();await discard.waitFor({state:'hidden'});await discard.waitFor();checks.push('discard consumed and next stock shown once');
 assert.deepEqual(await page.evaluate(()=>window.transitionViolations),[]);
 const card=page.locator('.mega-tableau>.mega-card').nth(1),box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.evaluate(()=>window.megaFixture.nextHole());
 await page.getByText('Choose 2 opening cards',{exact:true}).waitFor({timeout:25000});
 await page.locator('[data-mega-transition]').waitFor({state:'hidden'});
 const border=await card.evaluate(e=>({outline:getComputedStyle(e).outlineStyle,lift:new DOMMatrix(getComputedStyle(e).transform).m42,scored:e.hasAttribute('data-scored'),selected:e.getAttribute('aria-pressed')}));
 assert.deepEqual(border,{outline:'none',lift:0,scored:false,selected:'false'});
 await page.screenshot({path:dir+'new-hole-stationary-pointer.png'});checks.push('new hole has no hover/scoring/selection residue beneath stationary pointer');
 await page.mouse.move(990,840);await page.evaluate(()=>document.activeElement?.blur());
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.matches('.mega-tableau>.mega-card')))break;}
 const focus=await page.evaluate(()=>{const e=document.activeElement;return {card:e.matches('.mega-tableau>.mega-card'),visible:e.matches(':focus-visible'),outline:getComputedStyle(e).outlineWidth};});
 assert.deepEqual(focus,{card:true,visible:true,outline:'3px'});await page.screenshot({path:dir+'keyboard-focus.png'});
 await page.keyboard.press('Enter');await page.getByText('Choose 1 opening card',{exact:true}).waitFor();checks.push('keyboard focus remains visible and Enter reveals opening card');
 for(const version of [1,2,3,4]){
  await page.goto(base+'?version='+version+'&stock=1&discards=0');await page.locator('.mega-tableau').waitFor();
  if(version>=3){await stand.waitFor();assert(await stand.isEnabled());}
  else{await discard.waitFor();assert(await discard.isDisabled());assert.equal(await stand.count(),0);}
  if(version===4){assert(await discard.isDisabled());await stand.click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await stand.click();await page.getByRole('button',{name:'Tap In?',exact:true}).click();await stand.waitFor({state:'hidden'});}
  checks.push('/'+version+' exhausted-allowance and final-stock eligibility');
 }
 const touch=await make({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await touch.goto(base+'?opening');
 await touch.getByRole('button',{name:'Card 1 · concealed',exact:true}).tap();await touch.getByText('Choose 1 opening card',{exact:true}).waitFor();
 await touch.getByRole('button',{name:'Card 6 · concealed',exact:true}).tap();await touch.getByRole('button',{name:'Discard',exact:true}).waitFor();
 await touch.evaluate(()=>window.megaFixture.nextHole());await touch.getByText('Choose 2 opening cards',{exact:true}).waitFor({timeout:25000});await touch.locator('[data-mega-transition]').waitFor({state:'hidden'});
 assert(await touch.locator('.mega-tableau>.mega-card').evaluateAll(cards=>cards.every(e=>!e.hasAttribute('data-scored')&&e.getAttribute('aria-pressed')==='false'&&getComputedStyle(e).outlineStyle==='none')));
 await touch.screenshot({path:dir+'touch-new-hole.png'});await touch.getByRole('button',{name:'Card 1 · concealed',exact:true}).tap();await touch.getByText('Choose 1 opening card',{exact:true}).waitFor();checks.push('touch sequential opening and new-hole reset');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(dir+'report.json',JSON.stringify({checks,errors,external},null,2));console.log(JSON.stringify({checks,errors,external},null,2));
}finally{await browser.close();}
