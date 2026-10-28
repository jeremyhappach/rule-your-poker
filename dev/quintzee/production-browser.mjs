import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,executablePath}),errors=[],cases=[],base='http://127.0.0.1:15298';
const post=async(op,body)=>{const r=await fetch(base+'/__quintzee/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;};
try{
 for(const theme of ['classic','modern']){
  const f=await post('new',{solo:true,theme}),page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/dev/quintzee/production.html?'+new URLSearchParams(f));
  await page.locator('.q-roll:not([disabled])').waitFor({timeout:15000});assert.equal(await page.locator('[data-quintzee]').getAttribute('data-theme'),theme);
  const die=page.locator('.q-dice button').first();await die.click();const held=await die.getAttribute('aria-label');
  await page.locator('.q-roll').click();await page.locator('.q-dice [data-rolling=true]').first().waitFor();
  const start=Date.now();assert.equal(await die.getAttribute('data-rolling'),'false');
  await page.waitForTimeout(900);assert.ok(await page.locator('.q-dice [data-rolling=true]').count()>0);assert.equal(await die.getAttribute('aria-label'),held);
  await page.waitForFunction(()=>document.querySelectorAll('.q-dice [data-rolling=true]').length===0);assert.ok(Date.now()-start>=1200);
  await page.screenshot({path:'dev/quintzee/evidence/release/browser-'+theme+'.png'});
  await page.reload();await page.locator('.q-roll:not([disabled])').waitFor();assert.equal(await page.locator('.q-dice [data-rolling=true]').count(),0);
  await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('button',{name:'Keep Playing'}).click();assert.ok(page.url().includes('production.html'));
  await page.getByRole('button',{name:'Abandon',exact:true}).click();await page.getByRole('button',{name:'Abandon Game',exact:true}).click();await page.waitForURL('**/arcade/quintzee?result=*');
  const v=await post('state',f);assert.equal(v.status,'abandoned');cases.push(theme+': real solo adapter, theme, 1500ms rumble, held die stationary, reconnect, cancel/confirm abandonment, leaderboard route');await page.close();
 }
 const f=await post('new',{solo:false,theme:'modern'}),a=await browser.newPage(),b=await browser.newPage();for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 await a.goto(base+'/dev/quintzee/production.html?'+new URLSearchParams(f));await b.goto(base+'/dev/quintzee/production.html?'+new URLSearchParams({...f,user:f.other}));
 await a.locator('.q-roll:not([disabled])').waitFor({timeout:15000});assert.equal(await b.locator('.q-roll:not([disabled])').count(),0);
 await a.locator('.q-category[data-category="chance"]').click();await a.waitForFunction(()=>document.querySelector('[data-category="chance"]').getAttribute('data-banked')==='true');
 await b.waitForFunction(()=>document.querySelector('[data-category="chance"]').getAttribute('data-banked')==='true');
 await a.reload();await a.locator('.q-category[data-category="chance"][data-banked=true]').waitFor();
 await post('qualify',{...f,control:'pause',paused:true});await a.getByText('Paused',{exact:true}).first().waitFor();assert.equal(await a.locator('.q-roll:not([disabled])').count(),0);
 await post('qualify',{...f,control:'pause',paused:false});await a.locator('.q-roll:not([disabled])').waitFor();
 await post('qualify',{...f,control:'expire'});await a.locator('[data-session-ended=true]').waitFor({state:'attached',timeout:20000});assert.equal(await a.locator('.q-dice').count(),0);const terminal=await post('state',f);assert.ok(terminal.settlement);assert.equal(terminal.finished,true);
 cases.push('multiplayer pause/resume, zero-client timeout recovery, terminal callback and ended-phase artifact clearance in local host');
 cases.push('real multiplayer adapter: canonical shell, authorized score, inactive controls disabled, realtime delivery, reload continuity');const solo=await post('new',{solo:true,theme:'modern'}),end=await browser.newPage({viewport:{width:390,height:844}});end.on('pageerror',e=>errors.push(e.message));
 await end.goto(base+'/dev/quintzee/production.html?'+new URLSearchParams(solo));await end.locator('.q-roll:not([disabled])').waitFor();
 await post('qualify',{...solo,control:'no-match'});await end.reload();await end.locator('.q-roll:not([disabled])').waitFor();
 for(let i=0;i<4;i++)await end.locator('.q-dice button').nth(i).click();await end.locator('.q-roll').click();await end.locator('.q-dice [data-rolling=true]').waitFor();assert.equal(await end.locator('.q-result').count(),0);
 await end.waitForTimeout(800);assert.equal(await end.locator('.q-result').count(),0);await end.getByText('No more matches',{exact:true}).first().waitFor();
 await post('qualify',{...solo,control:'expire'});await end.waitForURL('**/arcade/quintzee?result=*',{timeout:20000});await end.locator('[data-leaderboard]').waitFor();
 const completed=await post('state',solo);assert.equal(completed.status,'completed');assert.ok(completed.completion);cases.push('final no-match roll retains rumble; solo expiry creates actual completion and reads leaderboard');
 assert.deepEqual(errors,[]);
 writeFileSync('dev/quintzee/evidence/release/browser.json',JSON.stringify({passed:true,local:true,at:new Date().toISOString(),cases,errors,limitations:['synthetic local authentication bridge','full main-route reload of ended session and deployed authentication remain unverified']},null,2));console.log('PASS '+cases.join('; '));
}finally{await browser.close();}
