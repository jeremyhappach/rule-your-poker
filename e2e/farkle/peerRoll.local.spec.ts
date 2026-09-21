import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {cleanLocalFarkleGame} from './localDatabase';

// Qualification-only harness. Uses the actual client and normal authoritative RPCs.
test('peer roll waits for the complete ordered phase sequence',async({browser},info)=>{
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
    const text=document.body.innerText;for(const label of ['HOT DICE','FARKLE'])if(text.includes(label)&&!log.notices.includes(label))log.notices.push(label);
   }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-farkle-roll-phase']});
  });
  for(const p of pages)await observe(p);
  let snap=await read();const frozen=snap.state.config;
  const pageFor=(id:string)=>pages[accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===id)?.user_id)];

  for(let attempt=0;attempt<3;attempt++){
   const before=snap.state;const actor=pageFor(before.currentTurnPlayerId);const peer=pages.find(p=>p!==actor)!;
   await peer.evaluate(()=>{(window as any).farkleQualification.phases=[];(window as any).farkleQualification.phaseEvents=[];});
   const armedAt=new Date().toISOString();
   await actor.getByRole('button',{name:'Roll '+before.available.length,exact:true}).click();
   await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
   if(snap.state.stage!=='hold')continue;
   await expect.poll(()=>peer.evaluate(()=>{const a=(window as any).farkleQualification.phases;const i=a.indexOf('cluster');return i<0?[]:a.slice(i);})).toEqual(['cluster','rumble','reveal','row']);
   await expect(peer.locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
   const phases=await peer.evaluate(()=>(window as any).farkleQualification.phaseEvents);
   const row=await peer.locator('[data-farkle-roll-phase] [data-farkle-die-index]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-farkle-die-index'))));
   const expected=[...snap.state.dice].sort((a:any,b:any)=>a.value-b.value||a.index-b.index).map((d:any)=>d.index);
   expect(row).toEqual(expected);coverage.remote=true;
   stages.push({kind:'ordered-peer-roll',armedAt,roundId:snap.round.id,actionSequence:snap.state.actionSequence,phases,row,state:snap.state});break;
  }
  expect(coverage.remote).toBe(true);
 }finally{
  fs.writeFileSync(info.outputPath('focused-proof.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),coverage,stages},null,2));
  try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
 }
});
