import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import pg from '../../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const directory='qualification.local/farkle-full-stack/';
const status=JSON.parse(fs.readFileSync(directory+'status.json','utf8'));
if(status.API_URL!=='http://127.0.0.1:57321'||new URL(status.DB_URL).port!=='57322')throw Error('Isolated stack required');
const accounts=JSON.parse(fs.readFileSync(directory+'accounts.json','utf8'));
for(const scenario of ['continuation','continuation-rotation','one-eligible','no-dealer','explicit-end'])test(`two browsers: Farkle ${scenario}`,async({browser},info)=>{
 const terminal=scenario==='explicit-end';
 const db=new pg.Client({connectionString:status.DB_URL});await db.connect();
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 const evidence:any={scenario,terminal,actions:[],networkErrors:[],pageErrors:[],productionRequests:[],routes:[]};let gameId:string|undefined;
 const priorMakeTake=(await db.query("select value from system_settings where key='make_it_take_it'")).rows[0].value;
 const read=async()=>{
  const game=(await db.query('select * from games where id=$1',[gameId])).rows[0];
  const round=(await db.query('select * from rounds where game_id=$1 order by created_at desc limit 1',[gameId])).rows[0];
  const players=(await db.query('select id,user_id,chips,position from players where game_id=$1 order by position',[gameId])).rows;
  return {game,round,players,state:round?.farkle_state};
 };
 try{
  if(scenario==='continuation-rotation')await db.query("update system_settings set value='{\"enabled\":false}' where key='make_it_take_it'");
  if(scenario==='continuation')await db.query("update system_settings set value='{\"enabled\":true}' where key='make_it_take_it'");
  evidence.makeItTakeIt=scenario==='continuation'?true:scenario==='continuation-rotation'?false:priorMakeTake.enabled===true;
  for(const [i,p] of pages.entries()){
   p.on('framenavigated',f=>{if(f===p.mainFrame())evidence.routes.push({client:i,url:f.url(),at:Date.now()});});
   await p.addInitScript(()=>{
    const w=window as any;w.__handoffFrames=[];
    let prior='';let shell:Element|null=null;
    const frame=()=>{const current=document.querySelector('[data-canonical-shell-root]');const value={path:location.pathname,mode:current?.getAttribute('data-shell-presentation-mode'),shell:!!current,shellReplaced:!!shell&&!!current&&shell!==current,hud:document.querySelectorAll('[data-canonical-shell-hud-grid]').length,tabs:document.querySelectorAll('[data-canonical-shell-tabbar]').length,neutral:document.querySelectorAll('[data-canonical-shell-neutral]').length,farkle:document.querySelectorAll('[data-farkle-scope]').length,run21:document.querySelectorAll('[data-run21-live]').length};if(current)shell=current;const key=JSON.stringify(value);if(key!==prior){w.__handoffFrames.push({at:Date.now(),...value});prior=key;}requestAnimationFrame(frame);};requestAnimationFrame(frame);
   });
   await contexts[i].route('**/*',async route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){evidence.productionRequests.push(u.origin);await route.abort();}else await route.continue();});
   p.on('pageerror',e=>evidence.pageErrors.push(e.message));
   p.on('response',async r=>{if(r.status()>=400)evidence.networkErrors.push({status:r.status(),url:r.url().split('?')[0],body:(await r.text().catch(()=>'' )).slice(0,500)});});
   await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);
   await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  }
  await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
  await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
  await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];evidence.gameId=gameId;
  await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
  await pages[0].locator('[data-start-game-btn]').click();
  let dealer=pages[0];
  await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75000}).toBe(true);
  await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();await dealer.locator('[data-dealer-game-option="farkle"]').click();
  await dealer.getByLabel('Stake',{exact:true}).fill('5');await dealer.getByLabel('Target Score',{exact:true}).fill('100');await dealer.getByLabel('Endgame',{exact:true}).selectOption('equal_turns');
  await dealer.getByRole('button',{name:'Start Game',exact:true}).click();
  await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
  for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  let snap=await read();const originalDealer=snap.round.dealer_game_id;
  if(terminal){
   // Arrange only the session-end boundary; all rolls, holds, banks and settlement use the real UI/RPC path.
   await db.query('BEGIN');await db.query("select private.farkle_claim_v1($1,$2,$3,'configure')",[gameId,originalDealer,snap.round.id]);
   await db.query('update games set pending_session_end=true where id=$1',[gameId]);await db.query('COMMIT');
  }
  if(scenario==='one-eligible'||scenario==='no-dealer'){
   await db.query('BEGIN');await db.query("select private.farkle_claim_v1($1,$2,$3,'configure')",[gameId,originalDealer,snap.round.id]);
   await db.query('update players set sit_out_next_hand=true where game_id=$1 and ($2::boolean or user_id=$3)',[gameId,scenario==='no-dealer',accounts[1].id]);await db.query('COMMIT');
  }
  const initial=Object.fromEntries(snap.players.map((p:any)=>[p.id,p.chips]));
  for(let turn=0;turn<100&&snap.state.gamePhase!=='complete';turn++){
   const actor=pages[accounts.findIndex((a:any)=>a.id===snap.players.find((p:any)=>p.id===snap.state.currentTurnPlayerId)?.user_id)];
   const sequence=snap.state.actionSequence;
   if(snap.state.stage==='hold'){
    const choice=snap.state.legalHolds.reduce((a:any,b:any)=>b.points>a.points?b:a);
    for(const index of choice.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${index}"]`).click();
    await actor.getByRole('button',{name:/^Hold Dice/}).click();
   }else if(snap.state.stage==='bank_or_roll')await actor.getByRole('button',{name:'Bank',exact:true}).click();
   else await actor.getByRole('button',{name:/^Roll \d/}).click();
   await expect.poll(async()=>(await read()).state.actionSequence).toBeGreaterThan(sequence);snap=await read();evidence.actions.push(snap.state);
  }
  expect(snap.state.gamePhase).toBe('complete');
  for(const p of snap.players)expect(p.chips-initial[p.id]).toBe(p.id===snap.state.winnerPlayerId?5:-5);
  const finances=(await db.query("select jsonb_build_object('results',(select count(*) from game_results where dealer_game_id=$1),'batches',(select count(*) from gameplay_transfer_batches where game_id=$2),'snapshots',(select jsonb_agg(to_jsonb(s)) from session_player_snapshots s where game_id=$2),'pending',(select count(*) from gameplay_transfer_pending_changes where game_id=$2)) v",[originalDealer,gameId])).rows[0].v;
  expect(finances.results).toBe(1);expect(finances.batches).toBe(1);expect(finances.pending).toBe(0);
  for(const p of snap.players)expect(finances.snapshots.some((s:any)=>s.player_id===p.id&&s.chips===p.chips)).toBe(true);
  evidence.finances=finances;evidence.terminalState=snap;
  if(terminal){
   for(const [i,p] of pages.entries()){
    await expect(p.getByRole('button',{name:'Back to Lobby',exact:true})).toBeVisible({timeout:45000});
    await expect(p.getByText('Session Ended',{exact:true}).first()).toBeVisible();
    await expect(p.locator('[data-farkle-active-area]')).toHaveCount(0);
    await p.screenshot({path:info.outputPath(`terminal-client-${i}.png`),fullPage:true});
    evidence['terminalText'+i]=await p.locator('body').innerText();
    await p.getByRole('button',{name:'History',exact:true}).click();
    await expect(p.locator('[data-canonical-hand-history]')).toContainText(/farkle/i);
    evidence['historyText'+i]=await p.locator('[data-canonical-hand-history]').innerText();
    await p.screenshot({path:info.outputPath(`history-client-${i}.png`),fullPage:true});
   }
   await pages[0].getByRole('button',{name:/Cards|Dice/,exact:true}).click();
   await pages[0].getByRole('button',{name:'Back to Lobby',exact:true}).click();await expect(pages[0].getByText('Game Lobby',{exact:true}).first()).toBeVisible();
   await pages[1].reload();await expect(pages[1].getByText('Game Lobby',{exact:true}).first()).toBeVisible();
   expect((await read()).state).toEqual(snap.state);
  }else if(scenario.startsWith('continuation')){
   await expect.poll(async()=>{for(const p of pages)if(await p.getByRole('button',{name:/^Run Back Farkle$/i}).isVisible()){dealer=p;return true;}return false;},{timeout:45000}).toBe(true);
   evidence.handoff=await read();expect(evidence.handoff.game.status).toBe('game_selection');expect(evidence.handoff.game.current_game_uuid).toBeNull();
   const positions=snap.players.map((p:any)=>p.position).sort((a:number,b:number)=>b-a);
   expect(evidence.handoff.game.dealer_position).toBe(evidence.makeItTakeIt?snap.players.find((p:any)=>p.id===snap.state.winnerPlayerId).position:positions.find((p:number)=>p<snap.game.dealer_position)??positions[0]);
   for(const [i,p] of pages.entries()){await expect(p.locator('[data-canonical-shell-hud-grid]')).toHaveCount(1);await expect(p.locator('[data-farkle-scope]')).toHaveCount(0);await p.screenshot({path:info.outputPath(`setup-client-${i}.png`),fullPage:true});}
   await dealer.getByRole('button',{name:/^Run Back Farkle$/i}).click();
   await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
   await expect.poll(async()=>(await read()).round.dealer_game_id).not.toBe(originalDealer);
   for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
   evidence.successor=await read();expect(evidence.successor.state.gamePhase).toBe('playing');
   for(const p of evidence.successor.players)expect(p.chips).toBe(snap.players.find((old:any)=>old.id===p.id).chips);
  }else{
   await expect.poll(async()=>(await read()).game.status,{timeout:45000}).toBe('waiting');evidence.handoff=await read();
   for(const [i,p] of pages.entries()){await expect(p.locator('[data-canonical-shell-hud-grid]')).toHaveCount(1);await expect(p.locator('[data-farkle-scope]')).toHaveCount(0);await expect(p.getByText('Session Ended',{exact:true})).toHaveCount(0);await p.screenshot({path:info.outputPath(`waiting-client-${i}.png`),fullPage:true});}
  }
  expect(evidence.productionRequests.filter((u:string)=>u.includes('supabase.co'))).toEqual([]);
 }finally{
  for(const [i,p] of pages.entries()){evidence['frames'+i]=await p.evaluate(()=>(window as any).__handoffFrames).catch(()=>[]);evidence['lastText'+i]=await p.locator('body').innerText().catch(()=>'');await p.screenshot({path:info.outputPath(`last-client-${i}.png`),fullPage:true}).catch(()=>{});}
  fs.writeFileSync(info.outputPath('evidence.json'),JSON.stringify(evidence,null,2));
  await Promise.all(contexts.map(c=>c.close()));await db.query("update system_settings set value=$1 where key='make_it_take_it'",[priorMakeTake]);await db.end();
 }
});
