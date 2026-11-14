import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='http://127.0.0.1:4343',out='qualification.local/cribbage-yahtzee';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),checks=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.addInitScript(()=>{window.audioProof={events:[],stops:0};const Native=window.AudioContext;
 window.AudioContext=class extends Native{
 createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n),stop=n.stop.bind(n);n.start=(...a)=>{if(n.buffer?.length>1)window.audioProof.events.push({kind:'sample',seconds:n.buffer.duration,at:a[0]??this.currentTime});return start(...a);};n.stop=(...a)=>{window.audioProof.stops++;return stop(...a);};return n;}
 createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(...a)=>{window.audioProof.events.push({kind:'tone',at:a[0]??this.currentTime});return start(...a);};return n;}
 };});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/cribbage-yahtzee.html');await page.locator('[data-ready="true"]').waitFor();
 const click=name=>page.getByRole('button',{name,exact:true}).click(),events=()=>page.evaluate(()=>window.audioProof.events),clear=()=>page.evaluate(()=>{window.audioProof.events=[];window.audioProof.stops=0;});
 await click('Unmute');await page.waitForTimeout(120);
 for(const [button,count,duration] of [['cut',1,.14],['cold-cut',0,.14],['self-play',1,.18],['opponent-play',1,.18],['self-discard',2,.18],['opponent-discard',2,.18]]){
 await clear();await click(button);await page.waitForTimeout(900);const list=await events();assert.equal(list.length,count,button+JSON.stringify({list,requests:await page.evaluate(()=>window.cueRequests)}));for(const e of list)assert(Math.abs(e.seconds-duration)<.001);await click('Rerender');assert.equal((await events()).length,count);checks.push(button);}
 for(const n of [1,2,4,12]){await clear();await click('Award '+n);await page.waitForTimeout(n*90+200);const list=await events();assert.equal(list.length,n,'award '+n);list.forEach((e,i)=>{assert(Math.abs(e.seconds-.12)<.001);assert(Math.abs(e.at-list[0].at-i*.09)<.001);});checks.push(n+' exact peg clicks');}
 await clear();await click('Opponent pair');await page.waitForTimeout(400);assert.equal((await events()).length,2);checks.push('opponent pair');
 await clear();await click('zero');await page.waitForFunction(()=>window.audioProof.events.filter(e=>e.kind==='tone').length===6,{},{timeout:15000});assert.equal((await events()).filter(e=>e.kind==='tone').length,6,'two zero hands and zero crib');checks.push('three zero womp cues');
 await clear();await click('pairs');await page.waitForTimeout(1600);assert.equal((await events()).length,2,'first pair two samples, no ding');assert((await events()).every(e=>e.kind==='sample'&&Math.abs(e.seconds-.12)<.001));checks.push('counting pair through real score-update callback');
 await click('cold-cut');await page.waitForTimeout(700);
 for(const button of ['Local roll','opponent']){await clear();await click(button);await page.waitForTimeout(150);const list=await events();assert.equal(list.filter(e=>e.seconds===4).length,1,button);await page.waitForTimeout(1500);assert((await page.evaluate(()=>window.audioProof.stops))>0);checks.push(button+' Cup C and cancellation');}
 for(let i=0;i<2;i++){await clear();await click('Toggle hold');await page.waitForTimeout(120);assert.equal((await events()).filter(e=>e.kind==='tone').length,1);checks.push(i?'unhold tone':'hold tone');}
 await clear();await click('Award 12');await page.waitForTimeout(80);await click('Mute');assert((await page.evaluate(()=>window.audioProof.stops))>=12);await clear();await click('Award 4');await page.waitForTimeout(400);assert.equal((await events()).length,0);await click('Unmute');await page.waitForTimeout(300);assert.equal((await events()).length,0);checks.push('mid-award mute and silent unmute');
 assert.deepEqual(errors,[]);await page.screenshot({path:out+'/components.png'});writeFileSync(out+'/browser.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
