import { test } from '../../playwright-fixture';
import { requireTwoPlayerEnvironment } from './support/env';
import {
  expectCanonicalContinuity,
  waitForBothClientsInLiveGame,
  waitForEitherClientAction,
} from './support/livenessAssertions';
import {
  blastFakeMoneySession,
  closeTwoClientSession,
  createTwoClientSession,
  enterDealerGameUnderChaos,
  type DealerGameType,
} from './support/twoClientSession';
import { runOfflineBurst } from './support/crossCountryNetwork';

const GAME_TYPES: DealerGameType[] = [
  'holm-game',
  '3-5-7',
  'cribbage',
  'gin-rummy',
  'horses',
  'ship-captain-crew',
  'yahtzee',
];

test.describe('two-human cross-country lifecycle gauntlet', () => {
  for (const gameType of GAME_TYPES) {
    test(`${gameType}: recovers across dealer draw, ambiguous ante commit, and live remount`, async ({ browser }) => {
      const credentials = requireTwoPlayerEnvironment();
      const session = await createTwoClientSession(browser, credentials.player1, credentials.player2);

      let primaryError: unknown = null;
      try {
        await enterDealerGameUnderChaos(session, gameType);
        await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);

        // Exercise a mobile radio loss after live state exists, then remount the
        // whole route while delayed Realtime frames are still in flight.
        await runOfflineBurst(session.peerContext, 2_250);
        await session.peerPage.reload({ waitUntil: 'domcontentloaded' });

        await Promise.all([
          expectCanonicalContinuity(session.hostPage),
          expectCanonicalContinuity(session.peerPage),
        ]);
        await waitForBothClientsInLiveGame(session.hostPage, session.peerPage, gameType);
        await waitForEitherClientAction(session.hostPage, session.peerPage);
      } catch (error) {
        primaryError = error;
      } finally {
        let cleanupError: unknown = null;
        try {
          await blastFakeMoneySession(session);
        } catch (error) {
          cleanupError = error;
        } finally {
          await closeTwoClientSession(session);
        }
        if (cleanupError) {
          throw new AggregateError(
            primaryError ? [primaryError, cleanupError] : [cleanupError],
            primaryError
              ? `${gameType} liveness test failed and cleanup also failed`
              : `${gameType} liveness cleanup failed`,
          );
        }
      }
      if (primaryError) throw primaryError;
    });
  }
});
