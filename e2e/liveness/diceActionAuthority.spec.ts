import { expect } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from './support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from './support/livenessAssertions';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession, enterDealerGameUnderChaos } from './support/twoClientSession';

for (const gameType of ['horses', 'ship-captain-crew'] as const) {
  test(`${gameType}: two players roll through the server action boundary`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    const actors = new Set<string>();
    const pages = [session.hostPage, session.peerPage];
    try {
      await enterDealerGameUnderChaos(session, gameType);
      await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
      const { data: game, error: gameError } = await session.cleanupClient.from('games')
        .select('current_game_uuid,real_money').eq('id', session.gameId).single();
      expect(gameError).toBeNull();
      expect(game?.real_money).toBe(false);
      const { data: round, error: roundError } = await session.cleanupClient.from('rounds')
        .select('id').eq('game_id', session.gameId).eq('dealer_game_id', game!.current_game_uuid!)
        .order('created_at', { ascending: false }).limit(1).single();
      expect(roundError).toBeNull();
      const end = Date.now() + 90_000;
      let complete = false;
      while (Date.now() < end && !complete) {
        for (const page of pages) {
          const roll = page.locator('[data-authoritative-action-surface="horses-scc-turn"]:visible')
            .getByRole('button', { name: /^Roll \d+$/ });
          if (!await roll.count() || !await roll.isEnabled()) continue;
          const response = page.waitForResponse(r => r.url().includes('/rpc/horses_scc_apply_action') && r.request().method() === 'POST');
          await roll.click();
          const action = await response;
          expect(action.ok()).toBe(true);
          const request = action.request().postDataJSON();
          expect(request).not.toHaveProperty('_state');
          expect(request).not.toHaveProperty('dice');
          const receipt = await action.json();
          expect(['applied', 'stale_action', 'rejected']).toContain(receipt.outcome);
          if (receipt.outcome === 'applied') {
            actors.add(request._player_id);
            const player = receipt.state.playerStates[request._player_id];
            expect(player.dice).toHaveLength(5);
            expect(player.dice.every((d: { value: number }) => d.value >= 1 && d.value <= 6)).toBe(true);
          }
        }
        const { data, error } = await session.cleanupClient.from('rounds').select('horses_state').eq('id', round!.id).single();
        expect(error).toBeNull();
        complete = (data?.horses_state as { gamePhase?: string })?.gamePhase === 'complete';
        if (!complete) await session.hostPage.waitForTimeout(250);
      }
      expect(actors.size).toBe(2);
      expect(complete).toBe(true);
      await Promise.all(pages.map(page => expectCanonicalContinuity(page)));
      await session.hostPage.screenshot({ path: info.outputPath('host-completed.png') });
      await session.peerPage.screenshot({ path: info.outputPath('peer-completed.png') });
    } finally {
      try { await blastFakeMoneySession(session); }
      finally { await closeTwoClientSession(session); }
    }
  });
}
