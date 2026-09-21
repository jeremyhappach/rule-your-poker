# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: remainingPlayable.local.spec.ts >> partial holds, Roll N, Hot Dice, Farkle, remote stages, refresh and frozen replay
- Location: e2e\farkle\remainingPlayable.local.spec.ts:9:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import fs from 'node:fs';
  3   | import {execFileSync} from 'node:child_process';
  4   | import {farkleCommittedHolds} from '../../src/lib/farkle/presentation';
  5   | import {createClient} from '@supabase/supabase-js';
  6   | import {cleanLocalFarkleGame} from './localDatabase';
  7   | 
  8   | // Qualification-only harness. Uses the actual client and normal authoritative RPCs.
  9   | test('partial holds, Roll N, Hot Dice, Farkle, remote stages, refresh and frozen replay',async({browser},info)=>{
  10  |  const cfg=JSON.parse(fs.readFileSync('runtime-farkle.local/status.json','utf8'));
  11  |  if(cfg.API_URL!=='http://127.0.0.1:57321')throw Error('Isolated API required');
  12  |  const accounts=JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json','utf8'));
  13  |  const api=createClient(cfg.API_URL,cfg.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  14  |  const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
  15  |  const pages=await Promise.all(contexts.map(c=>c.newPage()));let gameId:string|undefined;
  16  |  const stages:any[]=[];const coverage={partial:false,rollN:false,hot:false,farkle:false,remote:false,history:false};
  17  |  try{
  18  |   for(const [i,p] of pages.entries()){
  19  |    await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);
  20  |    await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  21  |   }
  22  |   await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
  23  |   await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
  24  |   await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];
  25  |   await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
  26  |   await pages[0].locator('[data-start-game-btn]').click();let dealer=pages[0];
  27  |   await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75_000}).toBe(true);
  28  |   await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();await dealer.locator('[data-dealer-game-option="farkle"]').click();
  29  |   await dealer.getByLabel('Stake',{exact:true}).fill('2');await dealer.getByLabel('Target Score',{exact:true}).fill('10000');await dealer.getByLabel('Endgame',{exact:true}).selectOption('one_last_turn');
  30  |   await dealer.getByRole('button',{name:'Start TEST ONLY Game',exact:true}).click();
  31  |   await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
  32  |   for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  33  |   const read=async()=>{
  34  |    const r=await api.from('rounds').select('id,dealer_game_id,hand_number,farkle_state').eq('game_id',gameId!).order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;
  35  |    const p=await api.from('players').select('id,user_id,position,chips').eq('game_id',gameId!);if(p.error)throw p.error;
  36  |    return {round:r.data,state:r.data.farkle_state as any,players:p.data};
  37  |   };
  38  |   const observe=async(p:any)=>p.evaluate(()=>{
  39  |    const w=window as any;w.farkleQualification={phases:[],phaseEvents:[],notices:[]};
  40  |    new MutationObserver(()=>{
  41  |     const phase=document.querySelector('[data-farkle-roll-phase]')?.getAttribute('data-farkle-roll-phase');
  42  |     const log=w.farkleQualification;if(phase&&log.phases.at(-1)!==phase){log.phases.push(phase);log.phaseEvents.push({phase,utc:new Date().toISOString(),epochMs:performance.timeOrigin+performance.now()});}
  43  |     const notices=[...document.querySelectorAll('[data-canonical-announcement-content][data-canonical-announcement-type="gameplay_notice"]')].map(n=>n.textContent?.trim());
  44  |     for(const label of ['HOT DICE','FARKLE'])if(notices.includes(label)&&!log.notices.includes(label))log.notices.push(label);
  45  |    }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-farkle-roll-phase']});
  46  |   });
  47  |   for(const p of pages)await observe(p);
  48  |   let snap=await read();const frozen=snap.state.config;
  49  |   const pageFor=(id:string)=>pages[accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===id)?.user_id)];
  50  |   const refresh=async(label:string,p:any)=>{
  51  |    const before=await read();await p.reload();await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  52  |    const after=await read();expect(after.state).toEqual(before.state);expect(after.players).toEqual(before.players);
  53  |    stages.push({kind:label,state:after.state});await observe(p);
  54  |   };
  55  |   for(let n=0;n<180&&!(coverage.partial&&coverage.rollN&&coverage.hot&&coverage.farkle&&coverage.remote);n++){
  56  |    const before=snap.state;const actor=pageFor(before.currentTurnPlayerId);const peer=pages.find(p=>p!==actor)!;
  57  |    if(before.stage==='hold'){
  58  |     let hold=[...before.legalHolds].sort((a:any,b:any)=>b.indexes.length-a.indexes.length||b.points-a.points)[0];
  59  |     if(!coverage.partial)hold=before.legalHolds.find((h:any)=>h.indexes.length<before.available.length)??hold;
  60  |     for(const i of hold.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${i}"]`).click();
  61  |     await actor.getByRole('button',{name:/^Hold Dice/}).click();
  62  |     await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
  63  |     expect(snap.state.thisTurn).toBe(before.thisTurn+hold.points);expect(snap.state.playerStates).toEqual(before.playerStates);
  64  |     await expect(actor.getByLabel('Committed scoring dice')).toContainText(`+${hold.points}`);
  65  |     if(hold.indexes.length<before.available.length&&!coverage.partial){
  66  |      expect(snap.state.available.length).toBe(before.available.length-hold.indexes.length);
  67  |      await expect(actor.getByRole('button',{name:`Roll ${snap.state.available.length}`,exact:true})).toBeEnabled();
  68  |      coverage.partial=true;await refresh('partial-hold-committed',actor);
  69  |     }
  70  |     if(snap.state.events.some((e:any)=>e.type==='hot_dice')){
  71  |      expect(snap.state.available).toEqual([0,1,2,3,4,5]);
> 72  |      await expect.poll(()=>actor.evaluate(()=>(window as any).farkleQualification.notices.includes('HOT DICE'))).toBe(true);
      |                                                                                                                  ^ Error: expect(received).toBe(expected) // Object.is equality
  73  |      await refresh('hot-dice-bank-or-roll',actor);await refresh('hot-dice-peer-refresh',peer);coverage.hot=true;
  74  |     }
  75  |    }else{
  76  |     await peer.evaluate(()=>{(window as any).farkleQualification.phases=[];(window as any).farkleQualification.phaseEvents=[];});
  77  |     await actor.getByRole('button',{name:`Roll ${before.available.length}`,exact:true}).click();
  78  |     await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
  79  |     if(before.available.length<6)coverage.rollN=true;
  80  |     const farkle=snap.state.events.find((e:any)=>e.type==='farkle');
  81  |     if(farkle){
  82  |      expect(snap.state.thisTurn).toBe(0);expect(snap.state.playerStates[before.currentTurnPlayerId].banked).toBe(before.playerStates[before.currentTurnPlayerId].banked);
  83  |      expect(snap.state.playerStates[before.currentTurnPlayerId].completedTurns).toBe(before.playerStates[before.currentTurnPlayerId].completedTurns+1);
  84  |      await expect.poll(()=>actor.evaluate(()=>(window as any).farkleQualification.notices.includes('FARKLE'))).toBe(true);
  85  |      if(before.thisTurn>0){coverage.farkle=true;await refresh('farkle-next-turn',pageFor(snap.state.currentTurnPlayerId));}
  86  |     }else{
  87  |      expect(snap.state.thisTurn).toBe(before.thisTurn);
  88  |      // state.dice contains only this roll. Committed holds live in server receipts.
  89  |      const replay=await actor.evaluate(async(roundId:string)=>{
  90  |       const modulePath='/src/integrations/supabase/client.ts';const {supabase}=await import(modulePath);
  91  |       const {data,error}=await supabase.rpc('farkle_read_replay',{p_round_id:roundId});if(error)throw Error(error.message);return data;
  92  |      },snap.round.id);
  93  |      expect(replay.roundId).toBe(snap.round.id);expect(replay.dealerGameId).toBe(snap.round.dealer_game_id);
  94  |      expect(replay.config).toEqual(snap.state.config);
  95  |      const committed=farkleCommittedHolds(replay.events,snap.state);
  96  |      expect(committed).toEqual(farkleCommittedHolds(replay.events,before));
  97  |      expect(committed.reduce((sum,h)=>sum+h.points,0)).toBe(snap.state.thisTurn);
  98  |      expect(snap.state.available).toEqual(before.available);
  99  |      expect(snap.state.dice.map((d:any)=>d.index)).toEqual(before.available);
  100 |      expect(snap.state.rollNumber).toBe(before.rollNumber+1);expect(snap.state.scoringCycle).toBe(before.scoringCycle);
  101 |      if(committed.length)await expect(actor.getByLabel('Committed scoring dice').locator('span')).toHaveText(committed.map(h=>h.dice.map(d=>d.value).join(' · ')+' +'+h.points));
  102 |      stages.push({kind:'durable-committed-holds-after-roll',roundId:snap.round.id,actionSequence:snap.state.actionSequence,committed});
  103 |      if(!coverage.remote){
  104 |       // A pre-roll row is not completion of this roll. Arm before the action,
  105 |       // then require every phase in order before accepting the terminal row.
  106 |       await expect.poll(()=>peer.evaluate(()=>{const a=(window as any).farkleQualification.phases;const i=a.indexOf('cluster');return i<0?[]:a.slice(i);})).toEqual(['cluster','rumble','reveal','row']);
  107 |       await expect(peer.locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
  108 |       const phases=await peer.evaluate(()=>(window as any).farkleQualification.phaseEvents);
  109 |       const row=await peer.locator('[data-farkle-roll-phase] [data-farkle-die-index]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-farkle-die-index'))));
  110 |       const expected=[...snap.state.dice].sort((a:any,b:any)=>a.value-b.value||a.index-b.index).map((d:any)=>d.index);
  111 |       expect(row).toEqual(expected);coverage.remote=true;stages.push({kind:'remote-cluster-rumble-reveal-row',roundId:snap.round.id,actionSequence:snap.state.actionSequence,phases,row});
  112 |      }
  113 |     }
  114 |    }
  115 |    stages.push({kind:'action',state:snap.state});expect(snap.state.config).toEqual(frozen);
  116 |   }
  117 |   expect(coverage).toMatchObject({partial:true,rollN:true,hot:true,farkle:true,remote:true});
  118 |   const reviewer=pages.find(p=>p!==pageFor(snap.state.currentTurnPlayerId))!;
  119 |   const beforeHistory=await read();await reviewer.getByRole('button',{name:'Frozen Farkle rules',exact:true}).click();
  120 |   await expect(reviewer.getByRole('dialog')).toContainText(frozen.testLabel);
  121 |   await expect(reviewer.getByRole('dialog').getByRole('row',{name:/Single 1 \/ 5/})).toContainText(`${frozen.rules.singles['1']} / ${frozen.rules.singles['5']}`);
  122 |   await reviewer.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  123 |   await reviewer.getByRole('button',{name:'History',exact:true}).click();
  124 |   await expect(reviewer.getByLabel('Replay action')).toBeVisible();await reviewer.getByLabel('Replay action').selectOption('1');
  125 |   await expect(reviewer.getByLabel('Replay action').locator('..').locator('..').locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
  126 |   await reviewer.getByText('Rules for this game',{exact:true}).click();await expect(reviewer.getByText(frozen.testLabel,{exact:true})).toBeVisible();
  127 |   expect((await read()).state).toEqual(beforeHistory.state);coverage.history=true;
  128 |   await reviewer.screenshot({path:info.outputPath('frozen-replay.png')});
  129 |  }finally{
  130 |   fs.writeFileSync(info.outputPath('qualification.json'),JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),coverage,stages},null,2));
  131 |   try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
  132 |  }
  133 | });
  134 | 
```