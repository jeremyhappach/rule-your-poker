import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='qualification.local/sound-smoke';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[];
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<500});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.proof={starts:[],stops:0};const Real=AudioContext;window.AudioContext=class extends Real{createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...args)=>{if(n.buffer?.duration>.02)window.proof.starts.push({at:performance.now(),duration:n.buffer.duration});return start(...args);};n.stop=(...args)=>{window.proof.stops++;return stop(...args);};return n;}};});
 await page.goto('http://127.0.0.1:4320');await page.getByRole('button',{name:'Mute sounds'}).waitFor();
 for(const id of ['chucky-heartbeat','chucky-sting','357-beeps','357-heartbeat']){
  const card=page.locator('[id="'+id+'"]');await card.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>window.proof.starts.length);
  await card.getByRole('button',{name:'Play preview'}).click();await card.getByRole('button',{name:'Stop',exact:true}).waitFor();await card.getByRole('button',{name:'Play preview'}).waitFor({timeout:10000});
  const after=await page.evaluate(()=>window.proof.starts.slice());const added=after.slice(before);
  assert.equal(added.length,id.startsWith('357')?3:1,id+' source starts');checks.push({width,id,starts:added});
 }
 await page.screenshot({path:out+'/studio-'+width+'.png',fullPage:true});
 await page.getByRole('button',{name:'Mute sounds'}).click();const before=await page.evaluate(()=>window.proof.starts.length);
 await page.locator('#chucky-heartbeat').getByRole('button',{name:'Play preview'}).click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.proof.starts.length),before);
 assert.deepEqual(errors,[]);await page.close();
}writeFileSync(out+'/studio-browser.json',JSON.stringify({passed:true,checks},null,2));console.log('PASS: four native-audio previews at desktop and phone widths; mute; zero page errors');}finally{await browser.close();}
