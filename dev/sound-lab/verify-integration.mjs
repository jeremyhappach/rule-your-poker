import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin=process.env.SOUND_LAB_URL??'http://127.0.0.1:4317';
const output='qualification.local/sound-effects';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),checks=[],errors=[];
try{
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>{
  window.soundProbe={events:[],stops:0};const Native=window.AudioContext;
  window.AudioContext=class extends Native{
   createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node),stop=node.stop.bind(node);
    node.start=(...args)=>{if(node.buffer?.length>1)window.soundProbe.events.push({kind:'sample',duration:node.buffer.duration,at:performance.now()});return start(...args);};
    node.stop=(...args)=>{window.soundProbe.stops++;return stop(...args);};return node;}
   createOscillator(){const node=super.createOscillator(),start=node.start.bind(node);node.start=(...args)=>{window.soundProbe.events.push({kind:'tone',at:performance.now()});return start(...args);};return node;}
  };
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/integration.html');await page.locator('[data-ready="true"]').waitFor();
 const click=name=>page.getByRole('button',{name,exact:true}).click();
 const events=()=>page.evaluate(()=>window.soundProbe.events);
 const clear=()=>page.evaluate(()=>{window.soundProbe.events=[];window.soundProbe.stops=0;});
 await click('Unmute');await page.waitForTimeout(100);await clear();
 for(const [button,duration] of [['One die',.34],['Five dice',.38]]){
  await clear();await click(button);await page.waitForTimeout(650);assert.equal((await events()).length,0,button+' before landing');
  await page.waitForTimeout(600);const list=await events();assert.equal(list.length,1,button);assert(Math.abs(list[0].duration-duration)<.001);
  assert.equal(await page.locator('[data-die-final-value="true"]').count(),button==='One die'?1:5);checks.push(button+' plays approved sample on visible landing');
 }
 await clear();await click('Prepare flip');await page.waitForTimeout(100);assert.equal((await events()).length,0);
 await click('Flip');await page.waitForTimeout(180);assert.equal((await events()).length,1);assert(Math.abs((await events())[0].duration-.14)<.001);
 await click('Rerender');await page.waitForTimeout(650);assert.equal((await events()).length,1);checks.push('Real Holm CSS flip starts one Soft Card Clip; rerender silent');
 for(const [button,duration] of [['Prepare Mega flip',.14],['Prepare Mega slide',.18]]){
  await clear();await click(button);await page.waitForTimeout(100);assert.equal((await events()).length,0);
  await click('Flip');await page.waitForTimeout(450);assert.equal((await events()).length,1,button);assert(Math.abs((await events())[0].duration-duration)<.001);
  await click('Rerender');await page.waitForTimeout(100);assert.equal((await events()).length,1);checks.push(button+' uses its actual native animation once');
 }
 await clear();await click('Move peg');await page.waitForTimeout(250);assert.equal((await events()).length,0);
 await page.waitForTimeout(400);assert.equal((await events()).length,1);assert(Math.abs((await events())[0].duration-.12)<.001);checks.push('Wooden Peg A at actual left-transition completion');
 await clear();await click('Score pairs');await page.waitForTimeout(1550);assert.equal((await events()).length,2,'one two-tone highlight');
 assert.equal(await page.locator('[data-card-highlighted="true"]').count(),2);await click('Rerender');await page.waitForTimeout(200);assert.equal((await events()).length,2);
 await page.waitForTimeout(2200);assert.equal((await events()).length,4);checks.push('Two real Cribbage pair highlights, one fixed dyad each, no rerender/count-up sound');
 await clear();await click('Cracked');await page.waitForTimeout(100);assert.equal((await events()).filter(e=>e.kind==='sample'&&Math.abs(e.duration-.8)<.001).length,1);checks.push('Recorded Glass starts with cracked overlay');
 await page.waitForTimeout(1000);await clear();await click('Winner');await page.waitForTimeout(70);assert.equal((await events()).length,1);assert(Math.abs((await events())[0].duration-1.25)<.001);
 await click('Mute');assert((await page.evaluate(()=>window.soundProbe.stops))>0);await click('Unmute');await page.waitForTimeout(150);assert.equal((await events()).length,1);checks.push('Winner A duration; mid-sample mute stops source and unmute does not replay');
 await clear();await click('Dense deal');await page.waitForTimeout(250);assert.equal((await events()).length,1);await page.waitForTimeout(200);assert.equal((await events()).length,1);checks.push('20 simultaneous card edges grouped to one Paper Slide B');
 await click('Hide surface');await clear();await click('One die');await page.waitForTimeout(1250);assert.equal((await events()).length,0);await click('Hide surface');await page.waitForTimeout(200);assert.equal((await events()).length,0);checks.push('Hidden animated dice remain silent after returning to the surface');
 await page.screenshot({path:output+'/integration.png'});assert.deepEqual(errors,[]);
 writeFileSync(output+'/browser-report.json',JSON.stringify({browser:'installed Microsoft Edge',checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
