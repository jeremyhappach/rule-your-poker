import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { profileCardVisibility } from './support/cardVisibilityProfile';
import { requireTwoPlayerEnvironment } from './liveness/support/env';
import { createTwoClientSession, enterDealerGameUnderChaos, blastFakeMoneySession, closeTwoClientSession } from './liveness/support/twoClientSession';

for (const gameType of ['holm-game', '3-5-7'] as const) test(`${gameType} live table observes actual card loss with debug off`, async ({ browser }, info) => {
  const credentials = requireTwoPlayerEnvironment();
  const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
  const evidence: Record<string, unknown> = { gameId: session.gameId, gameType };
  let baselineContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  const events = async () => {
    const { data, error } = await session.cleanupClient.from('debug_events').select('id,payload').eq('game_id', session.gameId).eq('event_type', 'card-visibility-invariant');
    if (error) throw error; return data ?? [];
  };
  try {
    await enterDealerGameUnderChaos(session, gameType, { networkFaults: false });
    const pages = [session.hostPage, session.peerPage];
    for (const page of pages) {
      await expect(page.locator('[data-card-visibility-monitor="v1"]')).toHaveCount(1);
      await expect(page.locator('[data-357-active-hand-region] [data-playing-card-face]')).toHaveCount(gameType === 'holm-game' ? 4 : 3);
    }
    await session.peerPage.waitForTimeout(800);
    evidence.healthyEvents = await events(); expect((evidence.healthyEvents as unknown[]).length, 'Unexpected healthy-play incidents; see evidence.json').toBe(0);
    // Fault is local DOM only. The authoritative practice hand stays untouched.
    await session.peerPage.locator('[data-357-active-hand-region]').evaluate(node => { (node as HTMLElement).style.opacity = '0'; });
    await expect.poll(async () => (await events()).length).toBe(1);
    evidence.incidents = await events();
    expect((evidence.incidents as any[])[0].payload.sample.failures).toContain('self-cards-missing');
    await session.peerPage.screenshot({ path: info.outputPath('injected-card-loss.png') });
    await session.peerPage.locator('[data-357-active-hand-region]').evaluate(node => { (node as HTMLElement).style.opacity = ''; });
    await expect(session.peerPage.locator('[data-357-active-hand-region] [data-playing-card-face]').first()).toBeVisible();
    await session.hostPage.getByRole('button', { name: 'Player options', exact: true }).click();
    await session.hostPage.getByRole('menuitem', { name: /Pause Game/ }).click();
    // Both arms must use the same historical-entry path. Previously the candidate
    // retained a live-deal runtime while the baseline was a fresh mount.
    await session.peerPage.reload();
    await expect(session.peerPage.locator('[data-357-active-hand-region] [data-playing-card-face]')).toHaveCount(gameType === 'holm-game' ? 4 : 3);
    const state = await session.peerContext.storageState();
    baselineContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      baseURL: 'http://127.0.0.1:4794', storageState: { ...state, origins: state.origins.map(o => ({ ...o, origin: o.origin.replace(':4793', ':4794') })) } });
    const baseline = await baselineContext.newPage();
    await baseline.goto(`/game/${session.gameId}`);
    await expect(baseline.locator('[data-357-active-hand-region] [data-playing-card-face]')).toHaveCount(gameType === 'holm-game' ? 4 : 3);
    await expect(baseline.locator('[data-card-visibility-monitor]')).toHaveCount(0);
    evidence.afterEquivalentEntry = await events();
    const measurements: Record<string, number[]> = { enabled: [], baseline: [] };
    for (const enabled of [true, false, false, true, true, false, false, true]) {
      const page = enabled ? session.peerPage : baseline;
      await page.bringToFront();
      const times = await page.evaluate(async () => {
        const times: number[] = [];
        for (let i = 0; i < 14; i++) {
          const button = document.querySelector<HTMLButtonElement>(`[data-canonical-shell-tabbar] [aria-label="${i % 2 === 0 ? 'Chat' : 'Cards'}"]`);
          if (!button) throw new Error('Missing actual HUD tab control');
          const at = performance.now(); button.click();
          await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
          if (i >= 2) times.push(performance.now() - at);
        }
        return times;
      });
      measurements[enabled ? 'enabled' : 'baseline'].push(...times);
    }
    const p95 = (values: number[]) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * .95) - 1];
    evidence.responsiveness = { measurements, baselineP95: p95(measurements.baseline), enabledP95: p95(measurements.enabled),
      baselineP50: [...measurements.baseline].sort((a,b) => a-b)[Math.ceil(measurements.baseline.length / 2) - 1],
      enabledP50: [...measurements.enabled].sort((a,b) => a-b)[Math.ceil(measurements.enabled.length / 2) - 1],
      baselineMax: Math.max(...measurements.baseline), enabledMax: Math.max(...measurements.enabled),
      addedP95: p95(measurements.enabled) - p95(measurements.baseline) };
    // Jeremy approved the practical +20 ms budget on September 15; percentages are diagnostic only.
    expect.soft((evidence.responsiveness as any).addedP95, 'Actual HUD click-to-paint added p95 budget').toBeLessThanOrEqual(20);
    if (gameType === 'holm-game') {
      evidence.profile = await profileCardVisibility(session.peerPage, info);
      const profile = evidence.profile as Awaited<ReturnType<typeof profileCardVisibility>>;
      expect(profile.longTasks.filter(ms => ms >= 100), 'No repeated >=100ms main-thread stalls during the bounded profile').toHaveLength(0);
      expect(profile.diagnosticRequests, 'Healthy HUD interactions must not write diagnostic rows').toBe(0);
    }
    evidence.finalIncidents = await events();
    expect((evidence.finalIncidents as unknown[]).length, 'No repeated incident or false tab/pause alarms').toBe(1);
  } finally {
    evidence.finalIncidents = await events();
    await baselineContext?.close();
    const { error: cleanupError } = await session.cleanupClient.from('debug_events').delete().eq('game_id', session.gameId).eq('event_type', 'card-visibility-invariant');
    evidence.incidentCleanup = cleanupError?.message ?? 'deleted';
    evidence.cleanup = await blastFakeMoneySession(session);
    fs.mkdirSync(info.outputDir, { recursive: true }); fs.writeFileSync(info.outputPath('evidence.json'), JSON.stringify(evidence, null, 2));
    await closeTwoClientSession(session);
  }
});
