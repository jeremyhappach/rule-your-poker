import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html',out='dev/mega-card-golf/polish/evidence.local';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],external=[],checks=[];
async function context(width,height){
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
 await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.origin);return route.abort();}return route.continue();});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page};
}
async function geometry(page){return page.locator('.mega-tableau>.mega-card,.mega-draw-card>.mega-card').evaluateAll(cards=>cards.map(card=>{
 const r=card.getBoundingClientRect(),inner=getComputedStyle(card.querySelector('.mega-card-inner'));
 return {label:card.getAttribute('aria-label'),x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,innerWidth:parseFloat(inner.width),innerHeight:parseFloat(inner.height)};
}));}
function ratios(cards,w,h){for(const r of cards){
 assert(Math.abs(r.width/r.height-5/7)<.002,JSON.stringify(r));
 assert(Math.abs(r.innerWidth/r.innerHeight-5/7)<.002,JSON.stringify(r));
 assert(r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=w+1&&r.bottom<=h+1,JSON.stringify(r));
}}
try{
 for(const [layout,w,h] of [['portrait',390,844],['landscape',844,390],['compact',320,568],['compact-landscape',568,320]]){
  const {ctx,page}=await context(w,h);
  for(let theme=0;theme<3;theme++){
   await page.goto(base+'?gameplay=play&theme='+theme);
   await page.addStyleTag({content:'.polish-gameplay-tools{display:none}.mega-app[data-preview-gameplay]{top:22px}'});
   await page.locator('.mega-draw-card [data-megatouch-face]').waitFor();await page.waitForTimeout(500);
   const cards=await geometry(page);ratios(cards,w,h);
   const boxes=await page.locator('.mega-turn-text,.mega-tableau,.mega-scorecard').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().toJSON()));
   assert(boxes[0].bottom<=boxes[1].top,'Status overlaps tableau');assert(boxes[1].bottom<=boxes[2].top,'Tableau overlaps scorecard');
   assert.equal(await page.locator('[data-course-emblem=tree]').count(),theme===0?4:0);
   assert(await page.locator('[data-course-back]').evaluateAll(els=>els.every(e=>e.getAttribute('preserveAspectRatio')==='xMidYMid meet')));
   await page.screenshot({path:out+'/gameplay-'+layout+'-'+theme+'.png'});
   checks.push({layout,theme,cards});
  }await ctx.close();
 }
 for(const [w,h] of [[568,320],[844,390]]){
  const {ctx,page}=await context(w,h);await page.goto(base+'?gameplay=scoring');
  await page.addStyleTag({content:'.polish-gameplay-tools{display:none}.mega-app[data-preview-gameplay]{top:22px}'});
  await page.evaluate(()=>document.querySelector('.polish-gameplay-tools button').click());await page.waitForTimeout(3200);
  const overlap=await page.evaluate(()=>{
   const range=document.createRange();range.selectNodeContents(document.querySelector('.mega-hole-tally strong'));const tally=range.getBoundingClientRect();
   return [...document.querySelectorAll('.mega-tableau>.mega-card,.mega-turn-text')].some(e=>{const r=e.getBoundingClientRect();return r.left<tally.right&&r.right>tally.left&&r.top<tally.bottom&&r.bottom>tally.top;});
  });assert(!overlap,'Scoring tally overlaps hand or status');
  await page.screenshot({path:out+'/stock-scoring-'+w+'.png'});checks.push({scoringSize:[w,h],overlap});await ctx.close();
 }
 const {ctx,page}=await context(390,844);
 await page.goto(base+'?gameplay=replacement&theme=0');await page.getByRole('button',{name:'Replay demo'}).click();
 const seek=async value=>{await page.getByRole('slider',{name:'Presentation time'}).evaluate((el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);};
 for(const [time,stage] of [[500,'reveal'],[1600,'dissolve'],[2000,'arrive']]){
  await seek(time);const target=page.locator('[data-replacement-stage='+stage+']');await target.waitFor();
  assert.equal(await page.locator('.mega-draw-card .mega-card').getAttribute('aria-label'),'Next stock card · concealed');
  if(stage==='arrive'){
   assert.equal(await target.getAttribute('aria-label'),'Card 2 · A ♠');
   const motion=await target.locator('.mega-card-inner').evaluate(el=>{
    const animation=el.getAnimations()[0];if(!animation)return null;animation.pause();animation.currentTime=175;
    const matrix=new DOMMatrix(getComputedStyle(el).transform);return {x:matrix.a,y:matrix.d,dx:matrix.e,dy:matrix.f};
   });assert(motion&&Math.abs(motion.x-motion.y)<.0001,'Transport must use uniform scaling');assert(Math.abs(motion.dx)+Math.abs(motion.dy)>1,'Card must move from stock anchor');checks.push({motion});
  }else if(stage==='reveal'){await page.waitForTimeout(370);assert.equal(await target.getAttribute('aria-label'),'Card 2 · 7 ♠');}
  await page.screenshot({path:out+'/stock-hidden-'+stage+'.png'});
 }
 await page.goto(base+'?gameplay=face-up&theme=1');await page.getByRole('button',{name:'Replay demo'}).click();await seek(100);
 await page.locator('[data-replacement-stage=arrive]').waitFor();assert.equal(await page.locator('[data-replacement-stage=reveal],[data-replacement-stage=dissolve]').count(),0);
 await page.screenshot({path:out+'/stock-face-up-arrive.png'});
 // Exercise the real production controller, not just the timeline fixture.
 await page.goto(base+'?controller');await page.getByRole('button',{name:/Sunny Meadows/}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Reveal selected'}).count(),0);
 await page.getByRole('button',{name:/Card 1/}).click();await page.waitForTimeout(450);
 assert.equal(await page.getByRole('button',{name:'Card 1 · A ♠',exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Card 6 · concealed',exact:true}).count(),1);
 assert.equal(await page.locator('.mega-draw-card .mega-card').getAttribute('aria-label'),'Next stock card · concealed');await page.screenshot({path:out+'/stock-first-opening.png'});
 await page.getByRole('button',{name:/Card 6/}).click();
 await page.locator('.mega-draw-card [data-megatouch-face]').waitFor();await page.waitForTimeout(450);
 assert.equal(await page.locator('.mega-draw-card .mega-card').getAttribute('aria-label'),'Active stock card · 7 ♠');
 const productionCards=await geometry(page);ratios(productionCards,390,844);checks.push({productionComposition:productionCards});
 await page.getByRole('button',{name:/Card 2/}).click();
 const sequence=[];
 for(let i=0;i<60;i++){
  sequence.push(await page.evaluate(()=>({stage:document.querySelector('[data-replacement-stage]')?.getAttribute('data-replacement-stage')??'idle',stock:document.querySelector('.mega-draw-card .mega-card')?.getAttribute('aria-label'),board:document.querySelectorAll('.mega-tableau>.mega-card')[1]?.getAttribute('aria-label')})));
  await page.waitForTimeout(50);
 }
 for(const stage of ['reveal','dissolve','arrive'])assert(sequence.some(s=>s.stage===stage),'Missing '+stage);
 assert(sequence.filter(s=>['reveal','dissolve','arrive'].includes(s.stage)).every(s=>s.stock==='Next stock card · concealed'));
 assert(sequence.filter(s=>s.stage==='arrive').every(s=>s.board==='Card 2 · 7 ♠'));
 assert(sequence.some(s=>s.stage==='stock-reveal'&&s.stock==='Active stock card · 8 ♠'));
 assert.equal(await page.locator('.mega-draw-card .mega-card').getAttribute('aria-label'),'Active stock card · 8 ♠');
 await page.screenshot({path:out+'/stock-controller-settled.png'});checks.push({sequence});
 await page.getByRole('button',{name:'Discard',exact:true}).click();await page.waitForTimeout(550);
 assert.equal(await page.locator('.mega-draw-card .mega-card').getAttribute('aria-label'),'Active stock card · 9 ♠');
 await ctx.close();
 const samples=await context(844,700);await samples.page.goto(base+'?gameplay=cards');await samples.page.locator('[data-megatouch-face=large]').first().waitFor();await samples.page.waitForTimeout(450);
 await samples.page.screenshot({path:out+'/gameplay-card-variants.png',fullPage:true});await samples.ctx.close();
 const reduced=await context(390,844);await reduced.page.emulateMedia({reducedMotion:'reduce'});await reduced.page.goto(base+'?gameplay=replacement');await reduced.page.getByRole('button',{name:'Replay demo'}).click();await reduced.page.waitForTimeout(2000);
 assert.equal(await reduced.page.locator('.mega-card-inner').evaluateAll(els=>els.reduce((n,e)=>n+e.getAnimations().length,0)),0);await reduced.ctx.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(out+'/stock-geometry-browser-report.json',JSON.stringify({checks,errors,external},null,2));
 console.log('PASS: 12 theme/size layouts, uniform 5:7 layers, tree/backs, hidden and face-up transports, real controller automatic draw/discard sequence, reduced motion; no external requests.');
}finally{await browser.close();}
