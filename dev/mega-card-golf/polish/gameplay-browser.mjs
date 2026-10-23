import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='dev/mega-card-golf/polish/evidence.local',base='http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],external=[],checks=[];
async function context(width,height){
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
 await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.origin);return route.abort();}return route.continue();});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page};
}
try{
 for(const [layout,w,h] of [['portrait',390,844],['landscape',844,390],['compact',320,568],['compact-landscape',568,320]]){
  const {ctx,page}=await context(w,h);
  for(let theme=0;theme<3;theme++){
   await page.goto(base+'?gameplay=play&theme='+theme);await page.locator('.mega-tableau .mega-card').first().waitFor();
   await page.addStyleTag({content:'.polish-gameplay-tools{display:none}.mega-app[data-preview-gameplay]{top:22px}'});
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
   await page.waitForTimeout(400);
   await page.screenshot({path:out+'/gameplay-'+layout+'-'+theme+'.png'});
   const geometry=await page.locator('.mega-tableau .mega-card').evaluateAll(cards=>cards.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
   assert(geometry.every(r=>r.x>=0&&r.y>=0&&r.right<=w+1&&r.bottom<=h+1&&r.width>=44&&r.height>=44),JSON.stringify({layout,theme,geometry}));
   assert.equal(await page.getByRole('button',{name:'Draw a card',exact:true}).count(),0);
   assert.equal(await page.getByText('Visible cards',{exact:false}).count(),0);
   await page.getByRole('button',{name:/Draw stock/}).click();
   assert.equal(await page.getByRole('button',{name:'Discard',exact:true}).count(),1);
   await page.getByRole('button',{name:'Discard',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Discard',exact:true}).count(),0);
   checks.push({layout,theme,geometry});
  }await ctx.close();
 }
 for(const scenario of ['replacement','tap-in','scoring','negative','zero','final']){
  const {ctx,page}=await context(390,844);await page.goto(base+'?gameplay='+scenario+'&theme=1');await page.locator('.mega-tableau').waitFor();
  if(scenario==='tap-in'){
   await page.getByRole('button',{name:/Card 5/}).click();await page.waitForTimeout(250);await page.screenshot({path:out+'/gameplay-tap-in-confirm.png'});
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   await page.getByRole('button',{name:'Card 5 · concealed',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Card 5 · concealed',exact:true}).count(),1);
   await page.screenshot({path:out+'/gameplay-tap-in-cancel.png'});
   await page.getByRole('button',{name:/Card 5/}).click();await page.getByRole('button',{name:'Tap In?',exact:true}).click();
  }else await page.getByRole('button',{name:'Replay demo'}).click();
  if(scenario==='replacement'||scenario==='tap-in'){
   const seek=async value=>page.getByRole('slider',{name:'Presentation time'}).evaluate((el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
   await seek(500);await page.locator('[data-replacement-stage=reveal]').waitFor();await page.waitForTimeout(350);await page.screenshot({path:out+'/gameplay-'+scenario+'-old.png'});
   assert(await page.getByRole('button',{name:/Draw stock/}).isDisabled());
   await seek(1600);await page.locator('[data-replacement-stage=dissolve]').waitFor();await page.screenshot({path:out+'/gameplay-'+scenario+'-dissolve.png'});
   await seek(2000);await page.locator('[data-replacement-stage=arrive]').waitFor();await page.screenshot({path:out+'/gameplay-'+scenario+'-arrive.png'});
   await page.getByRole('button',{name:'Live',exact:true}).click();
  }
  const observations=[];
  for(let i=0;i<80;i++){
   observations.push(await page.evaluate(()=>({hole:document.querySelector('.mega-hole-flag')?.getAttribute('aria-label'),tally:document.querySelector('.mega-hole-tally strong')?.textContent,course:document.querySelector('.mega-course-total b')?.textContent,scored:[...document.querySelectorAll('[data-scored=true]')].map(c=>c.getAttribute('aria-label')),complete:!![...document.querySelectorAll('h1')].find(e=>e.textContent==='Course complete')})));
   if(i===25||i===50)await page.screenshot({path:out+'/gameplay-'+scenario+'-'+i+'.png'});
   await page.waitForTimeout(100);
  }
  if(scenario==='final'){const firstComplete=observations.findIndex(x=>x.complete);assert(firstComplete>15,'Final results cut off counting');}
  checks.push({scenario,observations});await page.screenshot({path:out+'/gameplay-'+scenario+'-end.png'});
  await ctx.close();
 }
 const {ctx,page}=await context(844,700);await page.goto(base+'?gameplay=cards');await page.locator('[data-megatouch-face=large]').first().waitFor();await page.waitForTimeout(450);await page.screenshot({path:out+'/gameplay-card-variants.png',fullPage:true});
 const samples=await page.evaluate(async()=>{const {megaCupCue}=await import('/src/lib/megaCardGolf/audio.ts');const audio=new OfflineAudioContext(1,44100,44100);megaCupCue.schedule(audio,audio.destination,node=>node);return Array.from((await audio.startRendering()).getChannelData(0));});
 const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);samples.forEach((s,i)=>wav.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(s*32767))),44+i*2));writeFileSync(out+'/gameplay-cup-cue.wav',wav);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'?gameplay=scoring');await page.getByRole('button',{name:'Replay demo'}).click();await page.waitForTimeout(2800);await page.screenshot({path:out+'/gameplay-reduced-motion.png'});await ctx.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);writeFileSync(out+'/gameplay-browser-report.json',JSON.stringify({checks,errors,external},null,2));console.log('PASS: all themes/four sizes, stock/discard, replacement, confirmation/cancel, scoring, final-hole captures and reduced motion; no external requests.');
}finally{await browser.close();}
