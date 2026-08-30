import { expect, type Page } from '@playwright/test';

import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import {
  blastFakeMoneySession,
  closeTwoClientSession,
  configureDealerGameUnderChaos,
  createTwoClientSession,
  startSessionUnderChaos,
  waitForDealerGameSetupOwner,
} from '../liveness/support/twoClientSession';
import { HUMAN_CHAOS_MANIFEST, type ChaosScenario } from './manifest';
import { finalizeScenarioObserver, observerEvidenceSummary } from './support/scenarioObserver';
import { capturePreCleanupScreenshots, persistScenarioEvidence } from '../liveness/support/scenarioArtifacts';

const DRAW_CARD = '[data-wartime-high-card="card"]';

function selectedDraw(): ChaosScenario {
  const id = process.env.PTOWN_E2E_CAMPAIGN_SCENARIO?.trim();
  if (!id) throw new Error('Set PTOWN_E2E_CAMPAIGN_SCENARIO to one human-chaos dealer-draw id.');
  const scenario = HUMAN_CHAOS_MANIFEST.find((candidate) => candidate.id === id);
  if (!scenario || scenario.family !== 'dealer-draw') {
    throw new Error(`Unknown human-chaos dealer-draw scenario: ${id}`);
  }
  return scenario;
}

async function installDrawReceipt(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const state = { maxCards: 0, additions: 0 };
    const sample = () => {
      const cards = document.querySelectorAll(selector).length;
      state.maxCards = Math.max(state.maxCards, cards);
      state.additions += cards;
    };
    sample();
    new MutationObserver(sample).observe(document.body, { childList: true, subtree: true });
    (window as typeof window & { __ptownDrawReceipt?: typeof state }).__ptownDrawReceipt = state;
  }, DRAW_CARD);
}

async function readDrawReceipt(page: Page): Promise<{ maxCards: number; additions: number }> {
  return page.evaluate(() => (window as typeof window & {
    __ptownDrawReceipt?: { maxCards: number; additions: number };
  }).__ptownDrawReceipt ?? { maxCards: 0, additions: 0 });
}

test.describe('two-human cross-country dealer draw campaign', () => {
  test('selected draw is seen before its next lifecycle surface', async ({ browser }, info) => {
    test.setTimeout(8 * 60_000);
    const scenario = selectedDraw();
    const credentials = requireTwoPlayerEnvironment();
    const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
    const evidence: Record<string, unknown> = { scenario: scenario.id, status: 'started' };
    let primaryError: unknown = null;
    let teardownFailure: AggregateError | null = null;
    let cribbageFixtureArmed = false;

    try {
      await Promise.all([installDrawReceipt(session.hostPage), installDrawReceipt(session.peerPage)]);
      if (scenario.variant === 'forced-tie') {
        const isCribbage = scenario.source === 'cribbage';
        const { data, error } = isCribbage
          ? await session.cleanupClient.rpc(
            'arm_cribbage_dealer_draw_tie_harness' as never,
            { p_game_id: session.gameId, p_ttl_seconds: 600 } as never,
          )
          : await session.cleanupClient.rpc(
            'arm_session_dealer_draw_tie_harness' as never,
            { p_ttl_seconds: 600 } as never,
          );
        if (error || (data as { outcome?: string } | null)?.outcome !== 'armed') {
          throw new Error(
            `Could not arm ${isCribbage ? 'Cribbage' : 'session'} dealer-draw tie fixture: `
            + `${error?.message ?? 'unexpected outcome'}`,
          );
        }
        cribbageFixtureArmed = isCribbage;
        evidence.fixtureArm = data;
      }

      await startSessionUnderChaos(session);
      if (scenario.source === 'cribbage') {
        await configureDealerGameUnderChaos(session, 'cribbage');
      } else {
        await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
      }

      if (cribbageFixtureArmed) {
        const { data, error } = await session.cleanupClient.rpc(
          'get_cribbage_dealer_draw_tie_harness' as never,
          { p_game_id: session.gameId } as never,
        );
        const status = data as { armed?: boolean; consumedAt?: string | null } | null;
        if (error || status?.armed !== false || !status?.consumedAt) {
          throw new Error(
            `Cribbage dealer-draw tie fixture was not consumed exactly once: `
            + `${error?.message ?? JSON.stringify(status)}`,
          );
        }
        evidence.fixtureStatus = status;
      }

      const [hostReceipt, peerReceipt] = await Promise.all([
        readDrawReceipt(session.hostPage),
        readDrawReceipt(session.peerPage),
      ]);
      evidence.hostDrawReceipt = hostReceipt;
      evidence.peerDrawReceipt = peerReceipt;
      expect(hostReceipt.additions).toBeGreaterThanOrEqual(2);
      expect(peerReceipt.additions).toBeGreaterThanOrEqual(2);
      if (scenario.variant === 'forced-tie') {
        expect(hostReceipt.additions).toBeGreaterThanOrEqual(4);
        expect(peerReceipt.additions).toBeGreaterThanOrEqual(4);
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
      if (cribbageFixtureArmed) {
        try {
          const { data, error } = await session.cleanupClient.rpc(
            'cancel_cribbage_dealer_draw_tie_harness' as never,
            { p_game_id: session.gameId } as never,
          );
          if (error || (data as { outcome?: string } | null)?.outcome !== 'cancelled') {
            throw new Error(
              `Could not close Cribbage dealer-draw tie fixture: `
              + `${error?.message ?? JSON.stringify(data)}`,
            );
          }
          evidence.fixtureCleanup = data;
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
        await persistScenarioEvidence(info, 'human-chaos-draw-evidence.json', evidence);
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
