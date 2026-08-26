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

const DRAW_CARD = '[data-wartime-high-card="card"]';

function selectedDraw(): ChaosScenario {
  const id = process.env.PTOWN_E2E_CAMPAIGN_SCENARIO?.trim();
  if (!id) throw new Error('Set PTOWN_E2E_CAMPAIGN_SCENARIO to one human-chaos dealer-draw id.');
  const scenario = HUMAN_CHAOS_MANIFEST.find((candidate) => candidate.id === id);
  if (!scenario || scenario.family !== 'dealer-draw') {
    throw new Error(`Unknown human-chaos dealer-draw scenario: ${id}`);
  }
  if (scenario.source === 'cribbage' && scenario.variant === 'forced-tie') {
    throw new Error(
      'Cribbage dealer-draw forced-tie has no account-scoped fixture. It must not be faked with a global production default.',
    );
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

    try {
      await Promise.all([installDrawReceipt(session.hostPage), installDrawReceipt(session.peerPage)]);
      if (scenario.variant === 'forced-tie') {
        const { data, error } = await session.cleanupClient.rpc(
          'arm_session_dealer_draw_tie_harness' as never,
          { p_ttl_seconds: 600 } as never,
        );
        if (error || (data as { outcome?: string } | null)?.outcome !== 'armed') {
          throw new Error(`Could not arm session dealer-draw tie fixture: ${error?.message ?? 'unexpected outcome'}`);
        }
      }

      await startSessionUnderChaos(session);
      if (scenario.source === 'cribbage') {
        await configureDealerGameUnderChaos(session, 'cribbage');
      } else {
        await waitForDealerGameSetupOwner(session.hostPage, session.peerPage);
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
        await info.attach('human-chaos-draw-evidence.json', {
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
