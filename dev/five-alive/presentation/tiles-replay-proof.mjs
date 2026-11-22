import {chromium} from 'playwright';
import {createReviewServer} from '../../async-combined/review-server.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output='qualification.local/five-alive/tiles-replay';mkdirSync(output,{recursive:true});
const port=15512,base='http://127.0.0.1:'+port,server=await createReviewServer({port,preview:true,cacheDir:'node_modules/.vite-five-alive-tiles'});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],layouts=[],calls=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const result={answer:'APPLE',difficulty:4,solved:true,score:980,completed:true,guesses:[{word:'STARE',feedback:['absent','absent','present','absent','correct']},{word:'APPLE',feedback:Array(5).fill('correct')}]};
 const prior={own:{...result,difficulty:1,score:560},opponent:{...result,difficulty:1,score:392,guesses:[result.guesses[0],result.guesses[0],result.guesses[1]]}};
 const home={id:'match',status:'active',revision:4,organizer:'me',opponent:'other',players:[{id:'me',name:'Jeremy'},{id:'other',name:'Hap'}],net:0,unsettled:1,exposure:1,acceptedAt:new Date().toISOString(),completed:0,serverAt:Date.now(),realMoney:false,lineup:[{id:'child',ordinal:1,game:'five-alive',revision:4,actor:'other',terminal:false,stake:1,viewed:true,scores:{me:560,other:392},expiresAt:new Date(Date.now()+36*3600000).toISOString(),pendingResults:{other:0}}]};
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname!=='/fixture-review-api')return route.continue();const b=route.request().postDataJSON();calls.push(b);let value;
  if(b.op==='state')value={id:'child',revision:4,view:{round:2,ownFinished:2,opponentFinished:1,ownResult:result,revealed:[prior]}};
  else if(b.name==='delayed_home')value=home;else if(b.name==='notification_preferences')value={};else if(b.name==='async_push_preference'&&b.args?.p_enabled===undefined)value=false;else throw Error('Unexpected request '+JSON.stringify(b));await route.fulfill({json:value});
 });
 await page.goto(base+'/dev/five-alive/presentation/tiles.html');await page.locator('.async-picker-grid .midnight-tile').last().waitFor();await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 for(const width of [320,375,390,430,585]){
  await page.setViewportSize({width,height:844});const measured=await page.evaluate(()=>{
   const tiles=[...document.querySelectorAll('.async-picker-grid .midnight-tile')],sizes=tiles.map(t=>{const r=t.getBoundingClientRect();return [Math.round(r.width*10)/10,Math.round(r.height*10)/10];});
   const titles=tiles.filter(t=>!t.querySelector('[data-loaded],.five-alive-logo,.async-words-logo')).map(t=>{const title=t.querySelector('.async-brand-name'),rect=title.getBoundingClientRect(),tile=t.getBoundingClientRect();return {text:title.textContent,fit:rect.width<=tile.width&&rect.height<=tile.height&&title.scrollWidth<=title.clientWidth+1};});
   return {width:innerWidth,sizes,titles,overflow:document.documentElement.scrollWidth>innerWidth};
  });assert.equal(new Set(measured.sizes.map(s=>s.join(':'))).size,1);assert.equal(measured.overflow,false);assert.ok(measured.titles.every(t=>t.fit),JSON.stringify(measured));layouts.push(measured);if(width===320)await page.screenshot({path:output+'/picker-320.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/picker.png',fullPage:true});
 await page.goto(base+'/delayed/match');await page.getByRole('button',{name:'View Last Word',exact:true}).waitFor();const card=page.locator('.delayed-game-card');assert.equal(await card.getByText(/APPLE|points/).count(),0);assert.match(await card.innerText(),/You: 2 of 3 finished · Hap: 1 of 3 finished/);await card.screenshot({path:output+'/match-tile.png'});
 await page.getByRole('button',{name:'View Last Word',exact:true}).click();await page.getByRole('heading',{name:'Your Word 2 replay'}).waitFor();assert.equal(await page.getByLabel('Keyboard').count(),0);assert.equal(await page.getByLabel('Guess board').innerText(),'S\nT\nA\nR\nE');
 await page.getByText('2 guesses',{exact:true}).waitFor();await page.screenshot({path:output+'/last-word-award.png'});await page.locator('.five-alive-award').waitFor({state:'hidden',timeout:10000});assert.match(await page.locator('.five-alive-last-result').innerText(),/980 points/);await page.screenshot({path:output+'/last-word-replay.png'});
 await page.getByRole('button',{name:'View Words',exact:true}).click();await page.getByText('Hap: Pending',{exact:true}).waitFor();await page.getByRole('dialog').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});await page.waitForFunction(()=>[...document.querySelectorAll('.five-alive-score-line')].every(p=>p.firstElementChild.getBoundingClientRect().width<=p.getBoundingClientRect().width+1&&p.getBoundingClientRect().right<=innerWidth&&p.getBoundingClientRect().left>=0));}
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>[...document.querySelectorAll('.five-alive-score-line')].every(p=>p.firstElementChild.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:output+'/word-history.png'});assert.ok(calls.every(b=>b.op==='state'||['delayed_home','notification_preferences','async_push_preference'].includes(b.name)));assert.deepEqual(errors,[]);writeFileSync(output+'/evidence.json',JSON.stringify({layouts,passiveReplay:true,historyPending:true,calls,errors},null,2));console.log(JSON.stringify({widths:layouts.map(l=>l.width),uniformTiles:true,passiveReplay:true,historyPending:true,errors}));
}finally{await browser.close();await server.close();}
