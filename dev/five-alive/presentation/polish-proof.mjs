import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {observeAwards,assertAwards} from './acceptance.mjs';
const base='http://127.0.0.1:5196',output=resolve('qualification.local/five-alive/polish');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[],external=[],evidence={};
await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
await page.addInitScript(observeAwards);
await page.addInitScript(()=>{
 window.polishEvents=[];window.polishAudio=[];
 const NativeContext=window.AudioContext;window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.polishAudioContext=this;}};
 const original=OscillatorNode.prototype.start;
 OscillatorNode.prototype.start=function(at){window.polishAudio.push({time:performance.now(),at,hz:this.frequency.value});return original.call(this,at);};
 for(const type of ['animationstart','animationend'])document.addEventListener(type,event=>{
  if(!event.animationName.startsWith('five-alive-'))return;
  const el=event.target,tiles=[...el.parentElement.querySelectorAll('.five-alive-tile')];
  window.polishEvents.push({type,name:event.animationName,column:tiles.indexOf(el),time:performance.now(),colors:tiles.map(t=>t.dataset.color)});
 },true);
});
const idle=()=>page.waitForFunction(()=>!!document.querySelector('.five-alive-keyboard')&&!document.querySelector('.five-alive-keyboard button:disabled'));
const letters=()=>page.locator('.five-alive-row').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('.five-alive-tile')].map(el=>el.textContent).join('')));
try{
 await fetch(base+'/fixture/reset?mode=arcade',{method:'POST'});await page.goto(base+'/dev/five-alive/presentation/polish.html');await idle();
 assert.equal(new URL(page.url()).origin,base);
 await page.getByRole('button',{name:'Enable sounds',exact:true}).click();await page.waitForFunction(()=>window.polishAudioContext?.state==='running');
 evidence.layouts=[];
 for(const [name,width,height] of [['narrow',320,568],['phone',390,844],['tablet',768,1024],['laptop',1366,768]]){
  await page.setViewportSize({width,height:height+600});await page.getByLabel('Preview size').selectOption(name);
  const geometry=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   const get=s=>rect(document.querySelector(s));
   return {game:get('#preview-game'),grid:get('.five-alive-grid'),keyboard:get('.five-alive-keyboard'),helper:get('.five-alive-points'),tiles:[...document.querySelectorAll('.five-alive-tile')].map(rect),keys:[...document.querySelectorAll('.five-alive-keyboard button')].map(rect),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(geometry.game.width,width);assert.equal(geometry.game.height,height);assert.equal(geometry.overflow,false);
  assert.ok(geometry.tiles.every(t=>Math.abs(t.width-t.height)<.1&&t.width>=32),'square readable tiles');
  assert.ok(geometry.keys.every(k=>k.height>=44&&k.width>=24),'comfortable tap targets');
  const gap=geometry.keyboard.y-geometry.grid.bottom;assert.ok(gap>=0&&gap<=8,'close keyboard');
  assert.ok(geometry.keyboard.bottom<=geometry.game.bottom-7,'bottom safe spacing');
  assert.ok(geometry.helper.x>=geometry.game.x&&geometry.tiles.every(t=>t.right<=geometry.game.right),'no horizontal clipping');
  const screenshot=output+'/'+name+'.png';await page.locator('#preview-game').screenshot({path:screenshot});
  evidence.layouts.push({name,width,height,tile:geometry.tiles[0].width,key:geometry.keys[0],gap,screenshot});
 }
 await page.setViewportSize({width:1000,height:1100});await page.getByLabel('Preview size').selectOption('phone');
 await page.getByRole('button',{name:'Invalid word',exact:true}).click();await page.getByText('Not in the word list. Try another word.').waitFor();
 await page.waitForFunction(()=>window.polishEvents.some(e=>e.name==='five-alive-invalid'&&e.type==='animationend'));
 assert.equal((await letters())[0],'ZZZZZ');assert.equal((await letters())[1],'');
 assert.ok((await page.evaluate(()=>window.polishAudio)).length>0);await page.keyboard.press('Backspace');await page.keyboard.type('A');assert.equal((await letters())[0],'ZZZZA');
 const invalidGap=await page.evaluate(()=>document.querySelector('.five-alive-keyboard').getBoundingClientRect().top-document.querySelector('.five-alive-grid').getBoundingClientRect().bottom);assert.ok(invalidGap>=0&&invalidGap<=8);
 evidence.invalid={editable:true,advanced:false,sound:true,keyboardGap:invalidGap};
 await page.evaluate(()=>{window.polishEvents=[];window.polishAudio=[];});
 await page.getByRole('button',{name:'Wrong guess',exact:true}).click();
 await page.waitForFunction(()=>!!document.querySelector('[data-helper=burst]'));await page.locator('#preview-game').screenshot({path:output+'/helper-burst.png'});await idle();
 const events=await page.evaluate(()=>window.polishEvents),starts=events.filter(e=>e.type==='animationstart');
 assert.deepEqual(starts.map(e=>e.name),[...Array.from({length:5},()=>['five-alive-flip-close','five-alive-flip-open']).flat(),'five-alive-helper-burst','five-alive-helper-drop']);
 assert.deepEqual(starts.filter(e=>e.name==='five-alive-flip-close').map(e=>e.column),[0,1,2,3,4]);
 const expected=['absent','absent','present','absent','correct'];
 for(const event of starts.filter(e=>e.name==='five-alive-flip-open'))assert.deepEqual(event.colors,expected.map((c,i)=>i<=event.column?c:''));
 const final=events.find(e=>e.type==='animationend'&&e.name==='five-alive-flip-open'&&e.column===4),burst=starts.find(e=>e.name==='five-alive-helper-burst'),burstEnd=events.find(e=>e.type==='animationend'&&e.name==='five-alive-helper-burst'),drop=starts.find(e=>e.name==='five-alive-helper-drop');
 assert.ok(burst.time>=final.time);assert.ok(drop.time>=burstEnd.time);
 const sounds=await page.evaluate(()=>window.polishAudio);assert.equal(sounds.length,4);assert.ok(sounds[0].time>=final.time);assert.ok(sounds[2].time>=burstEnd.time);
 evidence.wrong={events,sounds};assert.equal((await letters())[0],'STARE');
 await page.keyboard.type('AMPLE');await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));await idle();
 await page.getByRole('button',{name:'Reconnect',exact:true}).click();await idle();assert.deepEqual((await letters()).slice(0,2),['STARE','AMPLE']);await page.reload();await idle();assert.deepEqual((await letters()).slice(0,2),['STARE','AMPLE']);
 evidence.history='two completed rows retained after reconnect and reload';
 evidence.solves=[];
 for(let n=1;n<=6;n++){
  await page.evaluate(()=>{window.fiveAliveAwards=[];window.polishAudio=[];});
  await page.getByRole('button',{name:'Solve '+n,exact:true}).click();await page.locator('.five-alive-award').waitFor();
  assert.equal(await page.locator('.five-alive-award').getAttribute('data-solve'),String(n));
  await page.getByText('You completed in '+n,{exact:true}).waitFor();
  await page.locator('.five-alive-award').waitFor({state:'detached'});await idle();
  const awards=await assertAwards(page),audio=await page.evaluate(()=>window.polishAudio);
  assert.ok(audio.length>2);const hold=awards[0];
  assert.ok(audio.filter(a=>a.time>hold.shownAt+2500).every(a=>a.time-hold.shownAt>=5000),'count sound after full hold');
  evidence.solves.push({guess:n,awards,audio});
 }
 await page.getByRole('button',{name:'Mute sounds',exact:true}).click();await page.getByRole('button',{name:'Enable sounds',exact:true}).waitFor();
 await page.evaluate(()=>{window.polishAudio=[];});await page.getByRole('button',{name:'Wrong guess',exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('[data-reveal]'));await idle();
 await page.getByRole('button',{name:'Solve 1',exact:true}).click();await page.locator('.five-alive-award').waitFor();await page.locator('.five-alive-award').waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>window.polishAudio),[]);evidence.mute='wrong helper, bink, success and count all silent';
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Wrong guess',exact:true}).click();await page.getByText('+700',{exact:true}).waitFor();await idle();
 assert.equal((await letters())[0],'STARE');evidence.reducedMotion='helper chain completes and unlocks';
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);evidence.errors=errors;evidence.externalRequests=external;evidence.status='passed';
 writeFileSync(output+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,layouts:evidence.layouts,solves:evidence.solves.map(s=>({guess:s.guess,hold:s.awards[0].firstCountAt-s.awards[0].shownAt})),mute:evidence.mute,output},null,2));
}catch(error){writeFileSync(output+'/failure.json',JSON.stringify({message:error.message,evidence,errors,external},null,2));await page.screenshot({path:output+'/failure.png',fullPage:true});throw error;}
finally{await browser.close();}
