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
import {
  TerminalSettlementProbe,
  type CribbageProgress,
} from '../terminal/support/terminalSettlementProbe';
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
  await expect(page.locator('[data-cribbage-card-selected="1"]:visible')).toHaveCount(1);
  await page.locator(
    '[data-cribbage-hand-card-key]:not([data-cribbage-card-selected="1"]):visible',
  ).first().click();
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

type CribbageBranchState = {
  phase?: string;
  dealerPlayerId?: string;
  cutCard?: { rank?: string; suit?: string; value?: number } | null;
  crib?: Array<{ rank?: string; suit?: string; value?: number }>;
  lastEvent?: { type?: string; label?: string; points?: number; count?: number } | null;
  playerStates?: Record<string, { pegScore?: number }>;
  pegging?: {
    playedCards?: Array<{
      playerId?: string;
      card?: { rank?: string; suit?: string; value?: number };
    }>;
  };
  countingPlan?: {
    baselineScores?: Record<string, number>;
    targets?: Array<{
      playerId?: string;
      type?: 'hand' | 'crib';
      comboPoints?: number[];
      totalPoints?: number;
    }>;
  };
  lastHandCount?: {
    playerHandScores?: Record<string, {
      fifteens?: number; pairs?: number; runs?: number; flush?: number; nobs?: number; total?: number;
    }>;
    dealerHandScore?: {
      fifteens?: number; pairs?: number; runs?: number; flush?: number; nobs?: number; total?: number;
    };
    cribScore?: {
      fifteens?: number; pairs?: number; runs?: number; flush?: number; nobs?: number; total?: number;
    };
  };
};

async function exerciseCribbageRuleFixtureOpening(
  scenario: Scenario,
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown> | null> {
  const profile = scenario.cribbageFixtureProfile;
  if (!profile) return null;

  for (const page of [session.hostPage, session.peerPage]) {
    await waitForSixCribbageCards(page);
    await selectTwoAndReadDiscardHit(page);
    const surface = page.locator('[data-authoritative-action-surface="cribbage-discard"]');
    await surface.click({ timeout: 15_000 });
    await expect(page.locator('[data-cribbage-hand-card-key]:visible')).toHaveCount(4, {
      timeout: 30_000,
    });
  }
  let state: CribbageBranchState | null = null;
  await expect.poll(async () => {
    state = await probe.readCribbageRoundState(session.gameId, dealerGameId, 1) as CribbageBranchState | null;
    return state?.phase ?? null;
  }, { timeout: 60_000, intervals: [100, 250, 500] }).toBe(scenario.cribbageOpeningPhase);
  if (!state) throw new Error(`Missing first-hand evidence for ${scenario.id}`);
  expect(Object.prototype.hasOwnProperty.call(state, 'campaignHarnessProfile')).toBe(false);

  const scores = Object.values(state.playerStates ?? {})
    .map((player) => Number(player.pegScore ?? 0))
    .sort((left, right) => left - right);
  if (profile === 'near_double_skunk') expect(scores).toEqual([10, 119]);
  if (profile === 'max_pegging_fan') {
    expect(state.cutCard).toEqual({ rank: '4', suit: 'spades', value: 4 });
  }
  if (profile === 'perpetual_heels') {
    expect(state.cutCard?.rank).toBe('J');
    expect(state.lastEvent?.type).toBe('his_heels');
  }
  if (profile === 'fifteen_run_go_counting') {
    expect(state.cutCard).toEqual({ rank: '4', suit: 'hearts', value: 4 });
  }
  if (profile === 'crib_flush_qualifying') {
    expect(state.cutCard).toEqual({ rank: '5', suit: 'clubs', value: 5 });
  }
  if (profile === 'crib_flush_nonqualifying') {
    expect(state.cutCard).toEqual({ rank: '5', suit: 'hearts', value: 5 });
  }

  return {
    profile,
    phase: state.phase,
    cutCard: state.cutCard,
    lastEvent: state.lastEvent,
    scores,
    privateMarkerExposed: false,
  };
}

async function exerciseCribbageFifteenRunGoSequence(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown>> {
  const expectedRanks = ['5', '10', '6', '10', '9', '8', '7', 'J'] as const;

  for (const [index, rank] of expectedRanks.entries()) {
    const selector =
      `[data-cribbage-card-playable="1"]`
      + `[data-cribbage-hand-card-key^="${rank}"]`
      + ':not(:disabled):visible';
    const hostCards = session.hostPage.locator(selector);
    const peerCards = session.peerPage.locator(selector);

    await expect.poll(async () => {
      const [hostCount, peerCount] = await Promise.all([
        hostCards.count(),
        peerCards.count(),
      ]);
      return Number(hostCount > 0) + Number(peerCount > 0);
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(1);

    const actorCards = await hostCards.count() > 0 ? hostCards : peerCards;
    await actorCards.first().click({ timeout: 15_000, noWaitAfter: true });

    await expect.poll(async () => {
      const state = await probe.readCribbageRoundState(
        session.gameId,
        dealerGameId,
        1,
      ) as CribbageBranchState | null;
      return state?.pegging?.playedCards?.[index]?.card?.rank ?? null;
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(rank);
  }

  const state = await probe.readCribbageRoundState(
    session.gameId,
    dealerGameId,
    1,
  ) as CribbageBranchState | null;
  const playedRanks = state?.pegging?.playedCards?.map((play) => play.card?.rank) ?? [];
  expect(playedRanks).toEqual(expectedRanks);
  expect(state?.phase).toBe('counting');

  return {
    playedRanks,
    phase: state?.phase ?? null,
    lastEvent: state?.lastEvent ?? null,
    countingBaselineScores: state?.countingPlan?.baselineScores ?? null,
  };
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

type CribbagePhaseRejoinLabel = 'discard' | 'cut-to-pegging' | 'counting' | 'successor-hand';

function createCribbagePhaseRejoinController(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
) {
  const completed = new Set<CribbagePhaseRejoinLabel>();
  const observations: Array<Record<string, unknown>> = [];

  const reloadPeerAt = async (
    label: CribbagePhaseRejoinLabel,
    progress: CribbageProgress,
  ): Promise<void> => {
    completed.add(label);
    await session.peerPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'cribbage');
    await expectCanonicalContinuity(session.peerPage);
    await expect(session.peerPage).toHaveURL(new RegExp(`/game/${session.gameId}$`));

    const visibleCards = session.peerPage.locator('[data-cribbage-hand-card-key]:visible');
    if (label === 'discard' || label === 'successor-hand') {
      await waitForSixCribbageCards(session.peerPage);
    } else if (label === 'cut-to-pegging') {
      await expect(visibleCards).toHaveCount(4, { timeout: 30_000 });
      await expect.poll(async () => {
        const selector = '[data-cribbage-card-playable="1"]:not(:disabled):visible';
        return (await session.hostPage.locator(selector).count())
          + (await session.peerPage.locator(selector).count());
      }, { timeout: 30_000, intervals: [100, 250, 500] }).toBeGreaterThan(0);
    } else {
      await expect(session.peerPage.locator(
        '[data-authoritative-action-surface="cribbage-discard"]:visible',
      )).toHaveCount(0);
      await expect(session.peerPage.locator(
        '[data-cribbage-card-playable="1"]:not(:disabled):visible',
      )).toHaveCount(0);
      await expect.poll(
        async () => (await probe.readCribbageProgress(session.gameId, dealerGameId)).phase,
        { timeout: 15_000, intervals: [100, 250, 500] },
      ).toBe('counting');
    }

    const after = await probe.readCribbageProgress(session.gameId, dealerGameId);
    observations.push({
      label,
      before: progress,
      after,
      visibleCardCount: await visibleCards.count(),
      discardSurfaceCount: await session.peerPage.locator(
        '[data-authoritative-action-surface="cribbage-discard"]:visible',
      ).count(),
      playableCardCount: await session.peerPage.locator(
        '[data-cribbage-card-playable="1"]:not(:disabled):visible',
      ).count(),
    });
  };

  return {
    onProgress: async (progress: CribbageProgress): Promise<void> => {
      let label: CribbagePhaseRejoinLabel | null = null;
      if (progress.handNumber === 1 && progress.phase === 'discarding') label = 'discard';
      else if (progress.handNumber === 1 && progress.phase === 'pegging') label = 'cut-to-pegging';
      else if (progress.phase === 'counting') label = 'counting';
      else if ((progress.handNumber ?? 0) >= 2 && progress.phase === 'discarding') label = 'successor-hand';
      if (label && !completed.has(label)) await reloadPeerAt(label, progress);
    },
    assertComplete: (): void => {
      expect([...completed].sort()).toEqual(
        ['counting', 'cut-to-pegging', 'discard', 'successor-hand'],
      );
    },
    evidence: (terminalRejoin?: Record<string, unknown>) => ({
      observations,
      completed: [...completed].sort(),
      terminalRejoin: terminalRejoin ?? null,
    }),
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
  // The second first-draw pass atomically draws one stock card for the
  // nondealer and advances directly to discard; there is no intermediate
  // draw surface for that rule branch.
  let actor = await waitForGinActor(session, 'select');
  await selectFirstLegalGinDiscard(actor);
  const automaticStockDiscardActionCount = await commitGinAction(
    session,
    probe,
    dealerGameId,
    actor.locator(ginSurface('discard')).getByRole('button', { name: 'Discard', exact: true }),
  );

  actor = await waitForGinActor(session, 'draw');
  const stockActionCount = await clickGinPile(session, probe, dealerGameId, actor, 'stock');
  actor = await waitForGinActor(session, 'select');
  await selectFirstLegalGinDiscard(actor);
  const explicitStockDiscardActionCount = await commitGinAction(
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
    automaticStockDiscardActionCount,
    stockActionCount,
    explicitStockDiscardActionCount,
    discardPileActionCount,
    lockedTakenDiscardCount,
    secondDiscardActionCount,
  };
}

type GinFixtureKnockResult = {
  knockerId?: string;
  opponentId?: string;
  knockerDeadwood?: number;
  opponentDeadwood?: number;
  isGin?: boolean;
  isUndercut?: boolean;
  pointsAwarded?: number;
  winnerId?: string;
};

async function selectGinCard(page: Page, rank: string, suit: string): Promise<void> {
  const card = page.getByRole('button', { name: `${rank} ${suit}`, exact: true });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card).toBeEnabled({ timeout: 30_000 });
  await card.click({ noWaitAfter: true });
}

async function selectGinDiscardCard(page: Page, rank: string, suit: string): Promise<void> {
  await selectGinCard(page, rank, suit);
  await expect(page.locator(ginSurface('discard'))).toBeVisible({ timeout: 30_000 });
}

async function layOffGinCard(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  page: Page,
  rank: string,
  suit: string,
): Promise<number> {
  await selectGinCard(page, rank, suit);
  const target = page.locator(
    '[data-artifact-id="gin.knockDisplay"] button:enabled:visible',
  ).first();
  await expect(
    target,
    `Expected ${rank}${suit} to expose an enabled Gin lay-off meld target`,
  ).toBeEnabled({ timeout: 30_000 });
  return commitGinAction(session, probe, dealerGameId, target);
}

async function readCompletedGinFixtureState(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown>> {
  let state: Record<string, unknown> | null = null;
  await expect.poll(async () => {
    state = await probe.readGinRoundState(session.gameId, dealerGameId, 1);
    return state?.phase ?? null;
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe('complete');
  if (!state) throw new Error('Gin fixture hand completed without a public state');
  return state;
}

async function waitForGinFixtureContinuation(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown>> {
  let state: Record<string, unknown> | null = null;
  await expect.poll(async () => {
    state = await probe.readGinRoundState(session.gameId, dealerGameId, 2);
    return state?.handNumber ?? null;
  }, { timeout: 30_000, intervals: [250, 500, 1_000] }).toBe(2);
  if (!state) throw new Error('Gin fixture completed without creating hand 2');
  expect(['first_draw', 'playing']).toContain(state.phase);
  return {
    handNumber: state.handNumber,
    phase: state.phase,
    actionCount: state.actionCount,
  };
}

async function waitForGinFixtureTerminalSettlement(
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
  winnerPlayerId: string,
): Promise<Record<string, unknown>> {
  const result = await probe.waitForTerminalResult(
    session.gameId,
    dealerGameId,
    TERMINAL_EXPECTATIONS['gin-rummy'],
    120_000,
  );
  expect(result.winner_player_id).toBe(winnerPlayerId);
  expect(result.hand_number).toBe(1);
  return {
    resultId: result.id,
    handNumber: result.hand_number,
    winnerPlayerId: result.winner_player_id,
    settlementKey: result.settlement_key,
  };
}

async function exerciseGinRuleFixtureOpening(
  scenario: Scenario,
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<Record<string, unknown> | null> {
  const profile = scenario.ginFixtureProfile;
  if (!profile) return null;

  let firstActor = await waitForGinActor(session, 'first-draw');
  const actionCounts: number[] = [];

  if (profile === 'stock_two_void') {
    actionCounts.push(await commitGinAction(
      session,
      probe,
      dealerGameId,
      firstActor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Pass', exact: true }),
    ));
    const secondActor = await waitForGinActor(session, 'first-draw');
    actionCounts.push(await commitGinAction(
      session,
      probe,
      dealerGameId,
      secondActor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Pass', exact: true }),
    ));
    const discardActor = await waitForGinActor(session, 'select');
    await selectFirstLegalGinDiscard(discardActor);
    actionCounts.push(await commitGinAction(
      session,
      probe,
      dealerGameId,
      discardActor.locator(ginSurface('discard')).getByRole('button', { name: 'Discard', exact: true }),
    ));
    const state = await readCompletedGinFixtureState(session, probe, dealerGameId);
    expect(state.knockResult ?? null).toBeNull();
    expect(state.winnerPlayerId ?? null).toBeNull();
    expect((state.stockPile as unknown[] | undefined)?.length).toBe(2);
    expect(Object.values(state.matchScores as Record<string, number>)).toEqual([0, 0]);
    return { profile, actionCounts, phase: state.phase, stockCount: 2, knockResult: null };
  }

  if (profile === 'gin') {
    const hostTargetCard = session.hostPage.getByRole('button', { name: 'K ♣', exact: true });
    const peerTargetCard = session.peerPage.getByRole('button', { name: 'K ♣', exact: true });
    await expect.poll(async () => (
      await hostTargetCard.count() + await peerTargetCard.count()
    ), { timeout: 30_000, intervals: [100, 250, 500] }).toBe(1);
    const targetActor = await hostTargetCard.count() === 1
      ? session.hostPage
      : session.peerPage;
    if (firstActor !== targetActor) {
      actionCounts.push(await commitGinAction(
        session,
        probe,
        dealerGameId,
        firstActor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Pass', exact: true }),
      ));
      firstActor = await waitForGinActor(session, 'first-draw');
    }
    expect(firstActor).toBe(targetActor);
  }

  actionCounts.push(await commitGinAction(
    session,
    probe,
    dealerGameId,
    firstActor.locator(ginSurface('first-draw')).getByRole('button', { name: 'Take', exact: true }),
  ));

  const discard = profile === 'normal_knock_layoff'
    ? { rank: 'K', suit: '♥', button: /Knock!/ }
    : profile === 'undercut'
      ? { rank: 'A', suit: '♠', button: /Knock!/ }
      : { rank: 'K', suit: '♣', button: /GIN!/ };
  const discardActor = await waitForGinActor(session, 'select');
  await selectGinDiscardCard(discardActor, discard.rank, discard.suit);
  actionCounts.push(await commitGinAction(
    session,
    probe,
    dealerGameId,
    discardActor.locator(ginSurface('discard')).getByRole('button', { name: discard.button }),
  ));

  if (profile !== 'gin') {
    const layoffActor = session.hostPage === discardActor ? session.peerPage : session.hostPage;
    await expect(layoffActor.locator(
      '[data-authoritative-action-surface="gin-human-turn:lay-off"]:visible',
    )).toBeVisible({ timeout: 30_000 });
    const layoffs = profile === 'normal_knock_layoff'
      ? [{ rank: '2', suit: '♦' }, { rank: 'A', suit: '♣' }, { rank: '9', suit: '♣' }]
      : [{ rank: '2', suit: '♦' }];
    for (const card of layoffs) {
      actionCounts.push(await layOffGinCard(
        session, probe, dealerGameId, layoffActor, card.rank, card.suit,
      ));
    }
    actionCounts.push(await commitGinAction(
      session,
      probe,
      dealerGameId,
      layoffActor.locator(
        '[data-authoritative-action-surface="gin-human-turn:lay-off"]:visible',
      ).getByRole('button', { name: 'Done Laying Off', exact: true }),
    ));
  }

  const state = await readCompletedGinFixtureState(session, probe, dealerGameId);
  const result = state.knockResult as GinFixtureKnockResult | null;
  expect(result).not.toBeNull();
  if (!result) throw new Error('Gin fixture completed without a knock result');

  if (profile === 'normal_knock_layoff') {
    expect(result).toMatchObject({
      knockerDeadwood: 1,
      opponentDeadwood: 61,
      isGin: false,
      isUndercut: false,
      pointsAwarded: 60,
      winnerId: result.knockerId,
    });
  } else if (profile === 'undercut') {
    expect(result).toMatchObject({
      knockerDeadwood: 10,
      opponentDeadwood: 0,
      isGin: false,
      isUndercut: true,
      pointsAwarded: 35,
      winnerId: result.opponentId,
    });
  } else {
    expect(result).toMatchObject({
      knockerDeadwood: 0,
      opponentDeadwood: 71,
      isGin: true,
      isUndercut: false,
      pointsAwarded: 96,
      winnerId: result.knockerId,
    });
  }

  return {
    profile,
    actionCounts,
    phase: state.phase,
    knockResult: result,
    winnerPlayerId: state.winnerPlayerId ?? null,
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
      let cribbageFixtureArmed = false;
      let ginFixtureArmed = false;
      let phaseRejoinController: ReturnType<typeof createCribbagePhaseRejoinController> | null = null;
      try {
        if (scenario.cribbageFixtureProfile) {
          const { data, error } = await session.cleanupClient.rpc(
            'arm_cribbage_rule_branch_harness' as never,
            {
              p_game_id: session.gameId,
              p_profile: scenario.cribbageFixtureProfile,
              p_ttl_seconds: 600,
            } as never,
          );
          if (error || (data as { outcome?: string } | null)?.outcome !== 'armed') {
            throw new Error(
              `Could not arm Cribbage rule fixture: ${error?.message ?? JSON.stringify(data)}`,
            );
          }
          cribbageFixtureArmed = true;
          evidence.fixtureArm = data;
        }
        if (scenario.ginFixtureProfile) {
          const { data, error } = await session.cleanupClient.rpc(
            'arm_gin_rule_branch_harness' as never,
            {
              p_game_id: session.gameId,
              p_profile: scenario.ginFixtureProfile,
              p_ttl_seconds: 600,
            } as never,
          );
          if (error || (data as { outcome?: string } | null)?.outcome !== 'armed') {
            throw new Error(
              `Could not arm Gin rule fixture: ${error?.message ?? JSON.stringify(data)}`,
            );
          }
          ginFixtureArmed = true;
          evidence.ginFixtureArm = data;
        }
        await enterDealerGameUnderChaos(session, scenario.gameType, { configure: (c) => configure(scenario, c) });
        await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, scenario.gameType);
        const dealerGameId = await authoritativeDealerGameId(session);
        evidence.dealerGameId = dealerGameId;
        if (scenario.exerciseCribbagePhaseRejoinMatrix) {
          phaseRejoinController = createCribbagePhaseRejoinController(session, probe, dealerGameId);
        }
        if (cribbageFixtureArmed) {
          const { data, error } = await session.cleanupClient.rpc(
            'get_cribbage_rule_branch_harness' as never,
            { p_game_id: session.gameId } as never,
          );
          const status = data as { armed?: boolean; consumedAt?: string | null; profile?: string } | null;
          if (
            error
            || status?.armed !== false
            || !status?.consumedAt
            || status.profile !== scenario.cribbageFixtureProfile
          ) {
            throw new Error(
              `Cribbage rule fixture was not consumed exactly once: `
              + `${error?.message ?? JSON.stringify(status)}`,
            );
          }
          evidence.fixtureStatus = status;
        }
        if (ginFixtureArmed) {
          const { data, error } = await session.cleanupClient.rpc(
            'get_gin_rule_branch_harness' as never,
            { p_game_id: session.gameId } as never,
          );
          const status = data as { armed?: boolean; consumedAt?: string | null; profile?: string } | null;
          if (
            error
            || status?.armed !== false
            || !status?.consumedAt
            || status.profile !== scenario.ginFixtureProfile
          ) {
            throw new Error(
              `Gin rule fixture was not consumed exactly once: `
              + `${error?.message ?? JSON.stringify(status)}`,
            );
          }
          evidence.ginFixtureStatus = status;
        }
        if (scenario.exerciseCribbageInteractionSeam) {
          evidence.interactionSeam = await exerciseCribbageInteractionSeam(session, probe, dealerGameId);
        }
        const ginBranchEvidence = await exerciseGinBranchSeam(scenario, session, probe, dealerGameId);
        if (ginBranchEvidence) evidence.ginBranch = ginBranchEvidence;
        const ginFixtureOpening = await exerciseGinRuleFixtureOpening(
          scenario,
          session,
          probe,
          dealerGameId,
        );
        if (ginFixtureOpening) evidence.ginFixtureOpening = ginFixtureOpening;
        const ginFixtureStopsAtContinuation = scenario.ginFixtureProfile === 'undercut'
          || scenario.ginFixtureProfile === 'stock_two_void';
        if (ginFixtureStopsAtContinuation) {
          evidence.ginFixtureContinuation = await waitForGinFixtureContinuation(
            session,
            probe,
            dealerGameId,
          );
          await runOfflineBurst(session.peerContext, 1_250);
          await Promise.all([
            expectCanonicalContinuity(session.hostPage),
            expectCanonicalContinuity(session.peerPage),
          ]);
        } else if (scenario.ginFixtureProfile && ginFixtureOpening?.winnerPlayerId) {
          evidence.ginFixtureTerminal = await waitForGinFixtureTerminalSettlement(
            session,
            probe,
            dealerGameId,
            String(ginFixtureOpening.winnerPlayerId),
          );
        } else {
          await requestLastHand(session, probe);
        await runOfflineBurst(session.peerContext, 1_250);
        await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);
        await branch(scenario, session.hostPage, session.peerPage);
        const cribbageFixtureOpening = scenario.exerciseCribbagePhaseRejoinMatrix
          ? null
          : await exerciseCribbageRuleFixtureOpening(
            scenario,
            session,
            probe,
            dealerGameId,
          );
        if (cribbageFixtureOpening) evidence.cribbageFixtureOpening = cribbageFixtureOpening;
        if (scenario.cribbageFixtureProfile === 'fifteen_run_go_counting') {
          evidence.cribbageFixturePegging = await exerciseCribbageFifteenRunGoSequence(
            session,
            probe,
            dealerGameId,
          );
        }
        const result = phaseRejoinController
          ? await playDealerGameToTerminal(session, scenario.gameType, probe, dealerGameId, {
            onCribbageProgress: phaseRejoinController.onProgress,
          })
          : await playDealerGameToTerminal(session, scenario.gameType, probe, dealerGameId);
        evidence.resultId = result.id;
        evidence.handNumber = result.hand_number;
        if (scenario.cribbageFixtureProfile === 'near_double_skunk') {
          expect(result.winning_hand_description).toContain('Double-Skunk!');
        }
        if (scenario.cribbageFixtureProfile === 'max_pegging_fan') {
          const finalFirstHand = await probe.readCribbageRoundState(
            session.gameId,
            dealerGameId,
            1,
          ) as CribbageBranchState | null;
          const playedCards = finalFirstHand?.pegging?.playedCards ?? [];
          const targets = finalFirstHand?.countingPlan?.targets ?? [];
          expect(playedCards).toHaveLength(8);
          expect(playedCards.map((play) => play.card?.rank)).toEqual([
            '2', '2', '2', '2', '3', '3', '3', '3',
          ]);
          expect(targets.map((target) => target.type)).toEqual(['hand', 'hand', 'crib']);
          expect(targets[0]?.playerId).not.toBe(finalFirstHand?.dealerPlayerId);
          expect(targets[1]?.playerId).toBe(finalFirstHand?.dealerPlayerId);
          expect(targets[2]?.playerId).toBe(finalFirstHand?.dealerPlayerId);
          expect(targets.map((target) => target.comboPoints)).toEqual([
            [2, 2, 3, 3, 3, 3],
            [2, 2, 3, 3, 3, 3],
            [12],
          ]);
          expect(targets.map((target) => target.totalPoints)).toEqual([16, 16, 12]);
          evidence.firstHandFinal = {
            playedCards,
            countingTargets: targets,
            countingBaselineScores: finalFirstHand?.countingPlan?.baselineScores ?? null,
          };
        }
        if (scenario.cribbageFixtureProfile === 'fifteen_run_go_counting') {
          const finalFirstHand = await probe.readCribbageRoundState(
            session.gameId,
            dealerGameId,
            1,
          ) as CribbageBranchState | null;
          const playedCards = finalFirstHand?.pegging?.playedCards ?? [];
          const targets = finalFirstHand?.countingPlan?.targets ?? [];
          const nonDealerId = playedCards[0]?.playerId;
          const dealerId = finalFirstHand?.dealerPlayerId;
          expect(playedCards.map((play) => play.card?.rank)).toEqual([
            '5', '10', '6', '10', '9', '8', '7', 'J',
          ]);
          expect(nonDealerId).toBeTruthy();
          expect(dealerId).toBeTruthy();
          expect(finalFirstHand?.countingPlan?.baselineScores?.[nonDealerId ?? '']).toBe(4);
          expect(finalFirstHand?.countingPlan?.baselineScores?.[dealerId ?? '']).toBe(5);
          expect(finalFirstHand?.lastEvent).toMatchObject({
            type: 'pegging_points', label: 'Last Card', points: 1, count: 10,
          });
          expect(targets.map((target) => target.type)).toEqual(['hand', 'hand', 'crib']);
          expect(targets.map((target) => target.comboPoints)).toEqual([
            [2, 2, 4, 4],
            [2, 1],
            [12],
          ]);
          expect(targets.map((target) => target.totalPoints)).toEqual([12, 3, 12]);
          expect(finalFirstHand?.lastHandCount?.playerHandScores?.[nonDealerId ?? '']).toMatchObject({
            fifteens: 4, runs: 4, flush: 4, total: 12,
          });
          expect(finalFirstHand?.lastHandCount?.dealerHandScore).toMatchObject({
            pairs: 2, nobs: 1, total: 3,
          });
          expect(finalFirstHand?.lastHandCount?.cribScore).toMatchObject({ pairs: 12, total: 12 });
          evidence.firstHandFinal = {
            playedCards,
            countingTargets: targets,
            countingBaselineScores: finalFirstHand?.countingPlan?.baselineScores ?? null,
            lastHandCount: finalFirstHand?.lastHandCount ?? null,
          };
        }
        if (
          scenario.cribbageFixtureProfile === 'crib_flush_qualifying'
          || scenario.cribbageFixtureProfile === 'crib_flush_nonqualifying'
        ) {
          const finalFirstHand = await probe.readCribbageRoundState(
            session.gameId,
            dealerGameId,
            1,
          ) as CribbageBranchState | null;
          const expectedFlush = scenario.cribbageFixtureProfile === 'crib_flush_qualifying' ? 5 : 0;
          expect(finalFirstHand?.crib).toHaveLength(4);
          expect(finalFirstHand?.crib?.map((card) => card.suit)).toEqual([
            'clubs', 'clubs', 'clubs', 'clubs',
          ]);
          expect(finalFirstHand?.lastHandCount?.cribScore?.flush).toBe(expectedFlush);
          evidence.firstHandFinal = {
            cutCard: finalFirstHand?.cutCard ?? null,
            crib: finalFirstHand?.crib ?? null,
            cribScore: finalFirstHand?.lastHandCount?.cribScore ?? null,
          };
        }
        if (scenario.minHand) expect(result.hand_number).toBeGreaterThanOrEqual(scenario.minHand);
        phaseRejoinController?.assertComplete();
        if (phaseRejoinController) evidence.phaseRejoin = phaseRejoinController.evidence();
        await session.peerPage.close();
        session.peerPage = await session.peerContext.newPage();
        await session.peerPage.goto(`/game/${session.gameId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await Promise.all([
          expect(session.hostPage.locator('[data-session-ended-panel]')).toBeVisible({ timeout: 120_000 }),
          expect(session.peerPage).toHaveURL(/\/$/, { timeout: 120_000 }),
          probe.assertTerminalProof(session.gameId, dealerGameId, TERMINAL_EXPECTATIONS[scenario.gameType], result),
        ]);
        if (phaseRejoinController) {
          evidence.phaseRejoin = phaseRejoinController.evidence({
            connectedHostPanelVisible: true,
            freshPeerRedirectedToLobby: true,
          });
        }
        }
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
        if (cribbageFixtureArmed) {
          try {
            const { data, error } = await session.cleanupClient.rpc(
              'cancel_cribbage_rule_branch_harness' as never,
              { p_game_id: session.gameId } as never,
            );
            if (error || (data as { outcome?: string } | null)?.outcome !== 'cancelled') {
              throw new Error(
                `Could not close Cribbage rule fixture: ${error?.message ?? JSON.stringify(data)}`,
              );
            }
            evidence.fixtureCleanup = data;
          } catch (error) {
            teardownErrors.push(error);
          }
        }
        if (ginFixtureArmed) {
          try {
            const { data, error } = await session.cleanupClient.rpc(
              'cancel_gin_rule_branch_harness' as never,
              { p_game_id: session.gameId } as never,
            );
            if (error || (data as { outcome?: string } | null)?.outcome !== 'cancelled') {
              throw new Error(
                `Could not close Gin rule fixture: ${error?.message ?? JSON.stringify(data)}`,
              );
            }
            evidence.ginFixtureCleanup = data;
          } catch (error) {
            teardownErrors.push(error);
          }
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
