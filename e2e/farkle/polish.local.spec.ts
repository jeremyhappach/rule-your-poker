import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { FarkleState } from '../../src/lib/farkle/types';
import { cleanLocalFarkleGame } from './localDatabase';

test('Farkle dice, held-row ordering, and frozen rules on desktop and mobile', async ({ browser }, info) => {
  const settings = JSON.parse(fs.readFileSync('runtime-farkle.local/status.json', 'utf8'));
  if (settings.API_URL !== 'http://127.0.0.1:57321') throw new Error('Isolated Farkle API required');
  const accounts = JSON.parse(fs.readFileSync('runtime-farkle.local/accounts.json', 'utf8'));
  const api = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1280, height: 900 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  ]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  let gameId: string | undefined;
  try {
    for (const [index, page] of pages.entries()) {
      await page.goto('/auth', { waitUntil: 'domcontentloaded' });
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
    await expect(pages[0].locator('[data-start-game-btn]')).toBeVisible();
    await pages[0].locator('[data-start-game-btn]').click();
    let dealer = pages[0];
    await expect.poll(async () => {
      for (const page of pages) if (await page.locator('[data-dealer-game-setup-step="game-selection"]').isVisible()) {
        dealer = page; return true;
      }
      return false;
    }, { timeout: 75_000 }).toBe(true);
    await dealer.getByRole('tab', { name: 'Dice Games', exact: true }).click();
    await expect(dealer.locator('[data-dealer-game-option="farkle"]')).toContainText('Risk it or bank it');
    await dealer.locator('[data-dealer-game-option="farkle"]').click();
    await dealer.getByLabel('Stake', { exact: true }).fill('2');
    await dealer.getByLabel('Target Score', { exact: true }).fill('10000');
    const configured = dealer.waitForResponse(response => response.url().endsWith('/rpc/configure_dealer_game') && response.request().method() === 'POST');
    await dealer.getByRole('button', { name: 'Start TEST ONLY Game' }).click();
    expect(await (await configured).json()).toMatchObject({ outcome: 'configured' });
    const peer = pages.find(page => page !== dealer)!;
    await peer.locator('[data-authoritative-action-surface="ante-decision"]').getByRole('button', { name: /Ante Up!/ }).click();
    const snapshot = async () => {
      const game = await api.from('games').select('current_game_uuid').eq('id', gameId!).single();
      if (game.error) throw game.error;
      const round = await api.from('rounds').select('farkle_state').eq('dealer_game_id', game.data.current_game_uuid)
        .order('created_at', { ascending: false }).limit(1).single();
      if (round.error) throw round.error;
      return round.data.farkle_state as FarkleState;
    };
    for (const page of pages) await expect(page.locator('[data-farkle-scope]')).toBeVisible();
    let state = await snapshot();
    for (let attempt = 0; attempt < 8 && state.stage !== 'hold'; attempt++) {
      const active = await pages[0].locator('[data-farkle-active-area]').isVisible() ? pages[0] : pages[1];
      await active.getByRole('button', { name: /^Roll \d/ }).click();
      await expect.poll(async () => (await snapshot()).actionSequence).toBeGreaterThan(state.actionSequence);
      state = await snapshot();
    }
    expect(state.stage).toBe('hold');
    const self = await pages[0].locator('[data-farkle-active-area]').isVisible() ? pages[0] : pages[1];
    const remote = pages.find(page => page !== self)!;
    await expect(self.locator('.farkle-self-dice .farkle-die')).toHaveCount(6);
    await expect(remote.locator('.farkle-remote-die')).toHaveCount(6);
    const size = async (page: typeof self) => page.locator('.farkle-die-visual > button').first().evaluate(node => ({
      body: node.getBoundingClientRect().width,
      pip: node.querySelector('.rounded-full')?.getBoundingClientRect().width ?? 0,
    }));
    const selfSize = await size(self), remoteSize = await size(remote);
    for (const measured of [selfSize, remoteSize]) {
      expect(measured.body).toBeGreaterThan(30);
      expect(measured.pip / measured.body).toBeGreaterThan(0.13);
      expect(measured.pip / measured.body).toBeLessThan(0.27);
    }
    const hold = state.legalHolds.find(value => value.indexes.length < 6)!;
    for (const index of hold.indexes) await self.locator(`[data-farkle-active-area] button[data-farkle-die-index="${index}"]`).click();
    await self.getByRole('button', { name: /^Hold Dice/ }).click();
    await expect.poll(async () => (await snapshot()).stage).toBe('bank_or_roll');
    state = await snapshot();
    await self.getByRole('button', { name: /^Roll \d/ }).click();
    await expect.poll(async () => (await snapshot()).actionSequence).toBeGreaterThan(state.actionSequence);
    state = await snapshot();
    if (state.stage !== 'hold') throw new Error('Focused reduced-roll proof encountered a legitimate Farkle; retry separately');
    await expect(self.locator('[data-held-consolidated="true"]').first()).toBeVisible();
    const held = self.getByLabel('Committed scoring dice');
    await expect(held.locator('.farkle-die')).toHaveCount(hold.indexes.length);
    for (const index of hold.indexes) await expect(held.locator(`[data-farkle-die="${index}"]`)).toBeVisible();
    await expect(held).toContainText(`+${hold.points}`);
    await expect(self.locator('.farkle-self-dice .farkle-die')).toHaveCount(state.dice.length);
    await expect(remote.locator('[data-farkle-roll-phase]')).toHaveAttribute('data-farkle-roll-phase', 'row');
    for (const [index, page] of pages.entries()) await page.screenshot({ path: info.outputPath(`polish-table-${index}.png`) });
    await self.getByRole('button', { name: 'Frozen Farkle rules' }).click();
    await expect(self.getByRole('dialog')).toContainText('Frozen scoring rules');
    for (const [index, page] of pages.entries()) await page.screenshot({ path: info.outputPath(`polish-${index}.png`) });
  } finally {
    if (gameId) cleanLocalFarkleGame(gameId);
    await Promise.all(contexts.map(context => context.close()));
  }
});
