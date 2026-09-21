# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: terminal.local.spec.ts >> immediate: live settlement and canonical next setup
- Location: e2e\farkle\terminal.local.spec.ts:7:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 2
Received:   2

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import fs from 'node:fs';
  3  | import {createClient} from '@supabase/supabase-js';
  4  | import {cleanLocalFarkleGame} from './localDatabase';
  5  |
  6  | for(const endgame of ['immediate','equal_turns','one_last_turn']) {
  7  |   test(`${endgame}: live settlement and canonical next setup`,async({browser},info)=>{
  8  |     const settings=JSON.parse(fs.readFileSync('runtime-farkle.local/status.json','utf8'));
  9  |     if(settings.API_URL!=='http://127.0.0.1:57321')throw Error('Only isolated local API admitted');
  10 |     const accounts=JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json','utf8'));
  11 |     const api=createClient(settings.API_URL,settings.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  12 |     const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
  13 |     const pages=await Promise.all(contexts.map(c=>c.newPage()));
  14 |     let gameId:string|undefined;
  15 |     const stages:unknown[]=[];
  16 |     try {
  17 |       for(const [i,p] of pages.entries()){
  18 |         await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);
  19 |         await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  20 |       }
  21 |       await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
  22 |       await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
  23 |       await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];
  24 |       await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
  25 |       await pages[0].locator('[data-start-game-btn]').click();
  26 |       let dealer=pages[0];
  27 |       await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75_000}).toBe(true);
  28 |       await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();await dealer.locator('[data-dealer-game-option="farkle"]').click();
  29 |       await dealer.getByLabel('Stake',{exact:true}).fill('2');await dealer.getByLabel('Target Score',{exact:true}).fill('50');await dealer.getByLabel('Endgame',{exact:true}).selectOption(endgame);
  30 |       await dealer.getByRole('button',{name:'Start TEST ONLY Game',exact:true}).click();
  31 |       await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
  32 |       for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  33 |       const read=async()=>{
  34 |         const r=await api.from('rounds').select('id,dealer_game_id,hand_number,farkle_state').eq('game_id',gameId!).order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;
  35 |         const p=await api.from('players').select('id,user_id,chips,position').eq('game_id',gameId!);if(p.error)throw p.error;
  36 |         return {...r.data,state:r.data.farkle_state,players:p.data};
  37 |       };
  38 |       let snap=await read();const initialBalances=Object.fromEntries(snap.players.map(p=>[p.id,p.chips]));
  39 |       for(let n=0;n<60&&snap.state.gamePhase!=='complete';n++){
  40 |         const actor=pages[accounts.findIndex((a:{id:string})=>a.id===snap.players.find(p=>p.id===snap.state.currentTurnPlayerId)?.user_id)];
  41 |         const seq=snap.state.actionSequence;
  42 |         if(snap.state.finalQueue || snap.state.tiebreakTurn>0){
  43 |           const before=snap.state;await actor.reload();await expect(actor.locator('[data-farkle-scope]')).toBeVisible();expect((await read()).state).toEqual(before);
  44 |           stages.push({kind:snap.state.tiebreakTurn>0?'tiebreak-refresh':'final-turn-refresh',state:before});
  45 |         }
  46 |         if(snap.state.stage==='hold'){
  47 |           for(const i of snap.state.legalHolds[0].indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${i}"]`).click();
  48 |           await actor.getByRole('button',{name:/^Hold Dice/}).click();
  49 |         }else if(snap.state.stage==='bank_or_roll')await actor.getByRole('button',{name:'Bank',exact:true}).click();
  50 |         else await actor.getByRole('button',{name:/^Roll \d/}).click();
> 51 |         await expect.poll(async()=>(await read()).state.actionSequence).toBeGreaterThan(seq);snap=await read();stages.push({kind:'action',state:snap.state});
     |                                                                         ^ Error: expect(received).toBeGreaterThan(expected)
  52 |       }
  53 |       expect(snap.state.gamePhase).toBe('complete');expect(snap.state.winnerPlayerId).toBeTruthy();
  54 |       for(const p of snap.players)expect(p.chips-initialBalances[p.id]).toBe(p.id===snap.state.winnerPlayerId?2:-2);
  55 |       const terminal=snap.state;
  56 |       await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible())return true;return false;},{timeout:30_000}).toBe(true);
  57 |       const g=await api.from('games').select('game_type,current_game_uuid,status').eq('id',gameId!).single();
  58 |       expect(g.data).toMatchObject({game_type:null,current_game_uuid:null,status:'game_selection'});
  59 |       await pages[0].reload();await expect(pages[0].locator('[data-lifecycle-branch="loaded-inner"]')).toBeVisible();
  60 |       expect((await read()).state).toEqual(terminal);
  61 |       for(const p of (await read()).players)expect(p.chips-initialBalances[p.id]).toBe(p.id===terminal.winnerPlayerId?2:-2);
  62 |       stages.push({kind:'terminal-continuation-refresh',state:terminal});
  63 |     }finally{
  64 |       fs.writeFileSync(info.outputPath('authoritative-stages.json'),JSON.stringify(stages,null,2));
  65 |       try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
  66 |     }
  67 |   });
  68 | }
  69 |
```