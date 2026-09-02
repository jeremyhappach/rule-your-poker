import { expect, type Locator, type Page } from '@playwright/test';

import { test } from '../../playwright-fixture';
import { getTotalScore, getUpperSubtotal, hasUpperBonus } from '../../src/lib/yahtzeeScoring';
import type { YahtzeeScorecard } from '../../src/lib/yahtzeeTypes';
import { finalizeScenarioObserver, observerEvidenceSummary } from '../humanChaos/support/scenarioObserver';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from '../liveness/support/livenessAssertions';
import { capturePreCleanupScreenshots, persistScenarioEvidence } from '../liveness/support/scenarioArtifacts';
import {
  blastFakeMoneySession,
  closeTwoClientSession,
  createTwoClientSession,
  enterDealerGameUnderChaos,
  type TwoClientSession,
} from '../liveness/support/twoClientSession';
import { authoritativeDealerGameId, requestLastHand, TERMINAL_EXPECTATIONS } from '../terminal/support/terminalActors';
import { TerminalSettlementProbe } from '../terminal/support/terminalSettlementProbe';
import {
  TARGET_GAUNTLET_MANIFEST,
  type TargetGauntletScenario,
  type YahtzeeCategory,
  validateTargetGauntletManifest,
} from './manifest';

validateTargetGauntletManifest();

type JsonObject = Record<string, unknown>;
type RoundSnapshot = {
  id: string;
  dealer_game_id: string;
  hand_number: number;
  round_number: number;
  status: string;
  yahtzee_state?: JsonObject | null;
  community_cards?: unknown[] | null;
  chucky_cards?: unknown[] | null;
  three_five_seven_wild_rank?: string | null;
  three_five_seven_opening_transfer_cursor?: number | null;
};

const decisionSurface = '[data-authoritative-action-surface="holm-357-decision"]';
const requestedGame = process.env.PTOWN_E2E_TARGET_GAME?.trim();
if (requestedGame && !['yahtzee', 'holm-game', '3-5-7'].includes(requestedGame)) {
  throw new Error('PTOWN_E2E_TARGET_GAME must be yahtzee, holm-game, or 3-5-7.');
}
const scenarios = TARGET_GAUNTLET_MANIFEST.filter((row) => !requestedGame || row.gameType === requestedGame);

async function setSwitch(config: Locator, label: string, desired: boolean): Promise<void> {
  // Dealer setup renders the Label and Switch as siblings within this row.
  // Scope through their shared row rather than looking for a switch beneath
  // the label itself.
  const row = config.getByText(label, { exact: true }).locator('..').locator('..');
  const control = row.getByRole('switch');
  await expect(control).toBeVisible();
  const current = await control.getAttribute('aria-checked') === 'true';
  if (current !== desired) await control.click();
  await expect(control).toHaveAttribute('aria-checked', String(desired));
}

async function configureScenario(scenario: TargetGauntletScenario, config: Locator): Promise<void> {
  const options = scenario.config;
  if (!options) return;
  if (options.chuckyCards !== undefined) await config.locator('#chucky').fill(String(options.chuckyCards));
  if (options.legsToWin !== undefined) await config.locator('#legs-to-win').fill(String(options.legsToWin));
  if (options.legValue !== undefined) await config.locator('#leg-value').fill(String(options.legValue));
  if (options.rolloverAmount !== undefined) await config.locator('#rollover-357').fill(String(options.rolloverAmount));
  if (options.pussyTax !== undefined) await setSwitch(config, 'Pussy Tax', options.pussyTax);
  if (options.potMax !== undefined) await setSwitch(config, 'Pot Max', options.potMax);
  if (options.rabbitHunt !== undefined) await setSwitch(config, 'Rabbit Hunt', options.rabbitHunt);
  if (options.revealAtShowdown !== undefined) {
    await setSwitch(config, 'Secret Reveal at Showdown', options.revealAtShowdown);
  }
}

async function readLatestRound(session: TwoClientSession, dealerGameId: string): Promise<RoundSnapshot | null> {
  const { data, error } = await session.cleanupClient
    .from('rounds')
    .select('*')
    .eq('game_id', session.gameId)
    .eq('dealer_game_id', dealerGameId)
    .order('hand_number', { ascending: false })
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read target round: ${error.message}`);
  return data as unknown as RoundSnapshot | null;
}

async function readRoundById(session: TwoClientSession, roundId: string): Promise<RoundSnapshot | null> {
  const { data, error } = await session.cleanupClient
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .maybeSingle();
  if (error) throw new Error(`Could not read exact target round: ${error.message}`);
  return data as unknown as RoundSnapshot | null;
}

async function readRoundCards(session: TwoClientSession, roundId: string): Promise<Array<{ player_id: string; cards: unknown[] }>> {
  const { data, error } = await session.cleanupClient
    .from('player_cards')
    .select('player_id,cards')
    .eq('round_id', roundId)
    .order('player_id', { ascending: true });
  if (error) throw new Error(`Could not read target player cards: ${error.message}`);
  return (data ?? []) as unknown as Array<{ player_id: string; cards: unknown[] }>;
}

async function waitForRound(
  session: TwoClientSession,
  dealerGameId: string,
  predicate: (round: RoundSnapshot) => boolean,
  description: string,
): Promise<RoundSnapshot> {
  let snapshot: RoundSnapshot | null = null;
  await expect.poll(async () => {
    snapshot = await readLatestRound(session, dealerGameId);
    return Boolean(snapshot && predicate(snapshot));
  }, { timeout: 90_000, intervals: [100, 250, 500, 1_000] }).toBe(true);
  if (!snapshot) throw new Error(`Missing ${description}`);
  return snapshot;
}

async function submitDecision(page: Page, label: 'Stay' | 'Fold' | 'Drop'): Promise<void> {
  const button = page.locator(decisionSurface).getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled({ timeout: 60_000 });
  await button.click();
}

async function submitPair(
  session: TwoClientSession,
  labels: readonly ['Stay' | 'Fold' | 'Drop', 'Stay' | 'Fold' | 'Drop'],
): Promise<void> {
  await Promise.all([
    submitDecision(session.hostPage, labels[0]),
    submitDecision(session.peerPage, labels[1]),
  ]);
}

function yahtzeeState(round: RoundSnapshot): {
  currentTurnPlayerId?: string;
  gamePhase?: string;
  playerStates?: Record<string, { scorecard?: YahtzeeScorecard }>;
} {
  return (round.yahtzee_state ?? {}) as ReturnType<typeof yahtzeeState>;
}

async function scorePreparedYahtzeeTurn(
  session: TwoClientSession,
  dealerGameId: string,
  category: YahtzeeCategory,
  expectScratch: boolean,
  expectJokerForced: boolean,
): Promise<JsonObject> {
  const before = await readLatestRound(session, dealerGameId);
  if (!before) throw new Error('Yahtzee round disappeared before fixture preparation');
  const beforeState = yahtzeeState(before);
  const playerId = beforeState.currentTurnPlayerId;
  if (!playerId) throw new Error('Yahtzee fixture turn has no authoritative player');
  const pageCandidates = [session.hostPage, session.peerPage];

  const { data, error } = await session.cleanupClient.rpc(
    'prepare_yahtzee_rule_branch_turn' as never,
    { p_game_id: session.gameId } as never,
  );
  const receipt = data as JsonObject | null;
  if (error || receipt?.outcome !== 'prepared' || receipt.playerId !== playerId) {
    throw new Error(`Could not prepare Yahtzee turn: ${error?.message ?? JSON.stringify(receipt)}`);
  }

  // The fixture writes through a separately authenticated admin client. A
  // fresh mount proves the canonical round can hydrate that exact state and
  // avoids treating browser-local optimistic roll state as fixture authority.
  await Promise.all(pageCandidates.map((page) => page.reload({ waitUntil: 'domcontentloaded' })));
  await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'yahtzee');
  await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);

  let actor: Page | null = null;
  await expect.poll(async () => {
    for (const page of pageCandidates) {
      if (await page.locator(`[data-yahtzee-category="${category}"][data-yahtzee-category-available="1"]:visible`).count()) {
        actor = page;
        return true;
      }
    }
    return false;
  }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true);
  if (!actor) throw new Error(`No client rendered the prepared ${category} Yahtzee choice`);

  if (expectJokerForced) {
    await expect(actor.locator('[data-yahtzee-category="chance"][data-yahtzee-category-available="1"]:visible')).toHaveCount(0);
  }
  const actionResponse = actor.waitForResponse((response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/rest/v1/rpc/yahtzee_apply_action')
  ), { timeout: 30_000 });
  await actor.locator(`[data-yahtzee-category="${category}"][data-yahtzee-category-available="1"]:visible`).click();
  const confirmZero = actor.getByRole('button', { name: 'Yes, take 0', exact: true });
  if (expectScratch) {
    await expect(confirmZero).toBeVisible();
    await confirmZero.click();
  } else if (await confirmZero.isVisible()) {
    throw new Error(`Unexpected zero confirmation for ${category}`);
  }
  const response = await actionResponse;
  let result: JsonObject;
  try {
    result = await response.json() as JsonObject;
  } catch {
    result = {};
  }
  if (!response.ok()) {
    throw new Error(`Yahtzee ${category} action RPC failed: ${JSON.stringify({
      status: response.status(),
      code: result.code,
      message: result.message,
      details: result.details,
      hint: result.hint,
    })}`);
  }
  const state = result.state as ReturnType<typeof yahtzeeState> | undefined;
  const score = state?.playerStates?.[playerId]?.scorecard?.scores?.[category];
  if (result.outcome !== 'applied' || result.action !== 'score' || result.category !== category || score === undefined) {
    throw new Error(`Yahtzee ${category} action was not authoritatively applied: ${JSON.stringify({
      outcome: result.outcome, action: result.action, category: result.category, reason: result.reason,
    })}`);
  }
  return { roundId: before.id, playerId, category, score, state };
}

async function exerciseYahtzee(
  scenario: TargetGauntletScenario,
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<JsonObject> {
  await requestLastHand(session, probe);
  const category = scenario.yahtzeeCategory;
  if (!category) throw new Error('Yahtzee scenario lacks category');
  const receipts: JsonObject[] = [];
  receipts.push(await scorePreparedYahtzeeTurn(session, dealerGameId, category, Boolean(scenario.expectYahtzeeScratch), Boolean(scenario.expectJokerForced)));
  receipts.push(await scorePreparedYahtzeeTurn(session, dealerGameId, category, Boolean(scenario.expectYahtzeeScratch), Boolean(scenario.expectJokerForced)));
  if (scenario.expectJokerForced) {
    receipts.push(await scorePreparedYahtzeeTurn(session, dealerGameId, 'chance', false, false));
    receipts.push(await scorePreparedYahtzeeTurn(session, dealerGameId, 'chance', false, false));
    for (const receipt of receipts.slice(0, 2)) {
      const state = receipt.state as ReturnType<typeof yahtzeeState>;
      const scorecard = state.playerStates?.[String(receipt.playerId)]?.scorecard;
      expect(scorecard?.yahtzeeBonuses).toBeGreaterThanOrEqual(1);
    }
  }
  if (scenario.id === 'yahtzee-upper-below') {
    for (const receipt of receipts) {
      const state = receipt.state as ReturnType<typeof yahtzeeState>;
      const scorecard = state.playerStates?.[String(receipt.playerId)]?.scorecard;
      expect(scorecard).toBeDefined();
      if (!scorecard) throw new Error('Yahtzee upper-below receipt omitted its scorecard');
      const rawTotal = Object.values(scorecard.scores).reduce((total, score) => total + (score ?? 0), 0)
        + scorecard.yahtzeeBonuses * 100;
      expect(getUpperSubtotal(scorecard)).toBe(62);
      expect(hasUpperBonus(scorecard)).toBe(false);
      expect(getTotalScore(scorecard)).toBe(rawTotal);
    }
  }
  if (scenario.id === 'yahtzee-upper-threshold') {
    for (const receipt of receipts) {
      const state = receipt.state as ReturnType<typeof yahtzeeState>;
      const scorecard = state.playerStates?.[String(receipt.playerId)]?.scorecard;
      expect(scorecard).toBeDefined();
      if (!scorecard) throw new Error('Yahtzee upper-threshold receipt omitted its scorecard');
      const rawTotal = Object.values(scorecard.scores).reduce((total, score) => total + (score ?? 0), 0)
        + scorecard.yahtzeeBonuses * 100;
      expect(getUpperSubtotal(scorecard)).toBe(63);
      expect(hasUpperBonus(scorecard)).toBe(true);
      expect(getTotalScore(scorecard)).toBe(rawTotal + 35);
    }
  }
  if (scenario.expectYahtzeeTie) {
    const successor = await waitForRound(
      session,
      dealerGameId,
      // Yahtzee uses one round per hand, so its round number mirrors the hand number.
      (round) => round.hand_number === 2 && round.round_number === 2 && round.status === 'betting',
      'Yahtzee tied-scorecard successor',
    );
    const successorState = yahtzeeState(successor);
    for (const player of Object.values(successorState.playerStates ?? {})) {
      expect(Object.keys(player.scorecard?.scores ?? {})).toHaveLength(0);
    }
    // The score fixture already proves the authoritative tie rollover. Remount
    // one peer only after that successor exists, so the check covers hydration
    // of the new identity rather than relying on the prior browser's state.
    await session.peerPage.close();
    session.peerPage = await session.peerContext.newPage();
    await session.peerPage.goto(`/game/${session.gameId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, 'yahtzee');
    await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);
    await expect(session.peerPage.locator('[data-yahtzee-scorecard]').first()).toBeVisible();
    const remountedSuccessor = await readLatestRound(session, dealerGameId);
    expect(remountedSuccessor?.id).toBe(successor.id);
    return { receipts, successor };
  }
  const result = await probe.waitForTerminalResult(session.gameId, dealerGameId, TERMINAL_EXPECTATIONS.yahtzee, 90_000);
  return { receipts, terminalResultId: result.id, handNumber: result.hand_number };
}

async function exerciseHolm(
  scenario: TargetGauntletScenario,
  session: TwoClientSession,
  dealerGameId: string,
): Promise<JsonObject> {
  const first = await readLatestRound(session, dealerGameId);
  if (!first) throw new Error('Holm opening round missing');
  const openingCards = await readRoundCards(session, first.id);
  expect(openingCards).toHaveLength(1);
  expect(openingCards.every((row) => row.cards.length === 4)).toBe(true);
  expect(first.community_cards).toHaveLength(4);
  if (scenario.fixtureProfile) expect(first.chucky_cards).toHaveLength(scenario.config?.chuckyCards ?? 4);

  const labels: readonly ['Stay' | 'Fold', 'Stay' | 'Fold'] = scenario.program === 'holm-fold-fold'
    ? ['Fold', 'Fold']
    : scenario.program === 'holm-stay-fold'
      ? ['Stay', 'Fold']
      : ['Stay', 'Stay'];
  await submitPair(session, labels);
  let completed: RoundSnapshot | null = null;
  await expect.poll(async () => {
    completed = await readRoundById(session, first.id);
    return completed?.status ?? null;
  }, { timeout: 90_000, intervals: [100, 250, 500, 1_000] }).not.toBe('betting');
  if (!completed) throw new Error('Completed Holm hand disappeared');

  if (scenario.program === 'holm-next-hand' || scenario.program === 'holm-fold-fold') {
    const successor = await waitForRound(session, dealerGameId, (round) => round.hand_number >= 2 && round.status === 'betting', 'Holm successor hand');
    expect(successor.id).not.toBe(first.id);
    const successorCards = await readRoundCards(session, successor.id);
    expect(successorCards).toHaveLength(1);
    return { first, completed, successor, openingCards, successorCards };
  }
  return { first, completed, openingCards };
}

async function exercise357(
  scenario: TargetGauntletScenario,
  session: TwoClientSession,
  probe: TerminalSettlementProbe,
  dealerGameId: string,
): Promise<JsonObject> {
  if (scenario.program === '357-instant-sweep') {
    const result = await probe.waitForTerminalResult(session.gameId, dealerGameId, TERMINAL_EXPECTATIONS['3-5-7'], 90_000);
    return { terminalResultId: result.id, handNumber: result.hand_number };
  }
  const first = await readLatestRound(session, dealerGameId);
  if (!first) throw new Error('3-5-7 opening round missing');
  const openingCards = await readRoundCards(session, first.id);
  expect(openingCards).toHaveLength(1);
  expect(openingCards.every((row) => row.cards.length === 3)).toBe(true);

  if (scenario.program === '357-progression' || scenario.program === '357-rollover') {
    const transitions: RoundSnapshot[] = [first];
    for (const targetRound of [2, 3]) {
      await submitPair(session, ['Drop', 'Drop']);
      const next = await waitForRound(
        session,
        dealerGameId,
        (round) => round.hand_number === 1 && round.round_number === targetRound && round.status === 'betting',
        `3-5-7 round ${targetRound}`,
      );
      const cards = await readRoundCards(session, next.id);
      expect(cards.every((row) => row.cards.length === (targetRound === 2 ? 5 : 7))).toBe(true);
      transitions.push(next);
    }
    if (scenario.program === '357-rollover') {
      await submitPair(session, ['Drop', 'Drop']);
      const successor = await waitForRound(
        session,
        dealerGameId,
        (round) => round.hand_number === 2 && round.round_number === 1 && round.status === 'betting',
        '3-5-7 rollover successor',
      );
      const cards = await readRoundCards(session, successor.id);
      expect(cards.every((row) => row.cards.length === 3)).toBe(true);
      expect(successor.three_five_seven_opening_transfer_cursor).toBeTruthy();
      transitions.push(successor);
    }
    return { transitions };
  }

  const labels: readonly ['Stay' | 'Drop', 'Stay' | 'Drop'] = scenario.program === '357-fold-fold'
    ? ['Drop', 'Drop']
    : scenario.program === '357-stay-fold'
      ? ['Stay', 'Drop']
      : ['Stay', 'Stay'];
  await submitPair(session, labels);
  let completed: RoundSnapshot | null = null;
  await expect.poll(async () => {
    completed = await readRoundById(session, first.id);
    return completed?.status ?? null;
  }, { timeout: 90_000, intervals: [100, 250, 500, 1_000] }).not.toBe('betting');
  if (!completed) throw new Error('Completed 3-5-7 round disappeared');
  return { first, completed, openingCards };
}

test.describe('production fake-money target rule gauntlet', () => {
  for (const scenario of scenarios) {
    test(scenario.id, async ({ browser }, info) => {
      const credentials = requireTwoPlayerEnvironment();
      const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
      const runtime = await session.hostNetwork.waitForRuntimeConfig();
      const probe = await TerminalSettlementProbe.create(runtime.url, runtime.publishableKey, credentials.player1);
      const evidence: JsonObject = {
        scenario: scenario.id,
        gameType: scenario.gameType,
        coverage: scenario.coverage,
        target: { frontend: 'https://holm357.com', supabaseProjectRef: 'xvhmbuppghwmwpwrkzao' },
        status: 'started',
      };
      let primaryError: unknown = null;
      const teardownErrors: unknown[] = [];
      let fixtureArmed = false;
      try {
        if (scenario.fixtureProfile) {
          const { data, error } = await session.cleanupClient.rpc(
            'arm_target_rule_branch_harness' as never,
            { p_game_id: session.gameId, p_profile: scenario.fixtureProfile, p_ttl_seconds: 600 } as never,
          );
          if (error || (data as JsonObject | null)?.outcome !== 'armed') {
            throw new Error(`Could not arm target fixture: ${error?.message ?? JSON.stringify(data)}`);
          }
          fixtureArmed = true;
          evidence.fixtureArm = data as JsonObject;
        }

        await enterDealerGameUnderChaos(session, scenario.gameType, {
          configure: (config) => configureScenario(scenario, config),
        });
        // The instant-sweep fixture resolves directly to the authoritative
        // terminal state as the opening hand is created. Requiring an
        // intermediate in-progress render here turns that successful terminal
        // transition into a false harness failure.
        if (scenario.program !== '357-instant-sweep') {
          await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, scenario.gameType);
        }
        await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);
        const dealerGameId = await authoritativeDealerGameId(session);
        evidence.dealerGameId = dealerGameId;

        evidence.exercise = scenario.gameType === 'yahtzee'
          ? await exerciseYahtzee(scenario, session, probe, dealerGameId)
          : scenario.gameType === 'holm-game'
            ? await exerciseHolm(scenario, session, dealerGameId)
            : await exercise357(scenario, session, probe, dealerGameId);
        if (fixtureArmed) {
          const { data, error } = await session.cleanupClient.rpc(
            'get_target_rule_branch_harness' as never,
            { p_game_id: session.gameId } as never,
          );
          const status = data as JsonObject | null;
          if (error || status?.armed !== false || !status.consumedAt || status.profile !== scenario.fixtureProfile) {
            throw new Error(`Target fixture was not consumed exactly once: ${error?.message ?? JSON.stringify(status)}`);
          }
          evidence.fixtureStatus = status;
        }
        await Promise.all([expectCanonicalContinuity(session.hostPage), expectCanonicalContinuity(session.peerPage)]);
        evidence.status = 'passed';
        console.log(`[target-gauntlet] ${scenario.id} passed`);
      } catch (error) {
        primaryError = error;
        evidence.status = 'failed';
        evidence.error = error instanceof Error ? error.message : String(error);
        console.error(`[target-gauntlet] ${scenario.id} failed: ${evidence.error}`);
      } finally {
        try {
          const observation = await finalizeScenarioObserver(session, info);
          evidence.continuousObserver = observerEvidenceSummary(observation.evidence);
          if (!primaryError && observation.failure) {
            primaryError = observation.failure;
            evidence.status = 'failed';
            evidence.error = observation.failure.message;
          }
        } catch (error) { teardownErrors.push(error); }
        try {
          if (primaryError) await capturePreCleanupScreenshots(info, [
            { label: 'host', page: session.hostPage }, { label: 'peer', page: session.peerPage },
          ]);
        } catch (error) { teardownErrors.push(error); }
        if (fixtureArmed) {
          try {
            const { data, error } = await session.cleanupClient.rpc(
              'cancel_target_rule_branch_harness' as never,
              { p_game_id: session.gameId } as never,
            );
            if (error || (data as JsonObject | null)?.outcome !== 'cancelled') {
              throw new Error(`Could not cancel target fixture: ${error?.message ?? JSON.stringify(data)}`);
            }
            evidence.fixtureCleanup = data as JsonObject;
          } catch (error) { teardownErrors.push(error); }
        }
        try {
          evidence.cleanup = await blastFakeMoneySession(session);
        } catch (error) {
          evidence.cleanup = { verified: false, error: error instanceof Error ? error.message : String(error) };
          teardownErrors.push(error);
        }
        try { await persistScenarioEvidence(info, 'target-gauntlet-evidence.json', evidence); }
        catch (error) { teardownErrors.push(error); }
        finally { await closeTwoClientSession(session); }
      }
      if (teardownErrors.length) {
        throw new AggregateError(primaryError ? [primaryError, ...teardownErrors] : teardownErrors, `${scenario.id} teardown failed`);
      }
      if (primaryError) throw primaryError;
    });
  }
});
