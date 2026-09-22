import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {cleanLocalFarkleGame} from './localDatabase';

import {farkleCommittedHolds} from '../../src/lib/farkle/presentation';

// Qualification-only harness. Uses the actual client and normal authoritative RPCs.
test('fresh client reconstructs committed holds after Roll N',async({browser},info)=>{
 const cfg=JSON.parse(fs.readFileSync('runtime-farkle.local/status.json','utf8'));
 if(cfg.API_URL!=='http://127.0.0.1:57321')throw Error('Isolated API required');
 const accounts=JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json','utf8'));
 const api=createClient(cfg.API_URL,cfg.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));let gameId:string|undefined;
 const stages:any[]=[];const coverage={partial:false,rollN:false,hot:false,farkle:false,remote:false,history:false};
 try{
  for(const [i,p] of pages.entries()){
   await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);
   await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  }
  await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
  await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
  await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];
  await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
  // Both seated participants explicitly opt into the next game if sat out.
  for(const page of pages){
    const rejoin=page.getByRole('button',{name:'Return to Play',exact:true});
    if(await rejoin.isVisible())await rejoin.click();
  }
  await expect(pages[0].locator('[data-start-game-btn]')).toBeVisible({timeout:15000});
  await pages[0].locator('[data-start-game-btn]').click();let dealer=pages[0];
  await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75_000}).toBe(true);
  await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();await dealer.locator('[data-dealer-game-option="farkle"]').click();
  await dealer.getByLabel('Stake',{exact:true}).fill('2');await dealer.getByLabel('Target Score',{exact:true}).fill('10000');await dealer.getByLabel('Endgame',{exact:true}).selectOption('one_last_turn');
  await dealer.getByRole('button',{name:'Start TEST ONLY Game',exact:true}).click();
  await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
  for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  const read=async()=>{
   const r=await api.from('rounds').select('id,dealer_game_id,hand_number,farkle_state').eq('game_id',gameId!).order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;
   const p=await api.from('players').select('id,user_id,position,chips').eq('game_id',gameId!);if(p.error)throw p.error;
   return {round:r.data,state:r.data.farkle_state as any,players:p.data};
  };
  let snap=await read();
  const pageFor=(id:string)=>pages[accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===id)?.user_id)];
  let oracle:any=null;
  for(let attempt=0;attempt<8;attempt++){
   const actor=pageFor(snap.state.currentTurnPlayerId);
   const firstSeq=snap.state.actionSequence;
   await actor.getByRole('button',{name:'Roll '+snap.state.available.length,exact:true}).click();
   await expect.poll(async()=>(await read()).state.actionSequence).toBe(firstSeq+1);snap=await read();
   if(snap.state.stage!=='hold'){stages.push({kind:'natural-first-roll-farkle',state:snap.state});continue;}
   const beforeHold=structuredClone(snap.state);
   const hold=snap.state.legalHolds.find((h:any)=>h.indexes.length<snap.state.available.length);
   if(!hold)throw Error('No partial hold in natural roll; no authority was altered');
   for(const index of hold.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${index}"]`).click();
   await actor.getByRole('button',{name:/^Hold Dice/}).click();
   await expect.poll(async()=>(await read()).state.actionSequence).toBe(beforeHold.actionSequence+1);snap=await read();
   const afterHold=structuredClone(snap.state);
   expect(afterHold.available).toEqual(beforeHold.available.filter((i:number)=>!hold.indexes.includes(i)));
   expect(afterHold.thisTurn).toBe(beforeHold.thisTurn+hold.points);
   await expect(actor.getByLabel('Committed scoring dice')).toContainText('+'+hold.points);
   await actor.getByRole('button',{name:'Roll '+afterHold.available.length,exact:true}).click();
   await expect.poll(async()=>(await read()).state.actionSequence).toBe(afterHold.actionSequence+1);snap=await read();
   stages.push({kind:'roll-hold-rollN',beforeHold,afterHold,afterRoll:snap.state});
   if(snap.state.stage!=='hold')continue; // A genuine Farkle ends the turn; obtain an active-turn reconnect example.
   const peer=pages.find(page=>page!==actor)!;
   await expect(peer.locator('[data-farkle-active-area]')).toHaveCount(0);
   await expect(peer.locator('[data-farkle-scoreboard="pane"]')).toBeVisible();
   await expect(peer.locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
   await expect.poll(()=>peer.locator('[data-farkle-roll-phase]').evaluate(stage=>{
    const box=stage.getBoundingClientRect(),dice=[...stage.querySelectorAll('.farkle-remote-die')].map(d=>d.getBoundingClientRect());
    const centers=dice.map(d=>d.x+d.width/2),center=(centers[0]+centers[centers.length-1])/2;
    return Math.max(Math.abs(center-(box.x+box.width/2)),...centers.slice(1).map((x,i)=>Math.abs(x-centers[i]-box.width/6)));
   })).toBeLessThan(2);
   await peer.screenshot({path:info.outputPath('remote-roll-n.png')});
   oracle={round:snap.round,afterRoll:structuredClone(snap.state),afterHold,beforeHold,
    expectedHold:{sequence:afterHold.actionSequence,dice:beforeHold.dice.filter((d:any)=>hold.indexes.includes(d.index)),points:hold.points,rollNumber:beforeHold.rollNumber},
    accountIndex:accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===beforeHold.currentTurnPlayerId)?.user_id)};
   break;
  }
  expect(oracle,'A natural non-Farkle second roll is required').not.toBeNull();
  // Discard every original context. No storageState, browser cache, React state,
  // presentation memory or replay data is transferred to the reconnecting client.
  await Promise.all(contexts.map(c=>c.close()));
  const fresh=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(fresh);
  expect(await fresh.storageState()).toEqual({cookies:[],origins:[]});
  const p=await fresh.newPage();const account=accounts[oracle.accountIndex];
  await p.goto('/auth');await p.locator('#login-email').fill(account.email);await p.locator('#login-password').fill(account.password);
  await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  const frameResponse=p.waitForResponse(r=>r.url().endsWith('/rpc/read_session_frame')&&r.request().method()==='POST'&&r.request().postDataJSON().p_game_id===gameId);
  const replayResponse=p.waitForResponse(r=>r.url().endsWith('/rpc/farkle_read_replay')&&r.request().method()==='POST'&&r.request().postDataJSON().p_round_id===oracle.round.id);
  await p.goto(`/game/${gameId}`);
  const frameHttp=await frameResponse;expect(frameHttp.ok()).toBe(true);const frame=await frameHttp.json();
  const replayHttp=await replayResponse;expect(replayHttp.ok()).toBe(true);const replay=await replayHttp.json();
  const round=frame.game.rounds.find((r:any)=>r.id===oracle.round.id);expect(round).toBeDefined();
  const state=round.farkle_state;
  const reconstructed=farkleCommittedHolds(replay.events,state);
  expect(reconstructed).toEqual([oracle.expectedHold]);
  expect(replay.roundId).toBe(round.id);expect(replay.dealerGameId).toBe(round.dealer_game_id);
  expect(replay.config).toEqual(state.config);expect(state.config.testOnly).toBe(true);
  expect(state.available).toEqual(oracle.afterHold.available);
  expect(state.dice).toEqual(oracle.afterRoll.dice);
  expect(state.dice.map((d:any)=>d.index)).toEqual(state.available);
  expect(state.dice.some((d:any)=>oracle.expectedHold.dice.some((h:any)=>h.index===d.index))).toBe(false);
  expect(state.thisTurn).toBe(oracle.afterHold.thisTurn);
  expect(reconstructed.reduce((sum,h)=>sum+h.points,0)).toBe(state.thisTurn);
  expect(state.rollNumber).toBe(oracle.afterHold.rollNumber+1);
  expect(state.scoringCycle).toBe(oracle.afterHold.scoringCycle);
  const holdReceipt=replay.events.find((f:any)=>f.sequence===oracle.expectedHold.sequence);
  expect(holdReceipt.stateAfter.scoringCycle).toBe(oracle.beforeHold.scoringCycle);
  expect(state.actionSequence).toBe(oracle.afterRoll.actionSequence);
  const text=oracle.expectedHold.dice.map((d:any)=>d.value).join(' · ')+' +'+oracle.expectedHold.points;
  await expect(p.getByLabel('Committed scoring dice')).toHaveText(text);
  await expect(p.getByText('THIS TURN '+state.thisTurn,{exact:true}).first()).toBeVisible();
  for(const die of state.dice)await expect(p.locator(`[data-farkle-active-area] [data-farkle-die-index="${die.index}"]`)).toHaveAttribute('aria-label',`Die ${die.index+1}: ${die.value}`);
  expect((await read()).state).toEqual(oracle.afterRoll);
  stages.push({kind:'fresh-context-authoritative-reconstruction',utc:new Date().toISOString(),frame,replay,reconstructed,
   renderedCommitted:await p.getByLabel('Committed scoring dice').innerText(),currentRoll:state.dice,available:state.available,
   thisTurn:state.thisTurn,rollNumber:state.rollNumber,scoringCycle:state.scoringCycle,source:'fresh authenticated session frame plus fresh authenticated durable replay RPC',passed:true});
  await p.screenshot({path:info.outputPath('fresh-held-row.png')});
 }finally{
  fs.writeFileSync(info.outputPath('hold-reconnect.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),stages},null,2));
  try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
 }
});
