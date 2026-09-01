import { expect } from '@playwright/test';

import { test } from '../../playwright-fixture';
import { runOfflineBurst } from '../liveness/support/crossCountryNetwork';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import {
  blastFakeMoneySession,
  closeTwoClientSession,
  configureDealerGameUnderChaos,
  createTwoClientSession,
  startSessionUnderChaos,
  type DealerGameType,
  waitForDealerGameSetupOwner,
} from '../liveness/support/twoClientSession';
import { waitForBothClientsInLiveGame } from '../liveness/support/livenessAssertions';
import { configureShortestTerminal } from '../terminal/support/terminalActors';
import { HUMAN_CHAOS_MANIFEST, type ChaosScenario } from './manifest';
import { finalizeScenarioObserver, observerEvidenceSummary } from './support/scenarioObserver';
import { capturePreCleanupScreenshots, persistScenarioEvidence } from '../liveness/support/scenarioArtifacts';

function selectedDeadline(): ChaosScenario {
  const id = process.env.PTOWN_E2E_CAMPAIGN_SCENARIO?.trim();
  if (!id) throw new Error('Set PTOWN_E2E_CAMPAIGN_SCENARIO to one human-chaos deadline id.');
  const scenario = HUMAN_CHAOS_MANIFEST.find((candidate) => candidate.id === id);
  if (!scenario || scenario.family !== 'deadline-rejoin' || !scenario.source || !scenario.deadline) {
    throw new Error(`Unknown human-chaos deadline scenario: ${id}`);
  }
  return scenario;
}

async function remountPeer(session: Awaited<ReturnType<typeof createTwoClientSession>>): Promise<void> {
  await session.peerPage.close();
  session.peerPage = await session.peerContext.newPage();
  await session.peerPage.goto(`/game/${session.gameId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

async function waitForAuthoritativeChange(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  prior: string | null,
): Promise<void> {
  await expect.poll(async () => {
    const { data, error } = await session.cleanupClient
      .from('games')
      .select('status')
      .eq('id', session.gameId)
      .maybeSingle();
    if (error) throw error;
    return data?.status ?? null;
  }, { timeout: 90_000, intervals: [500, 1_000, 2_000] }).not.toBe(prior);
  await expect(session.peerPage.locator('[data-lifecycle-branch="loaded-inner"]')).toHaveCount(1);
}

type GameplaySnapshot = {
  status: string | null;
  roundId: string | null;
  deadline: string | null;
  turn: number | string | null;
  sequence: number | null;
  decisions: string;
};

type JsonDeadlineState = {
  turnDeadline?: string | null;
  currentTurnPlayerId?: string | null;
  actionSequence?: number | null;
};

async function readGameplaySnapshot(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
): Promise<GameplaySnapshot> {
  const [{ data: game, error: gameError }, { data: players, error: playersError }] = await Promise.all([
    session.cleanupClient
      .from('games')
      .select('status, current_game_uuid, game_type')
      .eq('id', session.gameId)
      .maybeSingle(),
    session.cleanupClient
      .from('players')
      .select('id, current_decision, decision_locked')
      .eq('game_id', session.gameId)
      .order('position'),
  ]);
  if (gameError) throw gameError;
  if (playersError) throw playersError;
  const { data: round, error: roundError } = game?.current_game_uuid == null
    ? { data: null, error: null }
    : await session.cleanupClient
      .from('rounds')
      .select('id, decision_deadline, current_turn_position, holm_turn_sequence, horses_state, yahtzee_state')
      .eq('game_id', session.gameId)
      .eq('dealer_game_id', game.current_game_uuid)
      .order('hand_number', { ascending: false })
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();
  if (roundError) throw roundError;
  const horsesState = (round?.horses_state ?? null) as JsonDeadlineState | null;
  const yahtzeeState = (round?.yahtzee_state ?? null) as JsonDeadlineState | null;
  const isHorsesFamily = game?.game_type === 'horses' || game?.game_type === 'ship-captain-crew';
  const isYahtzee = game?.game_type === 'yahtzee';
  return {
    status: game?.status ?? null,
    roundId: round?.id ?? null,
    deadline: isHorsesFamily
      ? (horsesState?.turnDeadline ?? null)
      : isYahtzee
        ? (yahtzeeState?.turnDeadline ?? round?.decision_deadline ?? null)
        : (round?.decision_deadline ?? null),
    turn: isHorsesFamily
      ? (horsesState?.currentTurnPlayerId ?? null)
      : isYahtzee
        ? (yahtzeeState?.currentTurnPlayerId ?? null)
        : (round?.current_turn_position ?? null),
    sequence: isHorsesFamily
      ? (horsesState?.actionSequence ?? null)
      : isYahtzee
        ? (yahtzeeState?.actionSequence ?? null)
        : (round?.holm_turn_sequence ?? null),
    decisions: JSON.stringify((players ?? []).map((player) => [
      player.id,
      player.current_decision,
      player.decision_locked,
    ])),
  };
}

async function waitForGameplayDeadlineResolution(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  previous: GameplaySnapshot,
): Promise<GameplaySnapshot> {
  let latest = previous;
  await expect.poll(async () => {
    latest = await readGameplaySnapshot(session);
    return latest.status !== previous.status
      || latest.roundId !== previous.roundId
      || latest.deadline !== previous.deadline
      || latest.turn !== previous.turn
      || latest.sequence !== previous.sequence
      || latest.decisions !== previous.decisions;
  }, { timeout: 90_000, intervals: [500, 1_000, 2_000] }).toBe(true);
  return latest;
}

test.describe('two-human cross-country deadline and rejoin campaign', () => {
  test('selected deadline is authoritative across peer remount', async ({ browser }, info) => {
    test.setTimeout(12 * 60_000);
    const scenario = selectedDeadline();
    const gameType = scenario.source as DealerGameType;
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    const evidence: Record<string, unknown> = { scenario: scenario.id, status: 'started' };
    let primaryError: unknown = null;
    let teardownFailure: AggregateError | null = null;

    try {
      await startSessionUnderChaos(session);
      if (scenario.deadline === 'dealer-setup') {
        const setupOwner = await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
        evidence.setupOwner = setupOwner === session.hostPage ? 'host' : 'peer';
        await runOfflineBurst(session.peerContext, 1_250);
        await remountPeer(session);
        await waitForAuthoritativeChange(session, 'game_selection');
      } else {
        await configureDealerGameUnderChaos(session, gameType, {
          configure: (surface) => configureShortestTerminal(gameType, surface),
          submitNonDealerAnte: scenario.deadline !== 'ante',
        });
        if (scenario.deadline === 'ante') {
          await runOfflineBurst(session.peerContext, 1_250);
          await remountPeer(session);
          await waitForAuthoritativeChange(session, 'ante_decision');
        } else {
          await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
          if (gameType === 'yahtzee') {
            await expect.poll(async () => (
              await session.hostPage.locator('[data-canonical-shell-timer-rail][data-forensics-timer-running="1"]').count()
              + await session.peerPage.locator('[data-canonical-shell-timer-rail][data-forensics-timer-running="1"]').count()
            ), { timeout: 15_000 }).toBe(1);
          }
          const beforeTimeout = await readGameplaySnapshot(session);
          evidence.beforeTimeout = beforeTimeout;
          await runOfflineBurst(session.peerContext, 1_250);
          await remountPeer(session);
          evidence.afterTimeout = await waitForGameplayDeadlineResolution(session, beforeTimeout);
        }
      }
      evidence.status = 'passed';
    } catch (error) {
      evidence.status = 'failed';
      evidence.error = error instanceof Error ? error.message : String(error);
      primaryError = error;
    } finally {
      const teardownErrors: unknown[] = [];
      try {
        const observation = await finalizeScenarioObserver(session, info);
        evidence.continuousObserver = observerEvidenceSummary(observation.evidence);
        if (!primaryError && observation.failure) primaryError = observation.failure;
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
        await persistScenarioEvidence(info, 'human-chaos-deadline-evidence.json', evidence);
      } catch (error) {
        teardownErrors.push(error);
      } finally {
        await closeTwoClientSession(session);
      }
      if (teardownErrors.length) {
        teardownFailure = new AggregateError(
          primaryError ? [primaryError, ...teardownErrors] : teardownErrors,
          primaryError ? `${scenario.id} failed and teardown also failed` : `${scenario.id} teardown failed`,
        );
      }
    }
    if (teardownFailure) throw teardownFailure;
    if (primaryError) throw primaryError;
  });
});
