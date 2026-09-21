import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {farkleCommittedHolds} from '../../src/lib/farkle/presentation';
import {createClient} from '@supabase/supabase-js';
import {cleanLocalFarkleGame} from './localDatabase';

// Qualification-only harness. Uses the actual client and normal authoritative RPCs.
test('partial holds, Roll N, Hot Dice, Farkle, remote stages, refresh and frozen replay',async({browser},info)=>{
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
  const observe=async(p:any)=>p.evaluate(()=>{
   const w=window as any;w.farkleQualification={phases:[],phaseEvents:[],notices:[]};
   new MutationObserver(()=>{
    const phase=document.querySelector('[data-farkle-roll-phase]')?.getAttribute('data-farkle-roll-phase');
    const log=w.farkleQualification;if(phase&&log.phases.at(-1)!==phase){log.phases.push(phase);log.phaseEvents.push({phase,utc:new Date().toISOString(),epochMs:performance.timeOrigin+performance.now()});}
    const notices=[...document.querySelectorAll('[data-canonical-announcement-content][data-canonical-announcement-type="gameplay_notice"]')].map(n=>n.textContent?.trim());
    for(const label of ['HOT DICE','FARKLE'])if(notices.includes(label)&&!log.notices.includes(label))log.notices.push(label);
   }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-farkle-roll-phase']});
  });
  for(const p of pages)await observe(p);
  let snap=await read();const frozen=snap.state.config;
  const pageFor=(id:string)=>pages[accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===id)?.user_id)];
  const refresh=async(label:string,p:any)=>{
   const before=await read();await p.reload();await expect(p.locator('[data-farkle-scope]')).toBeVisible();
   const after=await read();expect(after.state).toEqual(before.state);expect(after.players).toEqual(before.players);
   stages.push({kind:label,state:after.state});await observe(p);
  };
  for(let n=0;n<180&&!(coverage.partial&&coverage.rollN&&coverage.hot&&coverage.farkle&&coverage.remote);n++){
   const before=snap.state;const actor=pageFor(before.currentTurnPlayerId);const peer=pages.find(p=>p!==actor)!;
   if(before.stage==='hold'){
    let hold=[...before.legalHolds].sort((a:any,b:any)=>b.indexes.length-a.indexes.length||b.points-a.points)[0];
    if(!coverage.partial)hold=before.legalHolds.find((h:any)=>h.indexes.length<before.available.length)??hold;
    for(const i of hold.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${i}"]`).click();
    await actor.getByRole('button',{name:/^Hold Dice/}).click();
    await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
    expect(snap.state.thisTurn).toBe(before.thisTurn+hold.points);expect(snap.state.playerStates).toEqual(before.playerStates);
    await expect(actor.getByLabel('Committed scoring dice')).toContainText(`+${hold.points}`);
    if(hold.indexes.length<before.available.length&&!coverage.partial){
     expect(snap.state.available.length).toBe(before.available.length-hold.indexes.length);
     await expect(actor.getByRole('button',{name:`Roll ${snap.state.available.length}`,exact:true})).toBeEnabled();
     coverage.partial=true;await refresh('partial-hold-committed',actor);
    }
    if(snap.state.events.some((e:any)=>e.type==='hot_dice')){
     expect(snap.state.available).toEqual([0,1,2,3,4,5]);
     await expect.poll(()=>actor.evaluate(()=>(window as any).farkleQualification.notices.includes('HOT DICE'))).toBe(true);
     await refresh('hot-dice-bank-or-roll',actor);await refresh('hot-dice-peer-refresh',peer);coverage.hot=true;
    }
   }else{
    await peer.evaluate(()=>{(window as any).farkleQualification.phases=[];(window as any).farkleQualification.phaseEvents=[];});
    await actor.getByRole('button',{name:`Roll ${before.available.length}`,exact:true}).click();
    await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
    if(before.available.length<6)coverage.rollN=true;
    const farkle=snap.state.events.find((e:any)=>e.type==='farkle');
    if(farkle){
     expect(snap.state.thisTurn).toBe(0);expect(snap.state.playerStates[before.currentTurnPlayerId].banked).toBe(before.playerStates[before.currentTurnPlayerId].banked);
     expect(snap.state.playerStates[before.currentTurnPlayerId].completedTurns).toBe(before.playerStates[before.currentTurnPlayerId].completedTurns+1);
     await expect.poll(()=>actor.evaluate(()=>(window as any).farkleQualification.notices.includes('FARKLE'))).toBe(true);
     if(before.thisTurn>0){coverage.farkle=true;await refresh('farkle-next-turn',pageFor(snap.state.currentTurnPlayerId));}
    }else{
     expect(snap.state.thisTurn).toBe(before.thisTurn);
     // state.dice contains only this roll. Committed holds live in server receipts.
     const replay=await actor.evaluate(async(roundId:string)=>{
      const modulePath='/src/integrations/supabase/client.ts';const {supabase}=await import(modulePath);
      const {data,error}=await supabase.rpc('farkle_read_replay',{p_round_id:roundId});if(error)throw Error(error.message);return data;
     },snap.round.id);
     expect(replay.roundId).toBe(snap.round.id);expect(replay.dealerGameId).toBe(snap.round.dealer_game_id);
     expect(replay.config).toEqual(snap.state.config);
     const committed=farkleCommittedHolds(replay.events,snap.state);
     expect(committed).toEqual(farkleCommittedHolds(replay.events,before));
     expect(committed.reduce((sum,h)=>sum+h.points,0)).toBe(snap.state.thisTurn);
     expect(snap.state.available).toEqual(before.available);
     expect(snap.state.dice.map((d:any)=>d.index)).toEqual(before.available);
     expect(snap.state.rollNumber).toBe(before.rollNumber+1);expect(snap.state.scoringCycle).toBe(before.scoringCycle);
     if(committed.length)await expect(actor.getByLabel('Committed scoring dice').locator('span')).toHaveText(committed.map(h=>h.dice.map(d=>d.value).join(' · ')+' +'+h.points));
     stages.push({kind:'durable-committed-holds-after-roll',roundId:snap.round.id,actionSequence:snap.state.actionSequence,committed});
     if(!coverage.remote){
      // A pre-roll row is not completion of this roll. Arm before the action,
      // then require every phase in order before accepting the terminal row.
      await expect.poll(()=>peer.evaluate(()=>{const a=(window as any).farkleQualification.phases;const i=a.indexOf('cluster');return i<0?[]:a.slice(i);})).toEqual(['cluster','rumble','reveal','row']);
      await expect(peer.locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
      const phases=await peer.evaluate(()=>(window as any).farkleQualification.phaseEvents);
      const row=await peer.locator('[data-farkle-roll-phase] [data-farkle-die-index]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-farkle-die-index'))));
      const expected=[...snap.state.dice].sort((a:any,b:any)=>a.value-b.value||a.index-b.index).map((d:any)=>d.index);
      expect(row).toEqual(expected);coverage.remote=true;stages.push({kind:'remote-cluster-rumble-reveal-row',roundId:snap.round.id,actionSequence:snap.state.actionSequence,phases,row});
     }
    }
   }
   stages.push({kind:'action',state:snap.state});expect(snap.state.config).toEqual(frozen);
  }
  expect(coverage).toMatchObject({partial:true,rollN:true,hot:true,farkle:true,remote:true});
  const reviewer=pages.find(p=>p!==pageFor(snap.state.currentTurnPlayerId))!;
  const beforeHistory=await read();await reviewer.getByRole('button',{name:'Frozen Farkle rules',exact:true}).click();
  await expect(reviewer.getByRole('dialog')).toContainText(frozen.testLabel);
  await expect(reviewer.getByRole('dialog').getByRole('row',{name:/Single 1 \/ 5/})).toContainText(`${frozen.rules.singles['1']} / ${frozen.rules.singles['5']}`);
  await reviewer.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await reviewer.getByRole('button',{name:'History',exact:true}).click();
  await expect(reviewer.getByLabel('Replay action')).toBeVisible();await reviewer.getByLabel('Replay action').selectOption('1');
  await expect(reviewer.getByLabel('Replay action').locator('..').locator('..').locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
  await reviewer.getByText('Rules for this game',{exact:true}).click();await expect(reviewer.getByText(frozen.testLabel,{exact:true})).toBeVisible();
  expect((await read()).state).toEqual(beforeHistory.state);coverage.history=true;
  await reviewer.screenshot({path:info.outputPath('frozen-replay.png')});
 }finally{
  fs.writeFileSync(info.outputPath('qualification.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),coverage,stages},null,2));
  try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
 }
});
