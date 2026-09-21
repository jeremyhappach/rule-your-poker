# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: wave2-remaining.spec.ts >> partial holds, Roll N, Hot Dice, Farkle, remote stages, refresh and frozen replay
- Location: runtime-farkle.local\wave2-remaining.spec.ts:7:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

Expected: {"index": 0, "value": 5}
Received: undefined
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import fs from 'node:fs';
  3   | import {createClient} from '@supabase/supabase-js';
  4   | import {cleanLocalFarkleGame} from '../e2e/farkle/localDatabase';
  5   | 
  6   | // Qualification-only harness. Uses the actual client and normal authoritative RPCs.
  7   | test('partial holds, Roll N, Hot Dice, Farkle, remote stages, refresh and frozen replay',async({browser},info)=>{
  8   |  const cfg=JSON.parse(fs.readFileSync('runtime-farkle.local/status.json','utf8'));
  9   |  if(cfg.API_URL!=='http://127.0.0.1:57321')throw Error('Isolated API required');
  10  |  const accounts=JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json','utf8'));
  11  |  const api=createClient(cfg.API_URL,cfg.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  12  |  const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:900}}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
  13  |  const pages=await Promise.all(contexts.map(c=>c.newPage()));let gameId:string|undefined;
  14  |  const stages:any[]=[];const coverage={partial:false,rollN:false,hot:false,farkle:false,remote:false,history:false};
  15  |  try{
  16  |   for(const [i,p] of pages.entries()){
  17  |    await p.goto('/auth');await p.locator('#login-email').fill(accounts[i].email);await p.locator('#login-password').fill(accounts[i].password);
  18  |    await p.getByRole('button',{name:'Login',exact:true}).click();await expect(p.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
  19  |   }
  20  |   await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
  21  |   await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
  22  |   await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);gameId=pages[0].url().split('/game/')[1];
  23  |   await pages[1].goto(`/game/${gameId}`);await pages[1].locator('[data-waiting-seat-open] button').first().click();
  24  |   await pages[0].locator('[data-start-game-btn]').click();let dealer=pages[0];
  25  |   await expect.poll(async()=>{for(const p of pages)if(await p.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=p;return true;}return false;},{timeout:75_000}).toBe(true);
  26  |   await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();await dealer.locator('[data-dealer-game-option="farkle"]').click();
  27  |   await dealer.getByLabel('Stake',{exact:true}).fill('2');await dealer.getByLabel('Target Score',{exact:true}).fill('10000');await dealer.getByLabel('Endgame',{exact:true}).selectOption('one_last_turn');
  28  |   await dealer.getByRole('button',{name:'Start TEST ONLY Game',exact:true}).click();
  29  |   await pages.find(p=>p!==dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
  30  |   for(const p of pages)await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  31  |   const read=async()=>{
  32  |    const r=await api.from('rounds').select('id,dealer_game_id,hand_number,farkle_state').eq('game_id',gameId!).order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;
  33  |    const p=await api.from('players').select('id,user_id,position,chips').eq('game_id',gameId!);if(p.error)throw p.error;
  34  |    return {round:r.data,state:r.data.farkle_state as any,players:p.data};
  35  |   };
  36  |   const observe=async(p:any)=>p.evaluate(()=>{
  37  |    const w=window as any;w.farkleQualification={phases:[],phaseEvents:[],notices:[]};
  38  |    new MutationObserver(()=>{
  39  |     const phase=document.querySelector('[data-farkle-roll-phase]')?.getAttribute('data-farkle-roll-phase');
  40  |     const log=w.farkleQualification;if(phase&&log.phases.at(-1)!==phase){log.phases.push(phase);log.phaseEvents.push({phase,utc:new Date().toISOString(),epochMs:performance.timeOrigin+performance.now()});}
  41  |     const notices=[...document.querySelectorAll('[data-canonical-announcement-content][data-canonical-announcement-type="gameplay_notice"]')].map(n=>n.textContent?.trim());
  42  |     for(const label of ['HOT DICE','FARKLE'])if(notices.includes(label)&&!log.notices.includes(label))log.notices.push(label);
  43  |    }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-farkle-roll-phase']});
  44  |   });
  45  |   for(const p of pages)await observe(p);
  46  |   let snap=await read();const frozen=snap.state.config;
  47  |   const pageFor=(id:string)=>pages[accounts.findIndex((a:any)=>a.id===snap.players.find(p=>p.id===id)?.user_id)];
  48  |   const refresh=async(label:string,p:any)=>{
  49  |    const before=await read();await p.reload();await expect(p.locator('[data-farkle-scope]')).toBeVisible();
  50  |    const after=await read();expect(after.state).toEqual(before.state);expect(after.players).toEqual(before.players);
  51  |    stages.push({kind:label,state:after.state});await observe(p);
  52  |   };
  53  |   for(let n=0;n<180&&!(coverage.partial&&coverage.rollN&&coverage.hot&&coverage.farkle&&coverage.remote);n++){
  54  |    const before=snap.state;const actor=pageFor(before.currentTurnPlayerId);const peer=pages.find(p=>p!==actor)!;
  55  |    if(before.stage==='hold'){
  56  |     let hold=[...before.legalHolds].sort((a:any,b:any)=>b.indexes.length-a.indexes.length||b.points-a.points)[0];
  57  |     if(!coverage.partial)hold=before.legalHolds.find((h:any)=>h.indexes.length<before.available.length)??hold;
  58  |     for(const i of hold.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${i}"]`).click();
  59  |     await actor.getByRole('button',{name:/^Hold Dice/}).click();
  60  |     await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
  61  |     expect(snap.state.thisTurn).toBe(before.thisTurn+hold.points);expect(snap.state.playerStates).toEqual(before.playerStates);
  62  |     await expect(actor.getByLabel('Committed scoring dice')).toContainText(`+${hold.points}`);
  63  |     if(hold.indexes.length<before.available.length&&!coverage.partial){
  64  |      expect(snap.state.available.length).toBe(before.available.length-hold.indexes.length);
  65  |      await expect(actor.getByRole('button',{name:`Roll ${snap.state.available.length}`,exact:true})).toBeEnabled();
  66  |      coverage.partial=true;await refresh('partial-hold-committed',actor);
  67  |     }
  68  |     if(snap.state.events.some((e:any)=>e.type==='hot_dice')){
  69  |      expect(snap.state.available).toEqual([0,1,2,3,4,5]);
  70  |      await expect.poll(()=>actor.evaluate(()=>(window as any).farkleQualification.notices.includes('HOT DICE'))).toBe(true);
  71  |      await refresh('hot-dice-bank-or-roll',actor);await refresh('hot-dice-peer-refresh',peer);coverage.hot=true;
  72  |     }
  73  |    }else{
  74  |     await peer.evaluate(()=>{(window as any).farkleQualification.phases=[];(window as any).farkleQualification.phaseEvents=[];});
  75  |     await actor.getByRole('button',{name:`Roll ${before.available.length}`,exact:true}).click();
  76  |     await expect.poll(async()=>(await read()).state.actionSequence).toBe(before.actionSequence+1);snap=await read();
  77  |     if(before.available.length<6)coverage.rollN=true;
  78  |     const farkle=snap.state.events.find((e:any)=>e.type==='farkle');
  79  |     if(farkle){
  80  |      expect(snap.state.thisTurn).toBe(0);expect(snap.state.playerStates[before.currentTurnPlayerId].banked).toBe(before.playerStates[before.currentTurnPlayerId].banked);
  81  |      expect(snap.state.playerStates[before.currentTurnPlayerId].completedTurns).toBe(before.playerStates[before.currentTurnPlayerId].completedTurns+1);
  82  |      await expect.poll(()=>actor.evaluate(()=>(window as any).farkleQualification.notices.includes('FARKLE'))).toBe(true);
  83  |      if(before.thisTurn>0){coverage.farkle=true;await refresh('farkle-next-turn',pageFor(snap.state.currentTurnPlayerId));}
  84  |     }else{
  85  |      expect(snap.state.thisTurn).toBe(before.thisTurn);
> 86  |      for(const die of before.dice.filter((d:any)=>!before.available.includes(d.index)))expect(snap.state.dice.find((d:any)=>d.index===die.index)).toEqual(die);
      |                                                                                                                                                   ^ Error: expect(received).toEqual(expected) // deep equality
  87  |      if(!coverage.remote){
  88  |       // A pre-roll row is not completion of this roll. Arm before the action,
  89  |       // then require every phase in order before accepting the terminal row.
  90  |       await expect.poll(()=>peer.evaluate(()=>{const a=(window as any).farkleQualification.phases;const i=a.indexOf('cluster');return i<0?[]:a.slice(i);})).toEqual(['cluster','rumble','reveal','row']);
  91  |       await expect(peer.locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
  92  |       const phases=await peer.evaluate(()=>(window as any).farkleQualification.phaseEvents);
  93  |       const row=await peer.locator('[data-farkle-roll-phase] [data-farkle-die-index]').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-farkle-die-index'))));
  94  |       const expected=[...snap.state.dice].sort((a:any,b:any)=>a.value-b.value||a.index-b.index).map((d:any)=>d.index);
  95  |       expect(row).toEqual(expected);coverage.remote=true;stages.push({kind:'remote-cluster-rumble-reveal-row',roundId:snap.round.id,actionSequence:snap.state.actionSequence,phases,row});
  96  |      }
  97  |     }
  98  |    }
  99  |    stages.push({kind:'action',state:snap.state});expect(snap.state.config).toEqual(frozen);
  100 |   }
  101 |   expect(coverage).toMatchObject({partial:true,rollN:true,hot:true,farkle:true,remote:true});
  102 |   const reviewer=pages.find(p=>p!==pageFor(snap.state.currentTurnPlayerId))!;
  103 |   const beforeHistory=await read();await reviewer.getByRole('button',{name:'Frozen Farkle rules',exact:true}).click();
  104 |   await expect(reviewer.getByRole('dialog')).toContainText(frozen.testLabel);
  105 |   await expect(reviewer.getByRole('dialog').getByRole('row',{name:/Single 1 \/ 5/})).toContainText(`${frozen.rules.singles['1']} / ${frozen.rules.singles['5']}`);
  106 |   await reviewer.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  107 |   await reviewer.getByRole('button',{name:'History',exact:true}).click();
  108 |   await expect(reviewer.getByLabel('Replay action')).toBeVisible();await reviewer.getByLabel('Replay action').selectOption('1');
  109 |   await expect(reviewer.getByLabel('Replay action').locator('..').locator('..').locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase','row');
  110 |   await reviewer.getByText('Rules for this game',{exact:true}).click();await expect(reviewer.getByText(frozen.testLabel,{exact:true})).toBeVisible();
  111 |   expect((await read()).state).toEqual(beforeHistory.state);coverage.history=true;
  112 |   await reviewer.screenshot({path:info.outputPath('frozen-replay.png')});
  113 |  }finally{
  114 |   fs.writeFileSync(info.outputPath('qualification.json'),JSON.stringify({sha:'bb7ba16b52972043b1ed5a487b336bf1fb21b8a7',coverage,stages},null,2));
  115 |   try{if(gameId)cleanLocalFarkleGame(gameId);}finally{await Promise.all(contexts.map(c=>c.close()));}
  116 |  }
  117 | });
  118 | 
```