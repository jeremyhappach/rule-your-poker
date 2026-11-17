import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {observeAwards,assertAwards,assertPhoneLayout} from './acceptance.mjs';
const base=process.argv[2]??'http://127.0.0.1:5184',url=base+'/dev/five-alive/presentation/index.html';
const output=resolve('qualification.local/five-alive/presentation');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],external=[],evidence={};
async function open(mode,player='a',reducedMotion='no-preference'){
 const context=await browser.newContext({viewport:{width:460,height:900},reducedMotion});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();external.push(route.request().url());return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(observeAwards);
 await page.addInitScript(()=>{
  window.flipEvents=[];
  for(const type of ['animationstart','animationend'])document.addEventListener(type,event=>{
   if(!event.animationName.startsWith('five-alive-flip-'))return;
   const tile=event.target,row=tile.parentElement;
   const animation=tile.getAnimations().find(animation=>animation.animationName===event.animationName);
   window.flipEvents.push({type,name:event.animationName,column:[...row.children].indexOf(tile),word:row.textContent,colors:[...row.children].map(x=>x.dataset.color),time:performance.now(),duration:animation?.effect.getTiming().duration,transforms:animation?.effect.getKeyframes().map(frame=>frame.transform)});
  });
 });
 await page.goto(url+'?mode='+mode+'&player='+player);assert.equal(new URL(page.url()).origin,base);
 await page.getByLabel('Guess board').waitFor();return {context,page};
}
async function guess(page,word){await page.getByRole('button',{name:'Enter',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.five-alive-keyboard button:disabled'));await page.keyboard.type(word);await page.keyboard.press('Enter');}
async function idle(page){await page.waitForFunction(()=>!document.querySelector('[data-reveal],.five-alive-award')&&!document.querySelector('.five-alive-keyboard button:disabled'));}
const rows=page=>page.locator('.five-alive-tiles').allTextContents();
try{
 await fetch(base+'/fixture/reset?mode=arcade',{method:'POST'});
 const arcade=await open('arcade');await guess(arcade.page,'STARE');
 await arcade.page.waitForFunction(()=>document.querySelectorAll('.five-alive-row:first-child [data-color]:not([data-color=""])').length===2);
 await arcade.page.screenshot({path:output+'/sequential-reveal.png'});
 await idle(arcade.page);
 const events=await arcade.page.evaluate(()=>window.flipEvents);const starts=events.filter(e=>e.type==='animationstart');
 assert.deepEqual(starts.map(e=>[e.column,e.name]),Array.from({length:5},(_,i)=>[[i,'five-alive-flip-close'],[i,'five-alive-flip-open']]).flat());
 for(const event of starts){assert.equal(event.duration,220);assert.deepEqual(event.transforms,event.name.endsWith('close')?['rotateY(0deg)','rotateY(90deg)']:['rotateY(90deg)','rotateY(0deg)']);}
 const keyColors=await arcade.page.evaluate(()=>Object.fromEntries(['Q','S','A','E'].map(letter=>[letter,getComputedStyle([...document.querySelectorAll('.five-alive-keyboard button')].find(key=>key.textContent===letter)).backgroundColor])));assert.deepEqual(keyColors,{Q:'rgb(211, 214, 218)',S:'rgb(58, 58, 60)',A:'rgb(197, 138, 0)',E:'rgb(7, 154, 35)'});evidence.keyColors=keyColors;
 const expected=['absent','absent','present','absent','correct'];
 for(const event of starts.filter(e=>e.name.endsWith('open')))assert.deepEqual(event.colors,expected.map((c,i)=>i<=event.column?c:''));
 for(let i=0;i<4;i++)assert.ok(events.find(e=>e.type==='animationend'&&e.column===i&&e.name.endsWith('open')).time<=starts.find(e=>e.column===i+1).time);
 await guess(arcade.page,'AMPLE');await idle(arcade.page);assert.deepEqual((await rows(arcade.page)).slice(0,2),['STARE','AMPLE']);
 await arcade.page.screenshot({path:output+'/persistent-history.png'});
 await arcade.page.reload();await arcade.page.getByLabel('Guess board').waitFor();assert.deepEqual((await rows(arcade.page)).slice(0,2),['STARE','AMPLE']);assert.equal((await arcade.page.evaluate(()=>window.flipEvents)).length,0);
 await arcade.page.getByRole('button',{name:'Reconnect',exact:true}).click();await idle(arcade.page);assert.deepEqual((await rows(arcade.page)).slice(0,2),['STARE','AMPLE']);
 await guess(arcade.page,'APPLE');await arcade.page.locator('.five-alive-award').waitFor();assert.deepEqual((await rows(arcade.page)).slice(0,3),['STARE','AMPLE','APPLE']);assert.match(await arcade.page.locator('.five-alive-round').textContent(),/Word 1/);
 await arcade.page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await idle(arcade.page);assert.match(await arcade.page.locator('.five-alive-round').textContent(),/Word 2/);assert.equal(await arcade.page.locator('.five-alive-score strong').textContent(),'392');
 evidence.awards=await assertAwards(arcade.page);
 evidence.phoneLayouts=[];
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932}]){
  await arcade.page.setViewportSize(viewport);
  await arcade.page.locator('.preview-frame').evaluate((el,height)=>{el.style.height=(height-el.getBoundingClientRect().top)+'px';},viewport.height);
  await arcade.page.locator('[data-shell-presentation-mode="fullscreen"]').evaluate(el=>{el.style.paddingBottom='24px';});
  evidence.phoneLayouts.push({viewport,...await assertPhoneLayout(arcade.page)});
 }
 await arcade.page.screenshot({path:output+'/phone-keyboard.png'});
 evidence.arcade={events,history:['STARE','AMPLE'],refresh:true,reconnect:true,correctAward:392,round:2};
 await arcade.context.close();

 await fetch(base+'/fixture/reset?mode=async',{method:'POST'});
 const a=await open('async'),b=await open('async','b');
 await guess(a.page,'STARE');await idle(a.page);await guess(b.page,'PLANT');await idle(b.page);
 assert.deepEqual((await rows(a.page)).slice(0,1),['STARE']);assert.deepEqual((await rows(b.page)).slice(0,1),['PLANT']);
 assert.equal((await a.page.locator('body').textContent()).includes('PLANT'),false);
 await guess(a.page,'APPLE');await a.page.getByText('Waiting for the other player.',{exact:true}).waitFor();
 assert.deepEqual((await rows(a.page)).slice(0,2),['STARE','APPLE']);await a.page.getByRole('button',{name:'Word Results',exact:true}).click();await a.page.getByText('Opponent: Waiting',{exact:true}).waitFor();assert.equal(await a.page.getByLabel('Answer APPLE').count(),1);assert.equal((await a.page.getByRole('dialog').textContent()).includes('STARE'),false);await a.page.getByRole('button',{name:'Close',exact:true}).click();
 await a.page.reload();await a.page.getByText('Waiting for the other player.',{exact:true}).waitFor();assert.deepEqual((await rows(a.page)).slice(0,2),['STARE','APPLE']);assert.equal((await a.page.evaluate(()=>window.flipEvents)).length,0);
 await a.page.screenshot({path:output+'/async-private-history.png'});
 await guess(b.page,'APPLE');await a.page.getByText('Opponent completed in 2',{exact:true}).waitFor();assert.equal((await a.page.locator('body').textContent()).includes('PLANT'),false);
 await a.page.reload();await a.page.getByText('Opponent completed in 2',{exact:true}).waitFor();assert.equal((await a.page.locator('body').textContent()).includes('PLANT'),false);
 await Promise.all([idle(a.page),idle(b.page)]);await a.page.getByRole('button',{name:'Word Results',exact:true}).click();await a.page.getByText('Opponent: 2 guesses · 700 × 0.8 = 560',{exact:true}).waitFor();assert.equal((await a.page.getByRole('dialog').textContent()).includes('PLANT'),false);assert.equal((await a.page.getByRole('dialog').textContent()).includes('STARE'),false);
 await a.page.screenshot({path:output+'/word-scorecard.png'});
 evidence.asyncAwards=await assertAwards(b.page);
 evidence.async={ownRowsA:['STARE','APPLE'],ownRowsB:['PLANT','APPLE'],opponentSealedUntilBothFinish:true,waitingRefresh:true,mutualHistory:true};
 await a.context.close();await b.context.close();

 await fetch(base+'/fixture/reset?mode=arcade',{method:'POST'});
 const reduced=await open('arcade','a','reduce');await guess(reduced.page,'STARE');await idle(reduced.page);assert.equal((await rows(reduced.page))[0],'STARE');
 await guess(reduced.page,'APPLE');await idle(reduced.page);evidence.reducedAwards=await assertAwards(reduced.page,{reduced:true});
 evidence.reducedMotion=true;await reduced.context.close();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 writeFileSync(output+'/proof.json',JSON.stringify({...evidence,errors,external,passed:true},null,2));console.log(JSON.stringify({passed:true,output,checks:['real CSS sequential flips','multiple retained rows','refresh','reconnect','correct award after reveal','Async owner privacy','mutual disclosure','reduced motion']}));
}finally{await browser.close();}
