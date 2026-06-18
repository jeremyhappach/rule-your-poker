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
import {
  recordWaitingLifecycle,
  recordWaitingLifecycleIfChanged,
} from '@/lib/canonicalShell/waitingTableFlight';
import {
  recordHighCardSurfaceMount,
  recordHighCardSurfaceUnmount,
  recordHighCardRender,
  recordHighCardStateRaw,
  recordHighCardRenderRaw,
  recordHighCardTimer,
  recordHighCardCardsClear,
  recordHighCardStateSource,
  recordHighCardVisibleRenderer,
  recordHighCardPhaseTransition,
  recordHighCardWriter,
  resetHighCardVisibleRendererCache,
  resetHighCardPhaseCache,
  type HighCardPhase,
} from '@/lib/wartimeDebug/surfaces';
import {
  startHighCardVisualSampler,
  stopHighCardVisualSampler,
} from '@/lib/wartimeDebug/highCardVisualSampler';


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
    recordHighCardSurfaceMount({
      gameId,
      isHost,
      selectionVariant,
      sourceSurface: 'useHighCardDealerSelection',
      componentKey: `${gameId}:${selectionVariant}`,
      playerCount: players.length,
    });
    // One-time visible-renderer registration so the trace can prove which
    // renderer owns the cards the user sees.
    recordHighCardVisibleRenderer({
      gameId,
      rendererName: 'HighCardDealerSelection',
      componentName: 'useHighCardDealerSelection',
      renderPath: isHost ? 'host' : 'non-host',
      containerId: `[data-wartime-high-card-container]`,
      wartimeTagged: true,
      visibleCardCount: syncedState?.cards?.length ?? 0,
      surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
    });

    // Start the rAF DOM/CSS/overlay visual sampler scoped to the
    // active high-card window. Stops on unmount below.
    startHighCardVisualSampler({
      gameId,
      componentKey: `${gameId}:${selectionVariant}`,
      renderPath: isHost ? 'host' : 'non-host',
      selectedCardsSource: isHost ? 'local' : 'syncedState',
      surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
      getHookState: () => ({
        hookCardsLength: hookStateRef.current.cards.length,
        hookCardIds: hookStateRef.current.cards.map(
          (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
        ),
        expectedCardIds: hookStateRef.current.expectedCardIds,
        gameStatus: 'dealer_selection',
        winnerPosition: hookStateRef.current.winnerPosition,
        isComplete: hookStateRef.current.isComplete,
      }),
    });
    return () => {
      stopHighCardVisualSampler(gameId);
      recordHighCardSurfaceUnmount({
        gameId,
        isHost,
        selectionVariant,
        sourceSurface: 'useHighCardDealerSelection',
        componentKey: `${gameId}:${selectionVariant}`,
      });
      resetHighCardVisibleRendererCache(gameId);
      resetHighCardPhaseCache(gameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only


  // Mirror of latest hook state for the rAF sampler / raw recorders
  // (refs so sampler closure does not need to re-bind each render).
  const hookStateRef = useRef<{
    cards: DealerSelectionCard[];
    expectedCardIds: string[];
    winnerPosition: number | null;
    isComplete: boolean;
  }>({ cards: [], expectedCardIds: [], winnerPosition: null, isComplete: false });

  // Render-decision + cards-disappeared classifier — emits on every
  // render via signature-keyed cache inside recordHighCardRender.
  const cardsForRender = syncedState?.cards ?? [];
  const cardIdsForRender = cardsForRender.map(
    (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
  );

  // Keep ref in sync for the sampler closure.
  hookStateRef.current = {
    cards: cardsForRender,
    expectedCardIds: cardIdsForRender,
    winnerPosition: syncedState?.winnerPosition ?? null,
    isComplete: !!syncedState?.isComplete,
  };

  recordHighCardRender({
    gameId,
    renderPath: isHost ? 'host' : 'non-host',
    selectedCardsSource: isHost ? 'local' : 'syncedState',
    cardsLength: cardsForRender.length,
    cardIds: cardIdsForRender,
    renderedCardCount: cardsForRender.length,
    winnerPosition: syncedState?.winnerPosition ?? null,
    isComplete: !!syncedState?.isComplete,
    hasAnnouncement: !!syncedState?.announcement,
    shouldRenderCards: cardsForRender.length > 0,
    hideReason: cardsForRender.length === 0 ? 'no-cards' : null,
    componentKey: `${gameId}:${selectionVariant}`,
    gameStatus: 'dealer_selection',
  });

  // RAW non-deduped per-render state + render emit. Lets the trace
  // reconstruct rapid sequences (e.g. 2 → 0 → 2 → 0) that the dedup'd
  // recorder would collapse into a single transition.
  recordHighCardRenderRaw({
    gameId,
    renderPath: isHost ? 'host' : 'non-host',
    selectedCardsSource: isHost ? 'local' : 'syncedState',
    componentKey: `${gameId}:${selectionVariant}`,
    surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
    hookCardsLength: cardsForRender.length,
    hookCardIds: cardIdsForRender,
    syncedCardsLength: syncedState?.cards?.length ?? 0,
    syncedCardIds: (syncedState?.cards ?? []).map(
      (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
    ),
    winnerPosition: syncedState?.winnerPosition ?? null,
    isComplete: !!syncedState?.isComplete,
    shouldRenderCards: cardsForRender.length > 0,
    hideReason: cardsForRender.length === 0 ? 'no-cards' : null,
    gameStatus: 'dealer_selection',
  });
  recordHighCardStateRaw({
    gameId,
    componentKey: `${gameId}:${selectionVariant}`,
    cardsLength: cardsForRender.length,
    cardIds: cardIdsForRender,
    syncedCardsLength: syncedState?.cards?.length ?? 0,
    winnerPosition: syncedState?.winnerPosition ?? null,
    isComplete: !!syncedState?.isComplete,
  });

  // STATE-SOURCE attribution — emits when visible-card identity changes,
  // tagged with whether the source was local (host) or realtime-sync (non-host).
  recordHighCardStateSource({
    gameId,
    previousSource: null, // filled by recorder
    newSource: isHost ? 'local' : 'realtime-sync',
    cardCount: cardsForRender.length,
    cardIds: cardIdsForRender,
    renderPath: isHost ? 'host' : 'non-host',
    gameStatus: 'dealer_selection',
    surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
  });

  // PHASE classifier — derived from current authoritative-ish state.
  const _phase: HighCardPhase = (() => {
    if (syncedState?.isComplete) return 'dealer-setup-transition';
    if ((syncedState?.winnerPosition ?? null) !== null) return 'winner-announcement';
    if (cardsForRender.length > 0) return 'reveal';
    return 'waiting';
  })();
  recordHighCardPhaseTransition({
    gameId,
    phase: _phase,
    cardsVisible: cardsForRender.length > 0,
    cardCount: cardsForRender.length,
    winnerPosition: syncedState?.winnerPosition ?? null,
    gameStatus: 'dealer_selection',
    surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
  });



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
    timeoutsRef.current.forEach((t) => {
      clearTimeout(t);
      recordHighCardTimer('timeout.cancelled', {
        gameId,
        componentKey: `${gameId}:${selectionVariant}`,
        surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
        reason: 'clearTimeouts',
      });
    });
    timeoutsRef.current = [];
  }, [gameId, selectionVariant]);

  const timerSeqRef = useRef(0);
  const addTimeout = useCallback((fn: () => void, delay: number) => {
    const id = ++timerSeqRef.current;
    recordHighCardTimer('timeout.scheduled', {
      timerId: id,
      delayMs: delay,
      gameId,
      componentKey: `${gameId}:${selectionVariant}`,
      surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
    });
    const t = setTimeout(() => {
      recordHighCardTimer('timeout.fired', {
        timerId: id,
        delayMs: delay,
        gameId,
        componentKey: `${gameId}:${selectionVariant}`,
        surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
      });
      fn();
    }, delay);
    timeoutsRef.current.push(t);
    return t;
  }, [gameId, selectionVariant]);

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
  const lastCardsLenRef = useRef<number>(0);
  const lastWinnerRef = useRef<number | null>(null);
  useEffect(() => {
    if (isHost) return;
    if (!syncedState) return;

    // P-WAIT.C2: receive-frame trace (every synced-state delivery on non-host).
    recordWaitingLifecycle('high-card receive frame', {
      gameId,
      viewerSide: 'non-host',
      cardsLength: syncedState.cards?.length ?? 0,
      isComplete: !!syncedState.isComplete,
      winnerPosition: syncedState.winnerPosition ?? null,
      hasAnnouncement: !!syncedState.announcement,
      stateVersion: null,
      updatedAt: Date.now(),
    });

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

    // P-WAIT.C4: cards-change tracing for non-host receive path.
    const prevLen = lastCardsLenRef.current;
    const nextLen = syncedState.cards?.length ?? 0;
    if (prevLen !== nextLen) {
      recordWaitingLifecycle('high-card cards-change', {
        gameId,
        previousLength: prevLen,
        nextLength: nextLen,
        positions: (syncedState.cards ?? []).map(c => c.position),
        source: 'non-host-receive',
        viewerPosition: null,
        gameStatus: 'dealer_selection',
      });
      if (prevLen === 0 && nextLen > 0) {
        recordWaitingLifecycle('high-card card-reveal', {
          gameId, source: 'non-host-receive', cardsLength: nextLen,
        });
      } else if (prevLen > 0 && nextLen === 0) {
        recordWaitingLifecycle('high-card card-hide', {
          gameId, source: 'non-host-receive', cardsLength: nextLen,
        });
        // ATTRIBUTION: realtime sync delivered an empty card set, which will
        // overwrite the visible cards on non-host. Record callsite before the
        // overwrite reaches React state.
        recordHighCardCardsClear({
          source: 'non-host-sync',
          callsite: 'src/hooks/useHighCardDealerSelection.ts:non-host-receive',
          reason: 'syncedState.cards delivered empty array',
          cardsLengthBeforeClear: prevLen,
          cardsLengthAfterClear: nextLen,
          gameStatus: 'dealer_selection',
          winnerPosition: syncedState.winnerPosition ?? null,
          dealerSelectionComplete: !!syncedState.isComplete,
          gameId,
          surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
        });
      }
      lastCardsLenRef.current = nextLen;
    }

    // WRITER ATTRIBUTION — emitted BEFORE the React setState so the
    // trace can prove the exact producer responsible for any
    // 2 → 0 / 0 → 2 transition without stack inference.
    {
      const _prevIds = (hookStateRef.current.cards ?? []).map(
        (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
      );
      const _nextIds = (syncedState.cards ?? []).map(
        (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
      );
      recordHighCardWriter({
        gameId,
        source: 'non-host-sync',
        callsite: 'src/hooks/useHighCardDealerSelection.ts:469 non-host onCardsUpdate(syncedState.cards)',
        reason: 'realtime synced-state delivery → mirror into local cards',
        previousLength: _prevIds.length,
        nextLength: _nextIds.length,
        previousCardIds: _prevIds,
        nextCardIds: _nextIds,
        renderPath: 'non-host',
        surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
        winnerPosition: syncedState.winnerPosition ?? null,
        isComplete: !!syncedState.isComplete,
      });
    }

    onCardsUpdate(syncedState.cards);

    onWinnerPositionUpdate?.(syncedState.winnerPosition);

    if (syncedState.winnerPosition !== null && lastWinnerRef.current !== syncedState.winnerPosition) {
      lastWinnerRef.current = syncedState.winnerPosition;
      recordWaitingLifecycle('high-card winner-determined', {
        gameId,
        winnerPosition: syncedState.winnerPosition,
        round: null,
        viewerSide: 'non-host',
        cardsLength: nextLen,
      });
    }

    if (syncedState.isComplete && syncedState.winnerPosition !== null && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      recordWaitingLifecycle('high-card dealer-selected', {
        gameId,
        winnerPosition: syncedState.winnerPosition,
        viewerSide: 'non-host',
        cardsLength: nextLen,
        isComplete: true,
      });
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

        // P-WAIT.C3 + C4: card-deal + cards-change (host side).
        const prevHostLen = lastCardsLenRef.current;
        recordWaitingLifecycle('high-card card-deal', {
          gameId,
          round: roundNum,
          dealt: newCards.length,
          totalCards: allCards.length,
          positions: newCards.map(c => c.position),
          isHost: true,
        });
        if (prevHostLen !== allCards.length) {
          recordWaitingLifecycle('high-card cards-change', {
            gameId,
            previousLength: prevHostLen,
            nextLength: allCards.length,
            positions: allCards.map(c => c.position),
            source: 'host-deal',
            viewerPosition: null,
            gameStatus: 'dealer_selection',
          });
          if (prevHostLen === 0 && allCards.length > 0) {
            recordWaitingLifecycle('high-card card-reveal', {
              gameId, source: 'host-deal', cardsLength: allCards.length,
            });
          }
          lastCardsLenRef.current = allCards.length;
        }

        {
          const _prevIds = (hookStateRef.current.cards ?? []).map(
            (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
          );
          const _nextIds = allCards.map(
            (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
          );
          recordHighCardWriter({
            gameId,
            source: 'host-deal',
            callsite: `src/hooks/useHighCardDealerSelection.ts:runSelectionRound round=${roundNum}`,
            reason: 'host dealt round → onCardsUpdate(allCards)',
            previousLength: _prevIds.length,
            nextLength: _nextIds.length,
            previousCardIds: _prevIds,
            nextCardIds: _nextIds,
            renderPath: 'host',
            surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
          });
        }

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

      {
        const _prevIds = (hookStateRef.current.cards ?? []).map(
          (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
        );
        const _nextIds = updatedCards.map(
          (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
        );
        recordHighCardWriter({
          gameId,
          source: 'host-determine-winner',
          callsite: `src/hooks/useHighCardDealerSelection.ts:determineWinner round=${roundNum}`,
          reason: 'host applied winner/dim flags → onCardsUpdate(updatedCards)',
          previousLength: _prevIds.length,
          nextLength: _nextIds.length,
          previousCardIds: _prevIds,
          nextCardIds: _nextIds,
          renderPath: 'host',
          surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
        });
      }
      onCardsUpdate(updatedCards);

      if (winners.length === 1) {
        const winnerPlayer = playersInRound.find((p) => p.id === winners[0].playerId);
        if (winnerPlayer) {
          const name = getPlayerName(winnerPlayer);
          const winAnnouncement = `${name} wins the deal!`;
          lastAnnouncementRef.current = winAnnouncement;

          onWinnerPositionUpdate?.(winnerPlayer.position);

          recordWaitingLifecycle('high-card winner-determined', {
            gameId,
            winnerPosition: winnerPlayer.position,
            round: roundNum,
            viewerSide: 'host',
            cardsLength: updatedCards.length,
          });

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
            recordWaitingLifecycle('high-card dealer-selected', {
              gameId,
              winnerPosition: winnerPlayer.position,
              viewerSide: 'host',
              cardsLength: updatedCards.length,
              isComplete: true,
            });
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
      const nextCards = syncedState.cards || [];
      if (nextCards.length === 0) {
        recordHighCardCardsClear({
          source: 'host-complete-sync',
          callsite: 'src/hooks/useHighCardDealerSelection.ts:host-complete-replay',
          reason: 'host completion effect replayed with empty cards array',
          cardsLengthBeforeClear: lastCardsLenRef.current,
          cardsLengthAfterClear: 0,
          gameStatus: 'dealer_selection',
          winnerPosition: syncedState.winnerPosition,
          dealerSelectionComplete: true,
          gameId,
          surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
        });
      }
      {
        const _prevIds = (hookStateRef.current.cards ?? []).map(
          (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
        );
        const _nextIds = (nextCards ?? []).map(
          (c) => `${c.position}:${c.card?.rank}${c.card?.suit?.[0] ?? '?'}:r${c.roundNumber}`,
        );
        recordHighCardWriter({
          gameId,
          source: 'host-complete-replay',
          callsite: 'src/hooks/useHighCardDealerSelection.ts:host-complete-replay onCardsUpdate(nextCards)',
          reason: 'host completion effect replay → mirror DB cards to local',
          previousLength: _prevIds.length,
          nextLength: _nextIds.length,
          previousCardIds: _prevIds,
          nextCardIds: _nextIds,
          renderPath: 'host',
          surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
          winnerPosition: syncedState.winnerPosition,
          isComplete: true,
        });
      }
      onCardsUpdate(nextCards);
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
      onComplete(eligibleDealers[0].position);
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

    recordWaitingLifecycle('high-card-start', {
      gameId,
      isHost,
      eligibleCount: eligibleDealers.length,
      viewerPosition: null,
      playerCount: players.length,
    });

    runSelectionRound(eligibleDealers, 1, []);

    return () => clearTimeouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, eligibleDealerKey]);
}
