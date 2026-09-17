import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { requireTwoPlayerEnvironment } from './liveness/support/env';
import { createTwoClientSession, enterDealerGameUnderChaos, blastFakeMoneySession, closeTwoClientSession } from './liveness/support/twoClientSession';

for (const gameType of ['holm-game', '3-5-7', 'gin-rummy'] as const) test(`${gameType} live timing delivery and coverage`, async ({ browser }, info) => {
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  const evidence: Record<string, unknown> = { gameId: session.gameId, gameType };
  const rows = async (event = 'live-play-timing-v1') => {
    const { data, error } = await session.cleanupClient.from('debug_events').select('id,user_id,payload').eq('game_id', session.gameId).eq('event_type', event);
    if (error) throw error; return data ?? [];
  };
  try {
    await enterDealerGameUnderChaos(session, gameType, { networkFaults: false });
    if (gameType === 'gin-rummy') {
      for (let n = 0; n < 2; n++) {
        let actor = session.hostPage;
        await expect.poll(async () => {
          for (const page of [session.hostPage, session.peerPage]) {
            const button = page.locator('[data-authoritative-action-surface="gin-human-turn:first-draw"]').getByRole('button', { name: 'Pass', exact: true });
            if (await button.isVisible() && await button.isEnabled()) { actor = page; return true; }
          } return false;
        }).toBe(true);
        const response = actor.waitForResponse(r => r.url().endsWith('/rpc/gin_rummy_apply_action') && r.request().method() === 'POST');
        await actor.locator('[data-authoritative-action-surface="gin-human-turn:first-draw"]').getByRole('button', { name: 'Pass', exact: true }).click();
        const received = await response; expect(received.ok()).toBe(true);
        expect(Number((await received.allHeaders())['x-ptown-replay-ms'])).toBeGreaterThan(0);
      }
      await expect.poll(async () => (await rows()).flatMap((r: any) => r.payload.samples).filter((s: any) => s.kind === 'gin-rpc' && s.replayMs > 0).length).toBeGreaterThanOrEqual(2);
      await expect.poll(async () => (await rows()).flatMap((r: any) => r.payload.samples).filter((s: any) => s.kind === 'gin-paint-opportunity').length).toBeGreaterThanOrEqual(2);
    } else {
      for (const page of [session.hostPage, session.peerPage]) await expect(page.locator('[data-card-visibility-monitor="v1"]')).toHaveCount(1);
      await expect.poll(async () => (await rows()).filter((r: any) => r.payload.samples.some((s: any) => s.kind === 'card-scan')).length).toBeGreaterThanOrEqual(2);
      expect(await rows('card-visibility-invariant')).toHaveLength(0);
      const region = session.peerPage.locator('[data-357-active-hand-region]');
      await region.evaluate(el => { (el as HTMLElement).style.opacity = '0'; });
      await expect.poll(async () => (await rows('card-visibility-invariant')).length).toBe(1);
      await region.evaluate(el => { (el as HTMLElement).style.opacity = ''; });
      evidence.incidents = await rows('card-visibility-invariant');
    }
    const recorded = await rows(); evidence.timing = recorded;
    expect(new Set(recorded.map(r => r.user_id)).size).toBe(2);
    expect(JSON.stringify(recorded)).not.toMatch(/"(rank|suit|face|privateCatalog)":/);
  } finally {
    try { evidence.cleanup = await blastFakeMoneySession(session); }
    finally { fs.writeFileSync(info.outputPath('evidence.json'), JSON.stringify(evidence, null, 2)); await closeTwoClientSession(session); }
  }
});
