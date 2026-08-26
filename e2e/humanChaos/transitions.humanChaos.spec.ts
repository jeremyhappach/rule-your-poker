import { expect, type Locator } from '@playwright/test';

import { test } from '../../playwright-fixture';
import { runOfflineBurst } from '../liveness/support/crossCountryNetwork';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import {
  configureDealerGameUnderChaos,
  createTwoClientSession,
  blastFakeMoneySession,
  closeTwoClientSession,
  enterDealerGameUnderChaos,
  submitOutstandingAnteUnderChaos,
  type DealerGameType,
  waitForDealerGameSetupOwner,
} from '../liveness/support/twoClientSession';
import {
  expectCanonicalContinuity,
  waitForBothClientsAction,
  waitForBothClientsInLiveGame,
  waitForEitherClientAction,
} from '../liveness/support/livenessAssertions';
import {
  authoritativeDealerGameId,
  configureShortestTerminal,
  playDealerGameToTerminal,
  requestLastHand,
  TERMINAL_EXPECTATIONS,
} from '../terminal/support/terminalActors';
import { TerminalSettlementProbe } from '../terminal/support/terminalSettlementProbe';
import { HUMAN_CHAOS_MANIFEST, type ChaosScenario } from './manifest';

function selectedTransition(): ChaosScenario {
  const id = process.env.PTOWN_E2E_CAMPAIGN_SCENARIO?.trim();
  if (!id) throw new Error('Set PTOWN_E2E_CAMPAIGN_SCENARIO to one human-chaos transition id.');
  const scenario = HUMAN_CHAOS_MANIFEST.find((candidate) => candidate.id === id);
  if (!scenario || scenario.family !== 'transition') {
    throw new Error(`Unknown human-chaos transition scenario: ${id}`);
  }
  return scenario;
}

async function configureChangedParameters(gameType: DealerGameType, surface: Locator): Promise<void> {
  switch (gameType) {
    case 'holm-game':
      await surface.locator('#ante-holm').fill('2');
      return;
    case '3-5-7':
      await surface.locator('#legs-to-win').fill('2');
      return;
    case 'cribbage':
      await surface.getByRole('combobox').click();
      await surface.page().getByRole('option', { name: /Custom/ }).click();
      await surface.locator('input[type="number"]').fill('2');
      return;
    case 'gin-rummy':
      await surface.getByRole('button', { name: /Standard.*100 pts/ }).click();
      return;
    case 'horses':
    case 'ship-captain-crew':
    case 'yahtzee':
      await surface.locator('#ante-simple').fill('2');
      return;
  }
}

async function startSuccessor(
  scenario: ChaosScenario,
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
): Promise<void> {
  if (scenario.variant === 'unchanged') {
    const owner = await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
    await owner.getByRole('button', { name: /Run Back/ }).click();
    await submitOutstandingAnteUnderChaos(session);
    return;
  }
  const target = scenario.target;
  if (!target) throw new Error(`Transition has no target: ${scenario.id}`);
  await configureDealerGameUnderChaos(session, target, {
    configure: async (surface) => {
      if (scenario.variant === 'changed') await configureChangedParameters(target, surface);
      else await configureShortestTerminal(target, surface);
    },
  });
}

async function waitForBothClientsAtDealerGame(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  gameType: DealerGameType,
): Promise<string> {
  // A dealer-game id is allocated at ante. Transition coverage must not treat
  // that allocation as permission to request LAST HAND or drive gameplay: the
  // successor has to be authoritatively live on both browsers first.
  await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
  let dealerGameId = '';
  await expect.poll(async () => {
    const [host, peer] = await Promise.all([
      authoritativeDealerGameId(session),
      session.peerPage.locator('[data-lifecycle-branch="loaded-inner"]').getAttribute('data-authoritative-dealer-game-id'),
    ]);
    dealerGameId = host;
    return host === peer && host.length > 0;
  }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe(true);
  return dealerGameId;
}

async function waitForPlayableTransitionAction(
  session: Awaited<ReturnType<typeof createTwoClientSession>>,
  gameType: DealerGameType,
): Promise<void> {
  // 3-5-7 deals cards to both players before either decision. Requiring both
  // decision surfaces here prevents a dealer-host presentation deadlock from
  // being hidden by the peer's healthy controls.
  if (gameType === '3-5-7') {
    await waitForBothClientsAction(
      session.hostPage,
      session.peerPage,
      '[data-authoritative-action-surface="holm-357-decision"]',
    );
    return;
  }
  await waitForEitherClientAction(session.hostPage, session.peerPage);
}

test.describe('two-human cross-country dealer-game transition campaign', () => {
  test('selected transition retains only successor state', async ({ browser }, info) => {
    test.setTimeout(45 * 60_000);
    const scenario = selectedTransition();
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    const runtime = await session.hostNetwork.waitForRuntimeConfig();
    const probe = await TerminalSettlementProbe.create(runtime.url, runtime.publishableKey, credentials.player1);
    const source = scenario.source!;
    const target = scenario.target!;
    const evidence: Record<string, unknown> = { scenario: scenario.id, status: 'started' };
    let primaryError: unknown = null;

    try {
      await enterDealerGameUnderChaos(session, source, {
        configure: (surface) => configureShortestTerminal(source, surface),
      });
      const sourceDealerGameId = await waitForBothClientsAtDealerGame(session, source);
      evidence.sourceDealerGameId = sourceDealerGameId;
      await waitForPlayableTransitionAction(session, source);
      await playDealerGameToTerminal(session, source, probe, sourceDealerGameId);

      await startSuccessor(scenario, session);
      const successorDealerGameId = await waitForBothClientsAtDealerGame(session, target);
      evidence.successorDealerGameId = successorDealerGameId;
      expect(successorDealerGameId).not.toBe(sourceDealerGameId);
      await runOfflineBurst(session.peerContext, 1_250);
      await Promise.all([
        expectCanonicalContinuity(session.hostPage),
        expectCanonicalContinuity(session.peerPage),
      ]);
      await waitForBothClientsAtDealerGame(session, target);
      await waitForPlayableTransitionAction(session, target);

      await requestLastHand(session, probe);
      const successorResult = await playDealerGameToTerminal(
        session,
        target,
        probe,
        successorDealerGameId,
      );
      evidence.successorResultId = successorResult.id;
      await probe.assertTerminalProof(
        session.gameId,
        successorDealerGameId,
        TERMINAL_EXPECTATIONS[target],
        successorResult,
      );
      evidence.status = 'passed';
    } catch (error) {
      evidence.status = 'failed';
      evidence.error = error instanceof Error ? error.message : String(error);
      primaryError = error;
    } finally {
      const teardownErrors: unknown[] = [];
      try {
        await info.attach('human-chaos-transition-evidence.json', {
          body: JSON.stringify(evidence, null, 2),
          contentType: 'application/json',
        });
      } catch (error) {
        teardownErrors.push(error);
      }
      try {
        await blastFakeMoneySession(session);
      } catch (error) {
        teardownErrors.push(error);
      } finally {
        await closeTwoClientSession(session);
      }
      if (teardownErrors.length) {
        throw new AggregateError(
          primaryError ? [primaryError, ...teardownErrors] : teardownErrors,
          primaryError ? `${scenario.id} failed and teardown also failed` : `${scenario.id} teardown failed`,
        );
      }
    }
    if (primaryError) throw primaryError;
  });
});
