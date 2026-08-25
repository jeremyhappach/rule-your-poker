import { expect } from '@playwright/test';
import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from '../liveness/support/env';
import { expectCanonicalContinuity, waitForBothClientsInLiveGame } from '../liveness/support/livenessAssertions';
import {
  blastFakeMoneySession,
  closeTwoClientSession,
  createTwoClientSession,
  enterDealerGameUnderChaos,
  type DealerGameType,
} from '../liveness/support/twoClientSession';
import { runOfflineBurst } from '../liveness/support/crossCountryNetwork';
import {
  authoritativeDealerGameId,
  configureShortestTerminal,
  playDealerGameToTerminal,
  requestLastHand,
  TERMINAL_EXPECTATIONS,
} from './support/terminalActors';
import { TerminalSettlementProbe } from './support/terminalSettlementProbe';

const GAME_TYPES: DealerGameType[] = [
  'holm-game',
  '3-5-7',
  'cribbage',
  'gin-rummy',
  'horses',
  'ship-captain-crew',
  'yahtzee',
];

test.describe('two-human cross-country terminal settlement gauntlet', () => {
  for (const gameType of GAME_TYPES) {
    test(`${gameType}: plays through exact settlement and ended-session reconnect`, async ({ browser }) => {
      test.setTimeout(20 * 60_000);
      const credentials = requireTwoPlayerEnvironment();
      const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);
      const supabaseEnvironment = await session.hostNetwork.waitForRuntimeConfig();
      const probe = await TerminalSettlementProbe.create(
        supabaseEnvironment.url,
        supabaseEnvironment.publishableKey,
        credentials.player1,
      );

      let primaryError: unknown = null;
      try {
        await enterDealerGameUnderChaos(session, gameType, {
          configure: (configSurface) => configureShortestTerminal(gameType, configSurface),
        });
        await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
        const dealerGameId = await authoritativeDealerGameId(session);

        await requestLastHand(session, probe);
        await runOfflineBurst(session.peerContext, 1_250);
        await Promise.all([
          expectCanonicalContinuity(session.hostPage),
          expectCanonicalContinuity(session.peerPage),
        ]);

        const result = await playDealerGameToTerminal(
          session,
          gameType,
          probe,
          dealerGameId,
        );
        console.log(`[terminal] ${gameType} settlement observed: ${result.id}`);

        await session.peerPage.close();
        session.peerPage = await session.peerContext.newPage();
        await session.peerPage.goto(`/game/${session.gameId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        console.log(`[terminal] ${gameType} fresh peer mounted`);

        await Promise.all([
          expect(session.hostPage.locator('[data-session-ended-panel]')).toBeVisible({ timeout: 120_000 }),
          expect(session.peerPage).toHaveURL(/\/$/, { timeout: 120_000 }),
          probe.assertTerminalProof(
            session.gameId,
            dealerGameId,
            TERMINAL_EXPECTATIONS[gameType],
            result,
          ),
        ]);
        await expect(session.peerPage.getByText('Game Lobby', { exact: true }).first()).toBeVisible();
        console.log(`[terminal] ${gameType} client and database proof complete`);
      } catch (error) {
        primaryError = error;
      } finally {
        let cleanupError: unknown = null;
        try {
          console.log(`[terminal] ${gameType} cleanup starting`);
          await blastFakeMoneySession(session);
          console.log(`[terminal] ${gameType} cleanup complete`);
        } catch (error) {
          cleanupError = error;
        } finally {
          await closeTwoClientSession(session);
        }
        if (cleanupError) {
          throw new AggregateError(
            primaryError ? [primaryError, cleanupError] : [cleanupError],
            primaryError
              ? `${gameType} terminal test failed and cleanup also failed`
              : `${gameType} terminal cleanup failed`,
          );
        }
      }
      if (primaryError) throw primaryError;
    });
  }
});
