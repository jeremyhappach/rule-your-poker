import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base='http://127.0.0.1:15513',output='qualification.local/five-alive/revised-preview';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),evidence={picker:[],results:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(20000);page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+'/dev/five-alive/presentation/tiles.html');await page.getByRole('img',{name:'P-Town Words',exact:true}).waitFor();await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 for(const width of [320,375,390,430,585]){
  await page.setViewportSize({width,height:844});const bounds=await page.evaluate(()=>{
   const tiles=[...document.querySelectorAll('.async-picker-grid .midnight-tile')];
   const sizes=tiles.map(el=>{const r=el.getBoundingClientRect();return [Math.round(r.width*10)/10,Math.round(r.height*10)/10];});
   const names=tiles.map(el=>{const text=el.querySelector('.async-brand-name');if(!text||el.querySelector('[data-loaded]'))return null;const a=text.getBoundingClientRect(),b=el.getBoundingClientRect();return {name:text.textContent,contained:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom&&text.scrollWidth<=text.clientWidth+1};}).filter(Boolean);
   const mark=document.querySelector('[data-picker-game=five-alive] svg'),five=mark.querySelector('text').getBoundingClientRect(),alive=mark.querySelector('rect').getBoundingClientRect();
   return {width:innerWidth,sizes,names,markGap:alive.top-five.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
  });assert.equal(new Set(bounds.sizes.map(s=>s.join(':'))).size,1);assert.ok(bounds.names.every(n=>n.contained),JSON.stringify(bounds));assert.ok(bounds.markGap>=1,JSON.stringify(bounds));assert.equal(bounds.overflow,false);evidence.picker.push(bounds);
  if([320,390].includes(width))await page.screenshot({path:output+'/picker-'+width+'.png',fullPage:true});
 }
 for(const long of [false,true])for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await page.goto(base+'/dev/five-alive/presentation/results.html'+(long?'?long':''));await page.getByText((long?'Happach Gmail \u2014 visiting player':'Hap')+': Pending',{exact:true}).waitFor();await page.getByRole('dialog').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
  const bounds=await page.evaluate(()=>{
   const dialog=document.querySelector('[role=dialog]'),box=dialog.getBoundingClientRect();
   const lines=[...document.querySelectorAll('.five-alive-score-line')].map(p=>{const range=document.createRange();range.selectNodeContents(p);const rects=[...range.getClientRects()];return {text:p.textContent,fontSize:parseFloat(getComputedStyle(p).fontSize),height:p.getBoundingClientRect().height,contained:rects.every(r=>r.left>=box.left&&r.right<=box.right)&&p.scrollWidth<=p.clientWidth+1};});
   return {width:innerWidth,modal:{left:box.left,right:box.right},lines,overflow:dialog.scrollWidth>dialog.clientWidth+1};
  });assert.ok(bounds.lines.every(l=>l.contained&&l.fontSize>=13),JSON.stringify(bounds));assert.equal(bounds.overflow,false);assert.ok(bounds.modal.left>=0&&bounds.modal.right<=width);assert.equal(await page.getByText(/Solved in/).count(),0);assert.ok(bounds.lines.some(l=>l.text.includes('1,600 points')));evidence.results.push({long,...bounds});
  if([320,390].includes(width))await page.screenshot({path:output+'/results-'+(long?'long-':'')+width+'.png'});
 }
 assert.deepEqual(evidence.errors,[]);writeFileSync(output+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({pickerWidths:evidence.picker.map(p=>p.width),resultCases:evidence.results.length,uniformTiles:true,readableResults:true,noClipping:true,errors:evidence.errors}));
}finally{await browser.close();}
