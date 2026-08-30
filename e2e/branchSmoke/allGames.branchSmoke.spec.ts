import { expect, type Locator, type Page } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { runOfflineBurst } from '../liveness/support/crossCountryNetwork';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from '../liveness/support/livenessAssertions';
import {
  blastFakeMoneySession,
  closeTwoClientSession,
  createTwoClientSession,
  enterDealerGameUnderChaos,
  type TwoClientSession,
} from '../liveness/support/twoClientSession';
import { authoritativeDealerGameId, playDealerGameToTerminal, requestLastHand, TERMINAL_EXPECTATIONS } from '../terminal/support/terminalActors';
import { TerminalSettlementProbe } from '../terminal/support/terminalSettlementProbe';
import { BRANCH_SMOKE_MANIFEST, type Scenario, validateManifest } from './manifest';
import { capturePreCleanupScreenshots, persistScenarioEvidence } from '../liveness/support/scenarioArtifacts';
import { finalizeScenarioObserver, observerEvidenceSummary } from '../humanChaos/support/scenarioObserver';

validateManifest();
const surface = '[data-authoritative-action-surface="holm-357-decision"]';

async function configure(s: Scenario, c: Locator) {
  if (s.legs !== undefined) await c.locator('#legs-to-win').fill(String(s.legs));
  if (s.cribbageTarget !== undefined) {
    await c.getByRole('combobox').click();
    await c.page().getByRole('option', { name: /Custom/ }).click();
    await c.locator('input[type="number"]').fill(String(s.cribbageTarget));
  }
  if (s.gameType === 'gin-rummy') {
    const short = c.getByRole('button', { name: /Short.*50 pts/ });
    await short.click();
    await expect(short).toHaveClass(/bg-poker-gold\/20/);
  }
}

async function decision(page: Page, label: string) {
  const button = page.locator(surface).getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled({ timeout: 60_000 });
  await button.click();
}

async function branch(s: Scenario, host: Page, peer: Page) {
  const actions = s.program === 'holm-fold-fold' ? ['Fold', 'Fold']
    : s.program === 'holm-stay-fold' ? ['Stay', 'Fold']
      : s.program === 'holm-stay-stay' ? ['Stay', 'Stay']
        : s.program === '357-drop-drop' ? ['Drop', 'Drop']
          : s.program === '357-stay-stay' ? ['Stay', 'Stay'] : null;
  if (actions) await Promise.all([decision(host, actions[0]), decision(peer, actions[1])]);
}

type DiscardHitReceipt = {
  rect: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  centerInsideViewport: boolean;
  disabled: boolean;
  coveredAtCenter: boolean;
  topElement: string | null;
};

async function waitForSixCribbageCards(page: Page): Promise<{ firstToCompleteMs: number }> {
  const cards = page.locator('[data-cribbage-hand-card-key]:visible');
  let firstCardAt = 0;
  await expect.poll(async () => {
    const count = await cards.count();
    if (count > 0 && firstCardAt === 0) firstCardAt = Date.now();
    return count;
  }, { timeout: 60_000, intervals: [100, 200, 500] }).toBeGreaterThan(0);
  await expect.poll(() => cards.count(), {
    timeout: 6_000,
    intervals: [100, 200, 500],
  }).toBe(6);
  return { firstToCompleteMs: Date.now() - firstCardAt };
}

async function selectTwoAndReadDiscardHit(page: Page): Promise<DiscardHitReceipt> {
  const cards = page.locator('[data-cribbage-hand-card-key]:visible');
  const surface = page.locator('[data-authoritative-action-surface="cribbage-discard"]');
  await cards.nth(0).click();
  await cards.nth(1).click();
  await expect(page.locator('[data-cribbage-card-selected="1"]:visible')).toHaveCount(2);
  await expect(surface).toHaveAccessibleName(/Send to Crib \(2\/2\)/);
  await expect(surface).toBeEnabled();
  return surface.evaluate((control): DiscardHitReceipt => {
    const element = control as HTMLButtonElement;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const centerInsideViewport = rect.width > 0 && rect.height > 0
      && centerX >= 0 && centerY >= 0
      && centerX <= window.innerWidth && centerY <= window.innerHeight;
    const top = centerInsideViewport ? document.elementFromPoint(centerX, centerY) : null;
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      centerInsideViewport,
      disabled: element.disabled,
      coveredAtCenter: centerInsideViewport
        ? !(top === element || (top !== null && element.contains(top)))
        : true,
      topElement: top
        ? `${top.tagName.toLowerCase()}${top.getAttribute('data-authoritative-action-surface') ? `[${top.getAttribute('data-authoritative-action-surface')}]` : ''}`
        : null,
    };
  });
}

async function discardSelectedCards(page: Page): Promise<void> {
  const surface = page.locator('[data-authoritative-action-surface="cribbage-discard"]');
  await surface.click({ timeout: 15_000 });
  await expect(surface).toBeHidden({ timeout: 6_000 });
}

async function exerciseCribbageInteractionSeam(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown>> {
  const { hostPage, peerPage } = session;
  const initialArrival = await waitForSixCribbageCards(peerPage);
  await expect(peerPage.locator('[data-card-transport-flying="true"]:visible')).toHaveCount(0, { timeout: 15_000 });

  await peerPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForBothClientsInLiveGame(hostPage, peerPage, 'cribbage');
  await expectCanonicalContinuity(peerPage);
  await expect(peerPage.locator('[data-card-transport-flying="true"]:visible')).toHaveCount(0, { timeout: 15_000 });
  await expect(peerPage.locator('[data-cribbage-hand-card-key]:visible')).toHaveCount(6, { timeout: 15_000 });

  const hit = await selectTwoAndReadDiscardHit(peerPage);
  if (!hit.centerInsideViewport || hit.disabled || hit.coveredAtCenter) {
    throw new Error(`Cribbage discard hit-test failed: ${JSON.stringify(hit)}`);
  }
  await discardSelectedCards(peerPage);

  await waitForSixCribbageCards(hostPage);
  await selectTwoAndReadDiscardHit(hostPage);
  await discardSelectedCards(hostPage);

  await expect.poll(
    async () => (await probe.readCribbageProgress(session.gameId, dealerGameId)).phase,
    { timeout: 60_000, intervals: [250, 500, 1_000] },
  ).toBe('pegging');

  await peerPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForBothClientsInLiveGame(hostPage, peerPage, 'cribbage');
  await expectCanonicalContinuity(peerPage);
  await expect(peerPage.locator('[data-card-transport-flying="true"]:visible')).toHaveCount(0, { timeout: 15_000 });
  await expect(peerPage.locator('[data-cribbage-hand-card-key]:visible')).toHaveCount(4, { timeout: 15_000 });
  await expect.poll(async () => {
    const selector = '[data-cribbage-card-playable="1"]:not(:disabled):visible';
    return (await hostPage.locator(selector).count()) + (await peerPage.locator(selector).count());
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBeGreaterThan(0);

  return {
    initialArrival,
    discardHit: hit,
    discardRejoinCardCount: 6,
    peggingRejoinCardCount: 4,
  };
}

const ginSurface = (phase: 'first-draw' | 'draw' | 'select' | 'discard') =>
  `[data-authoritative-action-surface="gin-human-turn:${phase}"]:visible`;

function ginActorLabel(session: TwoClientSession, page: Page): 'host' | 'peer' {
  return page === session.hostPage ? 'host' : 'peer';
}

async function waitForGinActor(
  session: TwoClientSession,
  phase: 'first-draw' | 'draw' | 'select' | 'discard',
): Promise<Page> {
  const selector = ginSurface(phase);
  await expect.poll(async () => (
    await session.hostPage.locator(selector).count()
    + await session.peerPage.locator(selector).count()
  ), { timeout: 60_000, intervals: [100, 250, 500] }).toBe(1);
  return await session.hostPage.locator(selector).count()
    ? session.hostPage
    : session.peerPage;
}

async function commitGinAction(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  action: Locator,
): Promise<number> {
  const before = await probe.readGinProgress(session.gameId, dealerGameId);
  await expect(action).toBeEnabled({ timeout: 30_000 });
  await action.click({ noWaitAfter: true });
  let actionCount = before.actionCount;
  await expect.poll(async () => {
    actionCount = (await probe.readGinProgress(session.gameId, dealerGameId)).actionCount;
    return actionCount;
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBeGreaterThan(before.actionCount);
  return actionCount;
}

async function reloadGinActor(session: TwoClientSession, page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'gin-rummy');
  await expectCanonicalContinuity(page);
}

async function clickGinPile(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  page: Page,
  pile: 'stock' | 'discard',
): Promise<number> {
  const control = page.locator(`[data-gin-pile="${pile}"][data-gin-pile-layer="button"]`);
  await expect(control).toHaveAttribute('aria-disabled', 'false', { timeout: 30_000 });
  return commitGinAction(session, probe, dealerGameId, control);
}

async function selectFirstLegalGinDiscard(page: Page): Promise<void> {
  const card = page.locator('[data-gin-hand-card-key]:not(:disabled):visible').first();
  await expect(card).toBeEnabled({ timeout: 30_000 });
  await card.click({ noWaitAfter: true });
  await expect(page.locator(ginSurface('discard'))).toBeVisible({ timeout: 30_000 });
}

async function exerciseGinBranchSeam(
  scenario: Scenario,
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown> | null> {
  if (!scenario.program.startsWith('gin-')) return null;

  if (scenario.program === 'gin-nondealer-take-rejoin') {
    let actor = await waitForGinActor(session, 'first-draw');
    const actorBeforeReload = ginActorLabel(session, actor);
    await reloadGinActor(session, actor);
    actor = await waitForGinActor(session, 'first-draw');
    const actionCount = await commitGinAction(
      session,
      probe,
      dealerGameId,
      actor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Take', exact: true }),
    );
    return { actorBeforeReload, actorAfterReload: ginActorLabel(session, actor), actionCount };
  }

  if (scenario.program === 'gin-dealer-take-after-pass') {
    const nonDealer = await waitForGinActor(session, 'first-draw');
    const passActionCount = await commitGinAction(
      session,
      probe,
      dealerGameId,
      nonDealer.locator(ginSurface('first-draw')).getByRole('button', { name: 'Pass', exact: true }),
    );
    const dealer = await waitForGinActor(session, 'first-draw');
    const takeActionCount = await commitGinAction(
      session,
      probe,
      dealerGameId,
      dealer.locator(ginSurface('first-draw')).getByRole('button', { name: 'Take', exact: true }),
    );
    return {
      nonDealer: ginActorLabel(session, nonDealer),
      dealer: ginActorLabel(session, dealer),
      passActionCount,
      takeActionCount,
    };
  }

  const firstActor = await waitForGinActor(session, 'first-draw');
  const firstPassActionCount = await commitGinAction(
    session,
    probe,
    dealerGameId,
    firstActor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Pass', exact: true }),
  );
  const secondActor = await waitForGinActor(session, 'first-draw');
  const secondPassActionCount = await commitGinAction(
    session,
    probe,
    dealerGameId,
    secondActor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Pass', exact: true }),
  );
  let actor = await waitForGinActor(session, 'draw');
  const stockActionCount = await clickGinPile(session, probe, dealerGameId, actor, 'stock');
  actor = await waitForGinActor(session, 'select');
  await selectFirstLegalGinDiscard(actor);
  const firstDiscardActionCount = await commitGinAction(
    session,
    probe,
    dealerGameId,
    actor.locator(ginSurface('discard')).getByRole('button', { name: 'Discard', exact: true }),
  );

  actor = await waitForGinActor(session, 'draw');
  const actorBeforeReload = ginActorLabel(session, actor);
  await reloadGinActor(session, actor);
  actor = await waitForGinActor(session, 'draw');
  const discardPileActionCount = await clickGinPile(session, probe, dealerGameId, actor, 'discard');
  actor = await waitForGinActor(session, 'select');
  const lockedTakenDiscardCount = await actor.locator('[data-gin-hand-card-key]:disabled:visible').count();
  expect(lockedTakenDiscardCount).toBeGreaterThanOrEqual(1);
  await selectFirstLegalGinDiscard(actor);
  const secondDiscardActionCount = await commitGinAction(
    session,
    probe,
    dealerGameId,
    actor.locator(ginSurface('discard')).getByRole('button', { name: 'Discard', exact: true }),
  );

  return {
    firstActor: ginActorLabel(session, firstActor),
    secondActor: ginActorLabel(session, secondActor),
    actorBeforeReload,
    actorAfterReload: ginActorLabel(session, actor),
    firstPassActionCount,
    secondPassActionCount,
    stockActionCount,
    firstDiscardActionCount,
    discardPileActionCount,
    lockedTakenDiscardCount,
    secondDiscardActionCount,
  };
}

test.describe('two-human cross-country branch-smoke matrix', () => {
  for (const scenario of BRANCH_SMOKE_MANIFEST) {
    test(`${scenario.id}`, async ({ browser }, info) => {
      test.setTimeout(25 * 60_000);
      const credentials = requireTwoPlayerEnvironment();
      const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
      const runtime = await session.hostNetwork.waitForRuntimeConfig();
      const probe = await TerminalSettlementProbe.create(runtime.url, runtime.publishableKey, credentials.player1);
      const evidence: Record<string, unknown> = { scenario: scenario.id, coverage: scenario.coverage, status: 'started' };
      let primaryError: unknown = null;
      let teardownFailure: AggregateError | null = null;
      try {
        await enterDealerGameUnderChaos(session, scenario.gameType, { configure: (c) => configure(scenario, c) });
        await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, scenario.gameType);
        const dealerGameId = await authoritativeDealerGameId(session);
        evidence.dealerGameId = dealerGameId;
        if (scenario.exerciseCribbageInteractionSeam) {
          evidence.interactionSeam = await exerciseCribbageInteractionSeam(session, probe, dealerGameId);
        }
        const ginBranchEvidence = await exerciseGinBranchSeam(scenario, session, probe, dealerGameId);
        if (ginBranchEvidence) evidence.ginBranch = ginBranchEvidence;
        await requestLastHand(session, probe);
        await runOfflineBurst(session.peerContext, 1_250);
        await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);
        await branch(scenario, session.hostPage, session.peerPage);
        const result = await playDealerGameToTerminal(session, scenario.gameType, probe, dealerGameId);
        evidence.resultId = result.id;
        evidence.handNumber = result.hand_number;
        if (scenario.minHand) expect(result.hand_number).toBeGreaterThanOrEqual(scenario.minHand);
        await session.peerPage.close();
        session.peerPage = await session.peerContext.newPage();
        await session.peerPage.goto(`/game/${session.gameId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await Promise.all([
          expect(session.hostPage.locator('[data-session-ended-panel]')).toBeVisible({ timeout: 120_000 }),
          expect(session.peerPage).toHaveURL(/\/$/, { timeout: 120_000 }),
          probe.assertTerminalProof(session.gameId, dealerGameId, TERMINAL_EXPECTATIONS[scenario.gameType], result),
        ]);
        evidence.status = 'passed';
        console.log(`[branch-smoke] ${scenario.id} passed`);
      } catch (error) {
        evidence.status = 'failed';
        evidence.error = error instanceof Error ? error.message : String(error);
        console.error(`[branch-smoke] ${scenario.id} failed: ${evidence.error}`);
        primaryError = error;
      } finally {
        const teardownErrors: unknown[] = [];
        try {
          const observation = await finalizeScenarioObserver(session, info);
          evidence.continuousObserver = observerEvidenceSummary(observation.evidence);
          if (!primaryError && observation.failure) {
            primaryError = observation.failure;
            evidence.status = 'failed';
            evidence.error = observation.failure.message;
          }
        } catch (error) {
          teardownErrors.push(error);
        }
        try {
          if (primaryError) await capturePreCleanupScreenshots(info, [
            { label: 'host', page: session.hostPage }, { label: 'peer', page: session.peerPage },
          ]);
        } catch (error) {
          teardownErrors.push(error);
        }
        try {
          evidence.cleanup = await blastFakeMoneySession(session);
        } catch (error) {
          evidence.cleanup = { verified: false, error: error instanceof Error ? error.message : String(error) };
          teardownErrors.push(error);
        }
        try {
          await persistScenarioEvidence(info, 'branch-smoke-evidence.json', evidence);
        } catch (error) {
          teardownErrors.push(error);
        } finally {
          await closeTwoClientSession(session);
        }
        if (teardownErrors.length) {
          teardownFailure = new AggregateError(
            primaryError ? [primaryError, ...teardownErrors] : teardownErrors,
            primaryError
              ? `${scenario.id} failed and teardown also failed`
              : `${scenario.id} teardown failed`,
          );
        }
      }
      if (teardownFailure) throw teardownFailure;
      if (primaryError) throw primaryError;
    });
  }
});
