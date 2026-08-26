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

test.describe('two-human cross-country deadline and rejoin campaign', () => {
  test('selected deadline is authoritative across peer remount', async ({ browser }, info) => {
    test.setTimeout(12 * 60_000);
    const scenario = selectedDeadline();
    const gameType = scenario.source as DealerGameType;
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    const evidence: Record<string, unknown> = { scenario: scenario.id, status: 'started' };
    let primaryError: unknown = null;

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
          await runOfflineBurst(session.peerContext, 1_250);
          await remountPeer(session);
          await waitForAuthoritativeChange(session, 'in_progress');
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
        await info.attach('human-chaos-deadline-evidence.json', {
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
