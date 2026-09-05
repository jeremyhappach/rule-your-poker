import { expect } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from './support/env';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession, startSessionUnderChaos, waitForDealerGameSetupOwner } from './support/twoClientSession';

test('preferences and dealer setup exit use the shared server commands', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  try {
    await startSessionUnderChaos(session);
    const dealer = await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
    // Dealer setup covers that player's HUD. The other seated player can
    // edit preferences while waiting for the dealer to choose a game.
    const participant = dealer === session.hostPage ? session.peerPage : session.hostPage;
    for (const label of ['Auto Ante (All)', 'Auto Ante (Run it Back)']) {
      await participant.getByRole('button', { name: 'Player options', exact: true }).click();
      const pending = participant.waitForResponse(r => r.url().includes('/rpc/set_session_player_intent') && r.request().method() === 'POST');
      await participant.getByRole('menuitemcheckbox', { name: label, exact: true }).click();
      const response = await pending;
      expect(response.ok()).toBe(true);
      const receipt = await response.json();
      expect(receipt.outcome).toBe('accepted');
      expect(receipt.player.auto_ante && receipt.player.auto_ante_runback).toBe(false);
      expect(receipt.player[label === 'Auto Ante (All)' ? 'auto_ante' : 'auto_ante_runback']).toBe(true);
    }
    const pendingExit = dealer.waitForResponse(r => r.url().includes('/rpc/decline_session_setup') && r.request().method() === 'POST');
    await dealer.locator('[data-dealer-game-setup-step="game-selection"]').getByRole('button', { name: 'Sit Out', exact: true }).click();
    const exit = await pendingExit;
    expect(exit.ok()).toBe(true);
    const result = await exit.json();
    expect(result.outcome).toBe('declined');
    expect(result.status).toBe('waiting');
    const { data: game, error: gameError } = await session.cleanupClient.from('games')
      .select('status,current_game_uuid,pot').eq('id', session.gameId).single();
    expect(gameError).toBeNull();
    expect(game).toMatchObject({ status: 'waiting', current_game_uuid: null, pot: 0 });
    const { data: players, error } = await session.cleanupClient.from('players')
      .select('id,chips,sitting_out,position').eq('game_id', session.gameId);
    expect(error).toBeNull();
    expect(players).toHaveLength(2);
    expect(players!.find(p => p.id === result.declining_player_id)?.sitting_out).toBe(true);
    expect(players!.reduce((sum, p) => sum + p.chips, 0)).toBe(0);
    await expect(dealer.locator('[data-dealer-game-setup-step="game-selection"]')).toHaveCount(0);
    await dealer.screenshot({ path: info.outputPath('setup-declined.png') });
  } finally {
    try { await blastFakeMoneySession(session); }
    finally { await closeTwoClientSession(session); }
  }
});
