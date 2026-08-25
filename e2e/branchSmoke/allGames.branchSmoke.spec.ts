import { expect, type Locator, type Page } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { runOfflineBurst } from '../liveness/support/crossCountryNetwork';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from '../liveness/support/livenessAssertions';
import { blastFakeMoneySession, closeTwoClientSession, createTwoClientSession, enterDealerGameUnderChaos } from '../liveness/support/twoClientSession';
import { authoritativeDealerGameId, playDealerGameToTerminal, requestLastHand, TERMINAL_EXPECTATIONS } from '../terminal/support/terminalActors';
import { TerminalSettlementProbe } from '../terminal/support/terminalSettlementProbe';
import { BRANCH_SMOKE_MANIFEST, type Scenario, validateManifest } from './manifest';

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
      try {
        await enterDealerGameUnderChaos(session, scenario.gameType, { configure: (c) => configure(scenario, c) });
        await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, scenario.gameType);
        const dealerGameId = await authoritativeDealerGameId(session);
        evidence.dealerGameId = dealerGameId;
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
          await info.attach('branch-smoke-evidence.json', {
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
            primaryError
              ? `${scenario.id} failed and teardown also failed`
              : `${scenario.id} teardown failed`,
          );
        }
      }
      if (primaryError) throw primaryError;
    });
  }
});
