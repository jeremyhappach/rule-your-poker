import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { cleanLocalFarkleGame } from './localDatabase';

/** Deterministic Farkle receipts from the real reducer, in the isolated database only. */
test('terminal Farkle dice stay with their actor for partial and six-die rolls', async ({ browser }, info) => {
  const config = JSON.parse(fs.readFileSync('runtime-farkle.local/status.json', 'utf8'));
  if (config.API_URL !== 'http://127.0.0.1:57321') throw Error('Isolated local API required');
  const accounts = JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json', 'utf8'));
  const api = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1280, height: 900 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  let gameId: string | undefined;
  const evidence: unknown[] = [];
  try {
    for (const [index, page] of pages.entries()) {
      await page.goto('/auth');
      await page.locator('#login-email').fill(accounts[index].email);
      await page.locator('#login-password').fill(accounts[index].password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page.getByText('Game Lobby', { exact: true }).first()).toBeVisible();
    }
    await pages[0].getByRole('button', { name: 'Create New Game', exact: true }).click();
    await pages[0].getByRole('dialog', { name: 'Create New Game' }).getByRole('button', { name: 'Create Game', exact: true }).click();
    await expect(pages[0]).toHaveURL(/\/game\/[0-9a-f-]{36}$/);
    gameId = pages[0].url().split('/game/')[1];
    await pages[1].goto(`/game/${gameId}`);
    await pages[1].locator('[data-waiting-seat-open] button').first().click();
    for (const page of pages) {
      const rejoin = page.getByRole('button', { name: 'Return to Play', exact: true });
      if (await rejoin.isVisible()) await rejoin.click();
    }
    await expect(pages[0].locator('[data-start-game-btn]')).toBeVisible();
    await pages[0].locator('[data-start-game-btn]').click();
    let dealer = pages[0];
    await expect.poll(async () => {
      for (const page of pages) if (await page.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()) { dealer = page; return true; }
      return false;
    }, { timeout: 75_000 }).toBe(true);
    await dealer.getByRole('tab', { name: 'Dice Games', exact: true }).click();
    await dealer.locator('[data-dealer-game-option="farkle"]').click();
    await dealer.getByLabel('Stake', { exact: true }).fill('2');
    await dealer.getByLabel('Target Score', { exact: true }).fill('10000');
    await dealer.getByLabel('Endgame', { exact: true }).selectOption('one_last_turn');
    await dealer.getByRole('button', { name: 'Start TEST ONLY Game', exact: true }).click();
    await pages.find(page => page !== dealer)!.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button', { name: /Ante Up!/ }).click();
    for (const page of pages) await expect(page.locator('[data-farkle-scope]')).toBeVisible();

    const read = async () => {
      const round = await api.from('rounds').select('id,dealer_game_id,hand_number,farkle_state').eq('game_id', gameId!).order('created_at', { ascending: false }).limit(1).single();
      const players = await api.from('players').select('id,user_id').eq('game_id', gameId!);
      if (round.error || players.error) throw round.error ?? players.error;
      return { round: round.data, players: players.data, state: round.data.farkle_state as any };
    };
    for (const values of [[2, 3], [2, 3, 4, 6, 2, 3]]) {
      const before = await read();
      const actor = before.state.currentTurnPlayerId;
      const actorUser = before.players.find(player => player.id === actor)?.user_id;
      const actorIndex = accounts.findIndex((account: { id: string }) => account.id === actorUser);
      if (actorIndex < 0) throw Error('Farkle actor is not a fixture player');
      const actorPage = pages[actorIndex], peerPage = pages[1 - actorIndex];
      for (const page of pages) await page.evaluate(() => {
        const log: string[] = [];
        (window as any).__farkleResolvedPhases = log;
        const sample = () => {
          const phase = document.querySelector('[data-farkle-roll-phase]')?.getAttribute('data-farkle-roll-phase')
            ?? document.querySelector('[data-farkle-self-roll-phase]')?.getAttribute('data-farkle-self-roll-phase');
          if (phase && log.at(-1) !== phase) log.push(phase);
        };
        new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, attributes: true,
          attributeFilter: ['data-farkle-roll-phase', 'data-farkle-self-roll-phase'] });
      });
      const ids = [gameId!, before.round.dealer_game_id, before.round.id];
      if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw Error('Invalid isolated fixture identity');
      const available = values.length === 2 ? '[1,4]' : '[0,1,2,3,4,5]';
      const sql = `BEGIN; SELECT private.farkle_claim_v1('${ids[0]}','${ids[1]}','${ids[2]}','action');
        UPDATE public.rounds SET farkle_state=private.farkle_reduce_v1(
          jsonb_set(farkle_state,'{available}','${available}'::jsonb), 'roll','[]'::jsonb, ARRAY[${values.join(',')}]::integer[])
        WHERE id='${ids[2]}' AND (farkle_state->>'actionSequence')::bigint=${before.state.actionSequence}; COMMIT;`;
      execFileSync('docker', ['exec', '-i', 'supabase_db_farkle-wave2-local', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        { input: sql, stdio: ['pipe', 'ignore', 'pipe'] });
      await expect.poll(async () => (await read()).state.actionSequence).toBe(before.state.actionSequence + 1);
      const after = await read();
      expect(after.state.currentTurnPlayerId).not.toBe(actor);
      expect(after.state.dice).toEqual([]);
      expect(after.state.events.map((event: { type: string }) => event.type)).toContain('farkle');
      const exact = after.state.events.find((event: { type: string }) => event.type === 'dice_rolled').dice;
      const expected = values.map((value, index) => ({ index: values.length === 2 ? [1, 4][index] : index, value }));
      expect(exact).toEqual(expected);
      await expect(actorPage.locator('[data-farkle-active-area][data-farkle-resolved-roll]')).toBeVisible();
      await expect(peerPage.locator('[data-farkle-roll-phase="row"]')).toBeVisible();
      await expect(actorPage.locator('[data-farkle-roll-phase]')).toHaveCount(0);
      await expect(peerPage.locator('[data-farkle-active-area]')).toHaveCount(0);
      for (const [page, surface] of [[actorPage, '[data-farkle-active-area]'], [peerPage, '[data-farkle-roll-phase]']] as const) {
        const actual = await page.locator(`${surface} [data-farkle-die-index]`).evaluateAll(nodes => nodes
          .map(node => ({ index: Number(node.getAttribute('data-farkle-die-index')),
            value: Number(node.getAttribute('aria-label')?.split(': ')[1]) }))
          .filter(die => Number.isInteger(die.value) && die.value > 0).sort((a, b) => a.index - b.index));
        expect(actual).toEqual(expected);
      }
      for (const page of pages) await expect(page.getByText('FARKLE', { exact: true })).toBeVisible();
      await actorPage.waitForTimeout(500);
      await expect(actorPage.locator('[data-farkle-active-area][data-farkle-resolved-roll]')).toBeVisible();
      await expect(peerPage.locator('[data-farkle-roll-phase="row"]')).toBeVisible();
      for (const page of pages) await expect(page.getByText('FARKLE', { exact: true })).toHaveCount(0);
      await expect(actorPage.locator('[data-farkle-active-area][data-farkle-resolved-roll]')).toHaveCount(0);
      await expect(peerPage.locator('[data-farkle-roll-phase]')).toHaveCount(0);
      const phases = await Promise.all(pages.map(page => page.evaluate(() => (window as any).__farkleResolvedPhases)));
      expect(phases[1 - actorIndex]).toEqual(['cluster', 'rumble', 'reveal', 'row']);
      evidence.push({ actor, dice: expected, actionSequence: after.state.actionSequence, phases });
    }
  } finally {
    fs.writeFileSync(info.outputPath('resolved-roll-proof.json'), JSON.stringify({ evidence }, null, 2));
    try { if (gameId) cleanLocalFarkleGame(gameId); } finally { await Promise.all(contexts.map(context => context.close())); }
  }
});
