import { test, expect, type Page } from '@playwright/test';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import { createTwoClientSession, enterDealerGameUnderChaos, waitForDealerGameSetupOwner,
  submitOutstandingAnteUnderChaos, blastFakeMoneySession, closeTwoClientSession } from '../liveness/support/twoClientSession';
import { armHolmPresentation, clearHolmPresentationFixture, configureHolmPresentation } from './support/holmPresentation';

// Functional exposure and successor proof. This does not replace the stricter
// CSS-completion/payout test in transitions.humanChaos.spec.ts.
test('Holm solo exposure reaches both viewers and Run Back remains playable', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  const pages = [session.hostPage, session.peerPage];
  const evidence: Record<string, unknown> = { gameId: session.gameId };
  let armed = false;
  const decision = (page: Page, name: 'Stay' | 'Fold') => page.locator('[data-authoritative-action-surface="holm-357-decision"]:visible').getByRole('button', { name, exact: true });
  async function pair(solo: boolean) {
    const used = new Set<number>();
    for (let turn = 0; turn < 2; turn++) {
      let actor = -1;
      await expect.poll(async () => {
        for (let i = 0; i < pages.length; i++) {
          if (used.has(i)) continue;
          const button = decision(pages[i], solo && i === 0 ? 'Stay' : 'Fold');
          if (await button.isVisible() && await button.isEnabled()) { actor = i; return true; }
        }
        return false;
      }).toBe(true);
      const receipt = pages[actor].waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/rpc/holm_submit_decision'));
      await decision(pages[actor], solo && actor === 0 ? 'Stay' : 'Fold').click();
      expect((await receipt).ok()).toBe(true);
      used.add(actor);
    }
  }
  async function opening(label: string, predecessor?: string) {
    const states = [];
    for (const page of pages) {
      await expect.poll(async () => {
        const current = JSON.parse(await page.locator('[data-holm-presentation-scope]').getAttribute('data-holm-presentation-scope') ?? 'null');
        return current?.gameId === session.gameId && Boolean(current?.roundId) && current.roundId !== predecessor;
      }, { message: `${label}: wait for the authoritative successor identity` }).toBe(true);
      await expect(page.locator('[data-holm-active-hand-region] [data-playing-card-root]:visible')).toHaveCount(4);
      await expect(page.locator('[data-holm-card-presentation="face"]:visible')).toHaveCount(2);
      await expect(page.locator('[data-holm-card-presentation="back"]:visible')).toHaveCount(2);
      const scope = JSON.parse(await page.locator('[data-holm-presentation-scope]').getAttribute('data-holm-presentation-scope') ?? 'null');
      expect(scope?.gameId).toBe(session.gameId);
      expect(scope.roundId).not.toBe(predecessor);
      states.push(scope);
    }
    expect(states[0].roundId).toBe(states[1].roundId);
    evidence[label] = states;
    return states[0];
  }
  try {
    const game = await session.cleanupClient.from('games').select('real_money').eq('id', session.gameId).single();
    expect(game.error).toBeNull(); expect(game.data?.real_money).toBe(false);
    await armHolmPresentation(session); armed = true;
    await enterDealerGameUnderChaos(session, 'holm-game', { networkFaults: false, configure: configureHolmPresentation });
    const first = await opening('opening');
    const before = await session.cleanupClient.from('player_cards').select('player_id,cards').eq('round_id', first.roundId);
    expect(before.error).toBeNull(); expect(before.data).toHaveLength(1);
    await pair(true);
    for (const page of pages) {
      await expect(page.locator('[data-canonical-announcement-type="match_win"]')).toBeVisible();
      await expect(page.locator('[data-holm-card-presentation="face"]:visible')).toHaveCount(4);
      await expect(page.locator('[data-holm-chucky-flip-state="revealed"]:visible')).toHaveCount(4);
    }
    evidence.revealCompleted = true;
    // The winning viewer must still be unable to read the folded opponent's hand.
    const after = await session.cleanupClient.from('player_cards').select('player_id,cards,is_public').eq('round_id', first.roundId);
    expect(after.error).toBeNull(); expect(after.data).toHaveLength(1);
    expect(after.data![0].is_public).toBe(true);
    expect(after.data![0].player_id).toBe(before.data![0].player_id);
    await clearHolmPresentationFixture(session); armed = false;
    const owner = await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
    await owner.getByRole('button', { name: /Run Back/ }).click();
    await submitOutstandingAnteUnderChaos(session, false);
    const successor = await opening('runBackOpening', first.roundId);
    expect(successor.dealerGameId).not.toBe(first.dealerGameId);
    await pair(false);
    await opening('continuationOpening', successor.roundId);
    evidence.status = 'passed';
  } catch (error) {
    evidence.status = 'failed'; evidence.error = String(error);
    for (const [i, page] of pages.entries()) await page.screenshot({ path: info.outputPath(`client-${i}-before-cleanup.png`), fullPage: true });
    throw error;
  } finally {
    await info.attach('solo-exposure-before-cleanup', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    if (armed) await clearHolmPresentationFixture(session);
    evidence.cleanup = await blastFakeMoneySession(session);
    await info.attach('solo-exposure-cleanup', { body: JSON.stringify(evidence.cleanup), contentType: 'application/json' });
    await closeTwoClientSession(session);
  }
});
