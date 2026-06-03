/**
 * useHighCardDealerSelection — headless dealer-selection controller.
 *
 * Phase C.2 extraction: behavior-preserving move of the logic previously
 * embedded in `HighCardDealerSelection.tsx` into a hook. Identical DB
 * writes, identical callback contract, identical timing constants. The
 * legacy component is now a thin wrapper around this hook for its
 * remaining session-level callsites; canonical Cribbage call this hook
 * directly with NO surface mounted.
 *
 * Contract:
 *   - HOST drives state, pushes to `games.dealer_selection_state`.
 *   - NON-HOST mirrors `syncedState` into the provided callbacks.
 *   - `onComplete` is called HOST-only at the end of the sequence.
 *   - Bypass paths (0 / 1 eligible dealers) are preserved.
 *   - 'cribbage' variant: no tie announcement, fast redraw cadence.
 *
 * No semantic drift from the original component. Only the packaging changes.
 */
import { useEffect, useRef, useCallback } from 'react';
import { getBotAlias } from '@/lib/botAlias';
import { Card, createDeck, shuffleDeck, RANK_VALUES } from '@/lib/cardUtils';
import { supabase } from '@/integrations/supabase/client';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { recordDealerSelectionDiag } from '@/lib/dealerSelectionDiag';
import { recordLifecycleTimelineEvent } from '@/lib/canonicalShell/announcements/announcementDebugLog';

interface Player {
  id: string;
  user_id: string;
  position: number;
  created_at?: string;
  profiles?: { username: string };
  is_bot: boolean;
  sitting_out?: boolean;
}

export interface DealerSelectionCard {
  playerId: string;
  position: number;
  card: Card;
  isRevealed: boolean;
  isWinner: boolean;
  isDimmed: boolean;
  roundNumber: number;
}

export interface DealerSelectionState {
  cards: DealerSelectionCard[];
  announcement: string | null;
  isComplete: boolean;
  winnerPosition: number | null;
}

export interface UseHighCardDealerSelectionArgs {
  gameId: string;
  players: Player[];
  onComplete: (dealerPosition: number) => void;
  isHost: boolean;
  allowBotDealers?: boolean;
  selectionVariant?: 'default' | 'cribbage';
  syncedState: DealerSelectionState | null;
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  /**
   * Phase F.2: announcement callback retired. Dealer-selection messaging
   * is now exclusively owned by the canonical announcement layer (see
   * `dealer_selection_in_progress` / `dealer_selected` in
   * `canonicalShell/announcements/renderers.tsx`). The `announcement`
   * field is still written to `games.dealer_selection_state` for DB
   * sync continuity, but no consumer renders the string.
   */
  onWinnerPositionUpdate?: (position: number | null) => void;
}

export function useHighCardDealerSelection({
  gameId,
  players,
  onComplete,
  isHost,
  allowBotDealers = false,
  selectionVariant = 'default',
  syncedState,
  onCardsUpdate,
  onWinnerPositionUpdate,
}: UseHighCardDealerSelectionArgs) {
  const hasInitializedRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const deckRef = useRef<Card[]>([]);
  const hasCompletedRef = useRef(false);
  const lastAnnouncementRef = useRef<string | null>(null);

  // TRACE-4: log on mount with received syncedState (observation only)
  useEffect(() => {
    logDebugEvent({
      gameId,
      eventType: 'crib:bugA:child_mount',
      payload: {
        isHost,
        selectionVariant,
        hasSyncedState: !!syncedState,
        syncedCardCount: syncedState?.cards?.length ?? 0,
        syncedIsComplete: syncedState?.isComplete ?? null,
        syncedCardIds: (syncedState?.cards ?? []).slice(0, 3).map((c) =>
          `${c.card?.rank}${c.card?.suit?.[0] ?? '?'}`,
        ),
        playerCount: players.length,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

  const isCribbageVariant = selectionVariant === 'cribbage';

  const sortedPlayers = [...players].sort((a, b) => a.position - b.position);
  const eligibleDealers = sortedPlayers.filter(
    (p) => !p.sitting_out && (!p.is_bot || allowBotDealers),
  );
  const eligibleDealerKey = eligibleDealers.map((p) => p.id).join(',');

  const ANNOUNCE_DURATION = 900;
  const ROUND_PAUSE = 700;
  const WINNER_ANNOUNCE_DELAY = 2200;
  const CRIBBAGE_TIE_REDEAL_DELAY = 500;

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const addTimeout = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
    return t;
  }, []);

  const getPlayerName = useCallback(
    (player: Player) => {
      if (player.is_bot) {
        return getBotAlias(sortedPlayers, player.user_id);
      }
      return player.profiles?.username || `Seat ${player.position}`;
    },
    [sortedPlayers],
  );

  const syncToDatabase = useCallback(
    async (state: DealerSelectionState) => {
      if (!isHost) return;
      const dealerSelectionId = `${gameId}:host`;
      recordDealerSelectionDiag('dealer_selection_state_published', {
        sessionId: gameId,
        dealerSelectionId,
        cardCount: state.cards?.length ?? 0,
        winnerPosition: state.winnerPosition ?? null,
        scope: selectionVariant === 'cribbage' ? 'cribbage' : 'session',
        extra: { side: 'host-write', isComplete: state.isComplete },
      });
      if ((state.cards?.length ?? 0) > 0) {
        recordDealerSelectionDiag('dealer_selection_cards_published', {
          sessionId: gameId,
          dealerSelectionId,
          cardCount: state.cards.length,
          winnerPosition: state.winnerPosition ?? null,
          scope: selectionVariant === 'cribbage' ? 'cribbage' : 'session',
          extra: { side: 'host-write' },
        });
      }
      try {
        const { error } = await supabase
          .from('games')
          .update({ dealer_selection_state: state as any })
          .eq('id', gameId);
        if (error) {
          console.error('[HIGH CARD] Failed to sync state to DB:', error);
        }
      } catch (err) {
        console.error('[HIGH CARD] Error syncing to DB:', err);
      }
    },
    [isHost, gameId, selectionVariant],
  );

  // NON-HOST: react to synced state from database
  const nonHostCardsSeenRef = useRef(false);
  useEffect(() => {
    if (isHost) return;
    if (!syncedState) return;

    recordDealerSelectionDiag('dealer_selection_state_published', {
      sessionId: gameId,
      dealerSelectionId: `${gameId}:host`,
      cardCount: syncedState.cards?.length ?? 0,
      winnerPosition: syncedState.winnerPosition ?? null,
      scope: selectionVariant === 'cribbage' ? 'cribbage' : 'session',
      extra: { side: 'non-host-recv', isComplete: syncedState.isComplete },
    });
    if (!nonHostCardsSeenRef.current && (syncedState.cards?.length ?? 0) > 0) {
      nonHostCardsSeenRef.current = true;
      recordDealerSelectionDiag('dealer_selection_cards_published', {
        sessionId: gameId,
        dealerSelectionId: `${gameId}:host`,
        cardCount: syncedState.cards.length,
        scope: selectionVariant === 'cribbage' ? 'cribbage' : 'session',
        extra: { side: 'non-host-recv' },
      });
    }

    lastAnnouncementRef.current = syncedState.announcement ?? lastAnnouncementRef.current;
    onCardsUpdate(syncedState.cards);
    onWinnerPositionUpdate?.(syncedState.winnerPosition);

    if (syncedState.isComplete && syncedState.winnerPosition !== null && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
    }
  }, [isHost, syncedState, onCardsUpdate, onWinnerPositionUpdate, gameId, selectionVariant]);

  // Forward declarations to avoid use-before-declaration in closures.
  const determineWinnerRef = useRef<(roundCards: DealerSelectionCard[], allCards: DealerSelectionCard[], playersInRound: Player[], roundNum: number) => void>(() => {});
  const runSelectionRoundRef = useRef<(playersInRound: Player[], roundNum: number, existingCards: DealerSelectionCard[]) => void>(() => {});

  const runSelectionRound = useCallback(
    (playersInRound: Player[], roundNum: number, existingCards: DealerSelectionCard[]) => {
      console.log('[HIGH CARD] Round', roundNum, 'with', playersInRound.length, 'players');

      onWinnerPositionUpdate?.(null);

      const roundAnnouncement =
        roundNum === 1
          ? (isCribbageVariant ? 'Drawing for button' : 'High card wins deal')
          : isCribbageVariant
            ? null
            : 'Tie! Drawing again...';

      if (roundAnnouncement !== null) {
        lastAnnouncementRef.current = roundAnnouncement;
      }

      const dealDelayMs =
        roundNum === 1
          ? ANNOUNCE_DURATION
          : isCribbageVariant
            ? 0
            : ANNOUNCE_DURATION;

      addTimeout(() => {
        const newCards: DealerSelectionCard[] = playersInRound.map((player) => {
          const card = deckRef.current.shift()!;
          return {
            playerId: player.id,
            position: player.position,
            card,
            isRevealed: true,
            isWinner: false,
            isDimmed: false,
            roundNumber: roundNum,
          };
        });

        recordDealerSelectionDiag('dealer_selection_animation_triggered', {
          sessionId: gameId,
          dealerSelectionId: `${gameId}:host`,
          animationTriggerId: `${gameId}:round-${roundNum}`,
          cardCount: newCards.length,
          scope: isCribbageVariant ? 'cribbage' : 'session',
          extra: { round: roundNum, playersInRound: playersInRound.length },
        });

        const allCards = [
          ...existingCards.filter((c) => c.roundNumber !== roundNum),
          ...newCards,
        ];

        onCardsUpdate(allCards);

        // Persist the reveal-only snapshot so non-host subscribers receive
        // a "cards revealed, no winner yet" frame BEFORE the completed
        // frame coalesces winner+cards. Without this write the only DB
        // frame non-hosts ever see is the terminal "isComplete=true"
        // snapshot, which causes the reveal animation to be skipped.
        syncToDatabase({
          cards: allCards,
          announcement: lastAnnouncementRef.current,
          isComplete: false,
          winnerPosition: null,
        });

        const pauseAfterDealMs =
          roundNum === 1
            ? ROUND_PAUSE
            : isCribbageVariant
              ? 0
              : ROUND_PAUSE;

        addTimeout(() => {
          determineWinnerRef.current(newCards, allCards, playersInRound, roundNum);
        }, pauseAfterDealMs);
      }, dealDelayMs);
    },
    [addTimeout, onCardsUpdate, onWinnerPositionUpdate, syncToDatabase, isCribbageVariant],
  );

  const determineWinner = useCallback(
    (
      roundCards: DealerSelectionCard[],
      allCards: DealerSelectionCard[],
      playersInRound: Player[],
      roundNum: number,
    ) => {
      let highestRank = 0;
      let winners: DealerSelectionCard[] = [];

      roundCards.forEach((pc) => {
        const rankValue = RANK_VALUES[pc.card.rank];
        if (rankValue > highestRank) {
          highestRank = rankValue;
          winners = [pc];
        } else if (rankValue === highestRank) {
          winners.push(pc);
        }
      });

      console.log(
        '[HIGH CARD] Round',
        roundNum,
        'highest rank:',
        highestRank,
        'winners:',
        winners.length,
      );

      const updatedCards = allCards.map((p) => {
        if (p.roundNumber !== roundNum) return p;
        const isWinner = winners.some((w) => w.playerId === p.playerId);
        return { ...p, isWinner, isDimmed: !isWinner };
      });

      onCardsUpdate(updatedCards);

      if (winners.length === 1) {
        const winnerPlayer = playersInRound.find((p) => p.id === winners[0].playerId);
        if (winnerPlayer) {
          const name = getPlayerName(winnerPlayer);
          const winAnnouncement = `${name} wins the deal!`;
          lastAnnouncementRef.current = winAnnouncement;

          onWinnerPositionUpdate?.(winnerPlayer.position);

          syncToDatabase({
            cards: updatedCards,
            announcement: winAnnouncement,
            isComplete: true,
            winnerPosition: winnerPlayer.position,
          });

          hasCompletedRef.current = true;

          recordDealerSelectionDiag('dealer_selection_completed', {
            sessionId: gameId,
            dealerSelectionId: `${gameId}:host`,
            cardCount: updatedCards.length,
            winnerPosition: winnerPlayer.position,
            scope: isCribbageVariant ? 'cribbage' : 'session',
            extra: { round: roundNum },
          });

          addTimeout(() => {
            onComplete(winnerPlayer.position);
          }, WINNER_ANNOUNCE_DELAY);
        }
      } else {
        const announcementToSync = isCribbageVariant
          ? (lastAnnouncementRef.current ?? null)
          : 'Tie! Drawing again...';

        syncToDatabase({
          cards: updatedCards,
          announcement: announcementToSync,
          isComplete: false,
          winnerPosition: null,
        });

        const tiedPlayerIds = winners.map((w) => w.playerId);
        const tiedPlayers = playersInRound.filter((p) => tiedPlayerIds.includes(p.id));

        const nextRoundDelayMs = isCribbageVariant ? CRIBBAGE_TIE_REDEAL_DELAY : ROUND_PAUSE;

        addTimeout(() => {
          runSelectionRoundRef.current(tiedPlayers, roundNum + 1, updatedCards);
        }, nextRoundDelayMs);
      }
    },
    [
      addTimeout,
      getPlayerName,
      onComplete,
      onCardsUpdate,
      onWinnerPositionUpdate,
      syncToDatabase,
      isCribbageVariant,
    ],
  );

  // Wire refs for cross-callback recursion (preserves original behavior).
  determineWinnerRef.current = determineWinner;
  runSelectionRoundRef.current = runSelectionRound;

  // HOST: run the selection sequence and sync to DB
  useEffect(() => {
    if (
      isHost &&
      syncedState?.isComplete &&
      syncedState.winnerPosition !== null &&
      !hasCompletedRef.current
    ) {
      hasCompletedRef.current = true;
      lastAnnouncementRef.current = syncedState.announcement ?? lastAnnouncementRef.current;
      onCardsUpdate(syncedState.cards || []);
      onWinnerPositionUpdate?.(syncedState.winnerPosition);

      const t = setTimeout(() => onComplete(syncedState.winnerPosition!), WINNER_ANNOUNCE_DELAY);
      return () => clearTimeout(t);
    }

    if (hasInitializedRef.current) return;

    if (eligibleDealers.length === 0) {
      hasInitializedRef.current = true;
      const activePlayers = sortedPlayers.filter((p) => !p.sitting_out);
      if (activePlayers.length === 0) {
        onComplete(sortedPlayers[0]?.position || 1);
      } else {
        onComplete(activePlayers[0]?.position || 1);
      }
      return;
    }

    if (eligibleDealers.length === 1) {
      hasInitializedRef.current = true;
      console.log('[HIGH CARD] Only one eligible dealer, bypassing selection');
      if (isHost) {
        onComplete(eligibleDealers[0].position);
      }
      return;
    }

    if (!isHost) {
      return;
    }

    hasInitializedRef.current = true;

    console.log(
      '[HIGH CARD] Starting high card dealer selection with',
      eligibleDealers.length,
      'eligible players',
    );

    deckRef.current = shuffleDeck(createDeck());

    recordDealerSelectionDiag('dealer_selection_created', {
      sessionId: gameId,
      dealerSelectionId: `${gameId}:host`,
      cardCount: 0,
      scope: isCribbageVariant ? 'cribbage' : 'session',
      extra: { eligibleDealers: eligibleDealers.length },
    });

    runSelectionRound(eligibleDealers, 1, []);

    return () => clearTimeouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, eligibleDealerKey]);
}
