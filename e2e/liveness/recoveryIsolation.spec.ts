import { expect } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from './support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from './support/livenessAssertions';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession, enterDealerGameUnderChaos } from './support/twoClientSession';

test('reconnect recovers a missed pause after a failed frame read; legacy workers are inert', async ({ browser }) => {
  test.setTimeout(180_000);
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  try {
    await enterDealerGameUnderChaos(session, 'gin-rummy');
    await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'gin-rummy');
    const before = await session.cleanupClient.from('games').select('current_game_uuid,pause_version' as any).eq('id', session.gameId).single();
    expect(before.error).toBeNull();
    await session.peerContext.setOffline(true);
    const paused = await session.cleanupClient.rpc('set_game_paused' as any, {
      p_game_id: session.gameId, p_paused: true,
      p_expected_dealer_game_id: (before.data as any).current_game_uuid,
      p_expected_pause_version: (before.data as any).pause_version,
    } as any);
    expect(paused.error).toBeNull();
    expect((paused.data as any).outcome).toBe('paused');
    let rejectedRead = false;
    await session.peerPage.route('**/rest/v1/rpc/read_session_frame', async route => {
      if (!rejectedRead) { rejectedRead = true; await route.abort('failed'); }
      else await route.fallback();
    });
    await session.peerContext.setOffline(false);
    await session.peerPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(session.peerPage.getByText(/Game is paused/i).first()).toBeVisible({ timeout: 45_000 });
    expect(rejectedRead).toBe(true);
    await expectCanonicalContinuity(session.peerPage);
    const frameBefore = await session.cleanupClient.rpc('read_session_frame' as any, { p_game_id: session.gameId } as any);
    for (const name of ['enforce-deadlines', 'enforce-all-deadlines']) {
      const result = await session.cleanupClient.functions.invoke(name, { body: { gameId: session.gameId } });
      expect((result.error as any)?.context?.status).toBe(410);
    }
    const frameAfter = await session.cleanupClient.rpc('read_session_frame' as any, { p_game_id: session.gameId } as any);
    expect(frameBefore.error).toBeNull();
    expect(frameAfter.error).toBeNull();
    expect((frameAfter.data as any).game._authorityRevision).toBe((frameBefore.data as any).game._authorityRevision);
    const resumed = await session.cleanupClient.rpc('set_game_paused' as any, {
      p_game_id: session.gameId, p_paused: false,
      p_expected_dealer_game_id: (before.data as any).current_game_uuid,
      p_expected_pause_version: (paused.data as any).pause_version,
    } as any);
    expect(resumed.error).toBeNull();
    await expect(session.peerPage.getByText(/Game is paused/i).first()).not.toBeVisible({ timeout: 20_000 });
  } finally {
    await session.peerContext.setOffline(false);
    try { await blastFakeMoneySession(session); }
    finally { await closeTwoClientSession(session); }
  }
});
