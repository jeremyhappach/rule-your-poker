import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5187/dev/mega-card-golf/polish/index.html',out='dev/mega-card-golf/polish/evidence.local';
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],external=[],checks=[];
const context=async(width=390,height=844,reduced=false)=>{
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
 await ctx.route('**/*',r=>{if(!['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)){external.push(r.request().url());return r.abort();}return r.continue();});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page};
};
const seek=async(page,value)=>page.getByRole('slider',{name:'Presentation time'}).evaluate((el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
try{
 for(const [name,w,h] of [['portrait',390,844],['landscape',844,390],['compact',320,568],['compact-landscape',568,320]]){
  const {ctx,page}=await context(w,h);
  for(const [demo,time,kind] of [['honors',500,'honors'],['hole-end',7100,'hole'],['final',11000,'final']]){
   await page.goto(base+'?gameplay='+demo);await page.getByRole('button',{name:'Replay demo'}).click();await seek(page,time);
   const transition=page.locator('[data-mega-transition='+kind+']');await transition.waitFor();
   await page.addStyleTag({content:'.polish-gameplay-tools{display:none}.mega-app[data-preview-gameplay]{top:22px}'});
   const b=await transition.boundingBox();assert(b&&b.x>=0&&b.y>=0&&b.x+b.width<=w+1&&b.y+b.height<=h+1);
   const overflow=await transition.evaluate(e=>({vertical:e.scrollHeight>e.clientHeight+2,horizontal:e.scrollWidth>e.clientWidth+2}));assert(!overflow.horizontal&&!overflow.vertical,JSON.stringify({name,demo,overflow}));
   if(kind==='hole'){assert.equal(await page.getByRole('heading',{name:'Hole 1: +3',exact:true}).count(),1);assert.equal(await page.locator('[data-mega-write]').count(),1);}
   if(kind==='final')assert.equal(await page.getByRole('heading',{name:'Final score: +27',exact:true}).count(),1);
   await page.locator('[data-mega-write]').evaluateAll(els=>els.flatMap(e=>e.getAnimations({subtree:true})).forEach(a=>a.finish()));
   await page.screenshot({path:out+'/sequence-'+name+'-'+kind+'.png'});checks.push({name,kind,overflow});
  }await ctx.close();
 }
 const {ctx,page}=await context();
 // Real controller holds a final run through counting, hole result and final result.
 await page.goto(base+'?sequence=game-end');await page.getByRole('button',{name:'Sound off'}).click();
 await page.getByRole('button',{name:'Select Sunny Meadows'}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();
 await page.getByRole('heading',{name:'Hole 9, you have honors'}).waitFor();await page.waitForTimeout(1900);
 await page.getByRole('button',{name:'Finish current hole (local clock)'}).click();
 await page.getByRole('heading',{name:'Hole 9: +3',exact:true}).waitFor({timeout:15000});
 assert.equal(await page.getByRole('heading',{name:'Top Ten'}).count(),0);await page.screenshot({path:out+'/sequence-controller-hole.png'});
 await page.getByRole('heading',{name:'Final score: +27',exact:true}).waitFor({timeout:7000});
 assert.equal(await page.getByRole('heading',{name:'Top Ten'}).count(),0);await page.screenshot({path:out+'/sequence-controller-final.png'});
 await page.getByRole('heading',{name:'Top Ten'}).waitFor({timeout:9000});checks.push({controller:'counting -> hole result -> final scorecard -> leaderboard'});
 // Render the exact production cues offline to portable WAV samples.
 const samples=await page.evaluate(async()=>{
  const {megaTeeCue,megaHoleCue,megaFinalCue}=await import('/src/lib/megaCardGolf/audio.ts');
  const output=[];
  for(const [name,cue] of [['tee-off',megaTeeCue],['hole-result',megaHoleCue],['course-finale',megaFinalCue]]){
   const ctx=new OfflineAudioContext(1,Math.ceil((cue.durationMs+100)*22.05),22050);cue.schedule(ctx,ctx.destination,n=>n);const buffer=await ctx.startRendering();output.push({name,samples:Array.from(buffer.getChannelData(0))});
  }return output;
 });
 for(const {name,samples:pcm} of samples){
  assert(pcm.every(Number.isFinite));const peak=pcm.reduce((n,x)=>Math.max(n,Math.abs(x)),0);assert(peak>.005&&peak<1);
  const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);pcm.forEach((x,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));writeFileSync(out+'/'+name+'.wav',wav);checks.push({audio:name,peak,seconds:pcm.length/22050});
 }
 await ctx.close();
 const reduced=await context(390,844,true);await reduced.page.goto(base+'?gameplay=hole-end');await reduced.page.getByRole('button',{name:'Replay demo'}).click();await seek(reduced.page,7100);await reduced.page.locator('[data-mega-write]').waitFor();
 assert(await reduced.page.locator('[data-mega-write] path').evaluateAll(paths=>paths.every(p=>getComputedStyle(p).animationName==='none')));checks.push({reducedMotion:'paper hold retained; pencil motion disabled'});await reduced.ctx.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(out+'/smoke-sequences-browser.json',JSON.stringify({checks,errors,external},null,2));console.log(JSON.stringify({checks:checks.length,errors,external}));
}finally{await browser.close();}
