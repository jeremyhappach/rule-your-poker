import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {connect,localContext} from './database.mjs';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),db=await connect(localContext().database),errors=[];
const post=async(op,body)=>{const r=await fetch('http://127.0.0.1:5191/__tripFlip/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;};
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5191/dev/trip-flip/live.html');await page.getByRole('button',{name:'Start solo Arcade'}).click();
 await page.locator('.trip-bank:not([disabled])').waitFor({timeout:15000});const f=Object.fromEntries(new URL(page.url()).searchParams);let state=await post('state',f);const front=state.view.fan[0],stock=state.view.stockRemaining;
 await page.locator('.trip-fan [data-front=true]').click();assert.equal(await page.locator('.trip-fan [data-selected=true]').count(),1);
 await page.getByRole('button',{name:'Column 1, 0 cards',exact:true}).click();await page.waitForTimeout(250);state=await post('state',f);assert.deepEqual(state.view.columns[0],[front]);assert.equal(state.view.stockRemaining,stock-1);
 await page.locator('.trip-columns [data-card]').first().click();await page.getByRole('button',{name:'Flip 1: empty',exact:true}).click();await page.waitForTimeout(250);state=await post('state',f);assert.equal(state.view.cells[0],front);assert.deepEqual(state.view.columns[0],[]);
 await page.reload();await page.locator('.trip-bank:not([disabled])').waitFor();assert.equal(await page.locator('[data-selected=true]').count(),0);await page.screenshot({path:'qualification.local/trip-flip/solo-play.png'});
 for(let round=1;round<=2;round++){await page.locator('.trip-bank:not([disabled])').waitFor();state=await post('state',f);assert.equal(state.view.round,round);await page.locator('.trip-bank').click();await page.locator('.trip-result').waitFor();if(round<2)await page.locator('.trip-result').waitFor({state:'hidden',timeout:12000});}
 await page.getByRole('heading',{name:'Trip Flip leaderboard'}).waitFor({timeout:15000});assert.equal((await db.query('SELECT count(*) n FROM private.arcade_results WHERE run_id=$1',[f.id])).rows[0].n,'1');
 const m=await post('new',{solo:false}),p1=await browser.newPage({viewport:{width:390,height:844}}),p2=await browser.newPage({viewport:{width:390,height:844}}),watcher=await browser.newPage({viewport:{width:320,height:568}});
 for(const [p,user] of [[p1,m.user],[p2,m.other],[watcher,m.watcher]]){p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5191/dev/trip-flip/live.html?'+new URLSearchParams({...m,user}));}
 await p1.bringToFront();await p1.locator('.trip-bank:not([disabled])').waitFor({timeout:15000});assert.ok(await p2.locator('.trip-bank').isDisabled());assert.ok(await watcher.locator('.trip-bank').isDisabled());
 const observed=await post('state',{...m,user:m.watcher});assert.ok(!('deck' in observed)&&!('cursor' in observed));await p1.screenshot({path:'qualification.local/trip-flip/multiplayer-play.png'});
 for(let turn=0;turn<4;turn++){
  const active=turn%2===0?p1:p2;await active.bringToFront();await active.locator('.trip-bank:not([disabled])').waitFor({timeout:15000});await active.locator('.trip-bank').click();await active.locator('.trip-result').waitFor();
  await db.query("UPDATE private.trip_flip_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)),revision=revision+1 WHERE dealer_game_id=$1",[m.id]);
 }
 await p1.getByRole('heading',{name:'Trip Flip',exact:true}).waitFor({timeout:15000});const settled=(await db.query('SELECT settlement,finished FROM private.trip_flip_matches WHERE dealer_game_id=$1',[m.id])).rows[0];assert.ok(settled.settlement);assert.equal(settled.finished,true);
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/trip-flip/browser.json',JSON.stringify({passed:true,solo:f.id,multiplayer:m.id,errors}));console.log('PASS real UI fan/column/cell moves, reload, both Arcade rounds, leaderboard, observer redaction, four multiplayer turns and terminal continuation');
}finally{await browser.close();await db.end();}
