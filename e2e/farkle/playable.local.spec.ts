import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { FarkleState } from '../../src/lib/farkle/types';
import { cleanLocalFarkleGame } from './localDatabase';

test('actual admin setup, ante, roll, selection, hold, bank and refresh', async ({ browser }, info) => {
  const settings = JSON.parse(fs.readFileSync('runtime-farkle.local/status.json', 'utf8'));
  if (settings.API_URL !== 'http://127.0.0.1:57321') throw new Error('Only isolated Farkle API admitted');
  const accounts = JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json', 'utf8'));
  const api = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const contexts = await Promise.all([browser.newContext({viewport:{width:1280,height:900}}), browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const evidence: unknown[] = [];
  let gameId: string | undefined;
  try {
    for (const [i, page] of pages.entries()) {
      await page.goto('/auth');
      await page.locator('#login-email').fill(accounts[i].email);
      await page.locator('#login-password').fill(accounts[i].password);
      await page.getByRole('button',{name:'Login',exact:true}).click();
      await expect(page.getByText('Game Lobby',{exact:true}).first()).toBeVisible();
    }
    await pages[0].getByRole('button',{name:'Create New Game',exact:true}).click();
    await pages[0].getByRole('dialog',{name:'Create New Game'}).getByRole('button',{name:'Create Game',exact:true}).click();
    await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);
    gameId = pages[0].url().split('/game/')[1];
    await pages[1].goto(`/game/${gameId}`);
    await pages[1].locator('[data-waiting-seat-open] button').first().click();
    await pages[0].locator('[data-start-game-btn]').click();
    let dealer = pages[0];
    await expect.poll(async()=>{
      for(const page of pages)if(await page.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()){dealer=page;return true;}
      return false;
    },{timeout:75_000}).toBe(true);
    await dealer.getByRole('tab',{name:'Dice Games',exact:true}).click();
    await dealer.locator('[data-dealer-game-option="farkle"]').click();
    await dealer.getByLabel('Stake',{exact:true}).fill('2');
    await dealer.getByLabel('Target Score',{exact:true}).fill('10000');
    await dealer.getByLabel('Endgame',{exact:true}).selectOption('one_last_turn');
    const configured = dealer.waitForResponse(r=>r.url().endsWith('/rpc/configure_dealer_game')&&r.request().method()==='POST');
    await dealer.getByRole('button',{name:'Start TEST ONLY Game',exact:true}).click();
    const response = await configured;
    expect(await response.json()).toMatchObject({outcome:'configured'});
    const peer=pages.find(p=>p!==dealer)!;
    await peer.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button',{name:/Ante Up!/}).click();
    const snapshot=async()=>{
      const g=await api.from('games').select('*').eq('id',gameId!).single();if(g.error)throw g.error;
      const r=await api.from('rounds').select('*').eq('game_id',gameId!).eq('dealer_game_id',g.data.current_game_uuid).order('created_at',{ascending:false}).limit(1).single();if(r.error)throw r.error;
      const p=await api.from('players').select('*').eq('game_id',gameId!);if(p.error)throw p.error;
      return {game:g.data,round:r.data,players:p.data,state:r.data.farkle_state as FarkleState};
    };
    for(const page of pages)await expect(page.locator('[data-farkle-scope]')).toBeVisible();
    let snap=await snapshot();
    const order=[...snap.players].sort((a,b)=>((snap.game.dealer_position-a.position+7)%7||7)-((snap.game.dealer_position-b.position+7)%7||7)).map(p=>p.id);
    expect(snap.state.turnOrder).toEqual(order);
    expect(snap.state.config.testOnly).toBe(true);
    const actorPage=()=>pages[accounts.findIndex((a:{id:string})=>a.id===snap.players.find(p=>p.id===snap.state.currentTurnPlayerId)?.user_id)];
    let actor=actorPage();
    const refresh=async(label:string)=>{
      const before=await snapshot();await actor.reload();await expect(actor.locator('[data-farkle-scope]')).toBeVisible();
      const after=await snapshot();expect(after.state).toEqual(before.state);evidence.push({stage:label,state:after.state});
    };
    await refresh('before-first-roll');
    for(let attempt=0;attempt<8 && snap.state.stage!=='hold';attempt++){
      await actor.getByRole('button',{name:/^Roll \d/}).click();
      await expect.poll(async()=>(await snapshot()).state.actionSequence).toBeGreaterThan(snap.state.actionSequence);
      snap=await snapshot();actor=actorPage();
    }
    expect(snap.state.stage).toBe('hold');
    await refresh('awaiting-hold');
    const hold=snap.state.legalHolds[0];
    const die=actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${hold.indexes[0]}"]`);
    await die.click();await expect(die).toHaveAttribute('aria-pressed','true');await die.click();await expect(die).toHaveAttribute('aria-pressed','false');
    for(const index of hold.indexes)await actor.locator(`[data-farkle-active-area] button[data-farkle-die-index="${index}"]`).click();
    await actor.getByRole('button',{name:/^Hold Dice/}).click();
    await expect.poll(async()=>(await snapshot()).state.stage).toBe('bank_or_roll');
    snap=await snapshot();expect(snap.state.thisTurn).toBe(hold.points);
    await expect(actor.getByLabel('Committed scoring dice')).toContainText(`+${hold.points}`);
    await refresh('committed-hold-bank-or-roll');
    await actor.getByRole('button',{name:'Frozen Farkle rules',exact:true}).click();
    await expect(actor.getByRole('dialog')).toContainText('TEST ONLY: isolated Wave 2 browser qualification');
    await actor.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
    const player=snap.state.currentTurnPlayerId, before=snap.state.playerStates[player];
    await actor.getByRole('button',{name:'Bank',exact:true}).click();
    await expect.poll(async()=>(await snapshot()).state.playerStates[player].completedTurns).toBe(before.completedTurns+1);
    snap=await snapshot();expect(snap.state.playerStates[player].banked).toBe(before.banked+hold.points);
    evidence.push({stage:'banked',state:snap.state});
    await pages[0].screenshot({path:info.outputPath('playable.png')});
  } finally {
    await info.attach('authoritative-stages',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
    fs.writeFileSync(info.outputPath('authoritative-stages.json'),JSON.stringify(evidence,null,2));
    try {
      if(gameId){
        const current=await api.from('games').select('current_host,real_money').eq('id',gameId).single();
        if(current.error)throw current.error;
        expect(current.data.real_money).toBe(false);
        expect(accounts.some((a:{id:string})=>a.id===current.data.current_host)).toBe(true);
        cleanLocalFarkleGame(gameId);
        const {data,error:readError}=await api.from('games').select('id').eq('id',gameId);
        if(readError)throw readError;
        expect(data).toEqual([]);
      }
    } finally { await Promise.all(contexts.map(c=>c.close())); }
  }
});
