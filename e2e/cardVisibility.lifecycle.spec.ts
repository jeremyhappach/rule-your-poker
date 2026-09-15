import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { requireTwoPlayerEnvironment } from './liveness/support/env';
import { createTwoClientSession, enterDealerGameUnderChaos, waitForDealerGameSetupOwner,
  submitOutstandingAnteUnderChaos, blastFakeMoneySession, closeTwoClientSession } from './liveness/support/twoClientSession';
import { armHolmPresentation, clearHolmPresentationFixture, configureHolmPresentation } from './humanChaos/support/holmPresentation';

for (const gameType of ['holm-game', '3-5-7'] as const) test(`${gameType} normal lifecycle has no missing-card incidents`, async ({ browser }, info) => {
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  const baseline = process.env.PTOWN_CARD_VISIBILITY_BASELINE === '1';
  const pages = [session.hostPage, session.peerPage];
  const evidence: Record<string, unknown> = { gameId: session.gameId, gameType, boundaries: [] };
  let armed = false;
  const events = async () => {
    const { data, error } = await session.cleanupClient.from('debug_events').select('id,payload').eq('game_id', session.gameId).eq('event_type', 'card-visibility-invariant');
    if (error) throw error; return data ?? [];
  };
  async function checkpoint(label: string) {
    await session.peerPage.waitForTimeout(600);
    const incidents = await events();
    (evidence.boundaries as unknown[]).push({ label, incidents });
    expect(incidents, `${label}: false missing-card incident`).toHaveLength(0);
  }
  async function opening(count: number) {
    for (const page of pages) {
      await expect(page.locator('[data-357-active-hand-region] [data-playing-card-face]')).toHaveCount(count);
      await expect(page.locator('[data-card-visibility-monitor]')).toHaveCount(baseline ? 0 : 1);
    }
  }
  async function pair(choices: ['Stay' | 'Fold' | 'Drop', 'Stay' | 'Fold' | 'Drop']) {
    const used = new Set<number>();
    for (let turn = 0; turn < 2; turn++) {
      let actor = -1;
      await expect.poll(async () => {
        for (let i = 0; i < 2; i++) {
          if (used.has(i)) continue;
          const control = pages[i].locator('[data-authoritative-action-surface="holm-357-decision"]:visible').getByRole('button', { name: choices[i], exact: true });
          if (await control.isVisible() && await control.isEnabled()) { actor = i; return true; }
        }
        return false;
      }).toBe(true);
      const rpc = gameType === 'holm-game' ? 'holm_submit_decision' : 'three_five_seven_submit_decision';
      const receipt = pages[actor].waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/rpc/${rpc}`));
      await pages[actor].locator('[data-authoritative-action-surface="holm-357-decision"]:visible').getByRole('button', { name: choices[actor], exact: true }).click();
      expect((await receipt).ok()).toBe(true); used.add(actor);
    }
  }
  async function pauseResumeReload(count: number) {
    await session.hostPage.getByRole('button', { name: 'Player options', exact: true }).click();
    await session.hostPage.getByRole('menuitem', { name: /Pause Game/ }).click();
    await checkpoint('paused');
    await session.peerContext.setOffline(true); await session.peerPage.waitForTimeout(400);
    await session.peerContext.setOffline(false); await session.peerPage.reload();
    await opening(count); await checkpoint('reconnected-paused');
    await session.hostPage.getByRole('button', { name: 'Player options', exact: true }).click();
    await session.hostPage.getByRole('menuitem', { name: /Resume Game/ }).click();
    await checkpoint('resumed');
  }
  try {
    if (gameType === 'holm-game') { await armHolmPresentation(session); armed = true; }
    await enterDealerGameUnderChaos(session, gameType, { networkFaults: false,
      configure: gameType === 'holm-game' ? configureHolmPresentation : async surface => { await surface.locator('#legs-to-win').fill('3'); } });
    await opening(gameType === 'holm-game' ? 4 : 3); await checkpoint('opening');
    if (gameType === 'holm-game') {
      await pair(['Stay', 'Fold']);
      for (const page of pages) {
        await expect(page.locator('[data-canonical-announcement-type="match_win"]')).toBeVisible();
        await expect(page.locator('[data-holm-card-presentation="face"]:visible')).toHaveCount(4);
        await expect(page.locator('[data-holm-chucky-flip-state="revealed"]:visible')).toHaveCount(4);
      }
      await checkpoint('solo-reveal-and-terminal');
      await clearHolmPresentationFixture(session); armed = false;
      const owner = await waitForDealerGameSetupOwner(...pages as [Page, Page]);
      await checkpoint('dealer-terminal-setup');
      await owner.getByRole('button', { name: /Run Back/ }).click();
      await submitOutstandingAnteUnderChaos(session, false); await opening(4); await checkpoint('run-back-opening');
      const scope = async () => JSON.parse(await session.peerPage.locator('[data-holm-presentation-scope]').getAttribute('data-holm-presentation-scope') ?? 'null');
      const before = await scope();
      await pair(['Fold', 'Fold']);
      await expect.poll(async () => (await scope())?.roundId !== before.roundId).toBe(true);
      await opening(4); const after = await scope();
      expect(after.dealerGameId).toBe(before.dealerGameId); expect(after.handNumber).toBe(before.handNumber + 1);
      await checkpoint('same-dealer-hand-two'); await pauseResumeReload(4);
      await pair(['Stay', 'Stay']);
      await checkpoint('multi-player-reveal');
      await expect.poll(async () => (await scope())?.roundId !== after.roundId).toBe(true);
      await opening(4); await checkpoint('post-showdown-successor');
    } else {
      for (let i = 0; i < 5; i++) {
        await opening([3,5,7][i % 3]);
        await checkpoint(`hand-${Math.floor(i / 3) + 1}-round-${i % 3 + 1}`);
        if (i === 3) await pauseResumeReload(3);
        if (i === 4) {
          await session.hostPage.getByRole('button', { name: 'Player options', exact: true }).click();
          await session.hostPage.getByRole('menuitem', { name: /End Session/ }).click();
          await session.hostPage.getByRole('button', { name: 'Confirm End Session', exact: true }).click();
        }
        await pair(i % 2 === 0 ? ['Stay','Drop'] : ['Drop','Stay']);
        if (i < 4) await opening([3,5,7][(i + 1) % 3]);
      }
      await expect.poll(async () => {
        const { data, error } = await session.cleanupClient.from('games').select('status').eq('id', session.gameId).single();
        if (error) throw error; return data?.status;
      }).toBe('session_ended');
      // Database termination precedes the connected client's terminal presentation.
      for (const page of pages) {
        await expect(page.locator('[data-session-ended-panel]')).toBeVisible({ timeout: 120_000 });
        await expect(page.locator('[data-357-active-hand-region] [data-playing-card-face]')).toHaveCount(0);
      }
      await checkpoint('session-terminal');
    }
    evidence.status = 'passed';
  } finally {
    evidence.finalIncidents = await events();
    if (armed) await clearHolmPresentationFixture(session);
    const { error } = await session.cleanupClient.from('debug_events').delete().eq('game_id', session.gameId).eq('event_type', 'card-visibility-invariant');
    evidence.incidentCleanup = error?.message ?? 'deleted';
    evidence.cleanup = await blastFakeMoneySession(session);
    fs.mkdirSync(info.outputDir, { recursive: true }); fs.writeFileSync(info.outputPath('lifecycle-evidence.json'), JSON.stringify(evidence, null, 2));
    await closeTwoClientSession(session);
  }
});
