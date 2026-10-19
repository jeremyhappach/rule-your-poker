import {chromium} from '@playwright/test';import {existsSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';import {connect,localContext} from './database.mjs';
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync),browser=await chromium.launch({headless:true,executablePath}),db=await connect(localContext().database),errors=[];
const post=async(op,body)=>{const r=await fetch('http://127.0.0.1:5187/__takeTwo/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(JSON.stringify(v));return v;};
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5187/dev/take-two/live.html');await page.getByRole('button',{name:'Start solo Arcade'}).click();
 await page.locator('.take-stock:not([disabled])').waitFor({timeout:15000});
 const f=Object.fromEntries(new URL(page.url()).searchParams);let state=await post('state',f);assert.equal(state.view.slots.length,28);
 // Real UI actions with authoritative public legal pairs. No fixture formula drives scores.
 while(!state.view.legalPairs.length){await page.locator('.take-stock').click();await page.waitForTimeout(200);state=await post('state',f);}
 const pair=state.view.legalPairs[0],before=state.view.score;
 for(const i of pair){if(i===-1)await page.locator('.take-current').click();else{const pos=state.view.layout[i];await page.getByRole('button',{name:new RegExp(`^Row ${pos.row+1}, card ${pos.column+1}:`)}).click();}}
 await page.waitForTimeout(250);state=await post('state',f);assert.equal(state.view.samePairs+state.view.consecutivePairs,1);assert.ok(state.view.score>=before+450);
 const score=state.view.score,stock=state.view.stockRemaining;await page.locator('.take-stock').click();await page.waitForTimeout(250);state=await post('state',f);assert.equal(state.view.score,Math.max(0,score-100));assert.equal(state.view.stockRemaining,stock-1);
 await page.reload();await page.locator('.take-stock:not([disabled])').waitFor();assert.equal(await page.locator('[data-selected=true]').count(),0);
 await page.screenshot({path:'qualification.local/take-two/solo-play.png'});
 for(let round=1;round<=3;round++){
  await page.locator('.take-bank:not([disabled])').waitFor();state=await post('state',f);assert.equal(state.view.round,round);assert.equal(state.view.slots.length,round===1?28:33);
  await page.locator('.take-bank').click();await page.locator('.take-result').waitFor();
  if(round<3)await page.locator('.take-result').waitFor({state:'hidden',timeout:12000});
 }
 await page.getByRole('heading',{name:'Take 2 leaderboard'}).waitFor({timeout:15000});assert.equal((await db.query('SELECT count(*) n FROM private.arcade_results WHERE run_id=$1',[f.id])).rows[0].n,'1');
 const m=await post('new',{solo:false}),p1=await browser.newPage({viewport:{width:844,height:390}}),p2=await browser.newPage({viewport:{width:844,height:390}});
 for(const p of [p1,p2])p.on('pageerror',e=>errors.push(e.message));
 await p1.goto('http://127.0.0.1:5187/dev/take-two/live.html?'+new URLSearchParams(m));await p2.goto('http://127.0.0.1:5187/dev/take-two/live.html?'+new URLSearchParams({...m,user:m.other}));
 await p1.locator('.take-stock:not([disabled])').waitFor({timeout:15000});assert.ok(await p2.locator('.take-stock').isDisabled());
 await p1.screenshot({path:'qualification.local/take-two/multiplayer-play.png'});
 // Fast-forward only this isolated test match's authoritative deadline between UI turns.
 for(let turn=0;turn<6;turn++){
  const active=turn%2===0?p1:p2;await active.locator('.take-bank:not([disabled])').waitFor({timeout:15000});await active.locator('.take-bank').click();await active.locator('.take-result').waitFor();
  await db.query("UPDATE private.take_two_matches SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1)),revision=revision+1 WHERE dealer_game_id=$1",[m.id]);
 }
 await p1.getByRole('heading',{name:'Take 2',exact:true}).waitFor({timeout:15000});
 const settled=(await db.query('SELECT settlement,finished FROM private.take_two_matches WHERE dealer_game_id=$1',[m.id])).rows[0];assert.ok(settled.settlement);assert.equal(settled.finished,true);
 assert.deepEqual(errors,[]);writeFileSync('qualification.local/take-two/browser.json',JSON.stringify({passed:true,solo:f.id,multiplayer:m.id,errors}));console.log('Browser passed: legal pair, draw, reload, all solo rounds, leaderboard, active-player ownership, all multiplayer turns and terminal continuation');
}finally{await browser.close();await db.end();}
