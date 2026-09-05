/**
 * Presents persisted session/Cribbage dealer-draw receipts inside canonical slots.
 * PostgreSQL owns card generation, ties and winner selection. This hook may request
 * Cribbage preparation and schedule local presentation callbacks; it never writes
 * draw outcomes or chooses cards.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Card } from '@/lib/cardUtils';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { prepareCribbageDealerSelection } from '@/lib/cribbageAuthority';
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
  preparedAt?: string;
}

export function getDealerSelectionReceiptKey(state: DealerSelectionState): string {
  return JSON.stringify({
    preparedAt: state.preparedAt ?? null,
    announcement: state.announcement,
    isComplete: state.isComplete,
    winnerPosition: state.winnerPosition,
    cards: state.cards.map((entry) => ({
      playerId: entry.playerId,
      position: entry.position,
      rank: entry.card.rank,
      suit: entry.card.suit,
      isRevealed: entry.isRevealed,
      isWinner: entry.isWinner,
      isDimmed: entry.isDimmed,
      roundNumber: entry.roundNumber,
    })),
  });
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
  const hasCompletedRef = useRef(false);
  const lastAnnouncementRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onCardsUpdateRef = useRef(onCardsUpdate);
  const onWinnerPositionUpdateRef = useRef(onWinnerPositionUpdate);

  onCompleteRef.current = onComplete;
  onCardsUpdateRef.current = onCardsUpdate;
  onWinnerPositionUpdateRef.current = onWinnerPositionUpdate;

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

  const WINNER_ANNOUNCE_DELAY = 2200;


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


  // NON-HOST: react to synced state from database
  const nonHostCardsSeenRef = useRef(false);
  const lastCardsLenRef = useRef<number>(0);
  const lastWinnerRef = useRef<number | null>(null);
  const lastNonHostReceiptKeyRef = useRef<string | null>(null);
  const lastDrainedHostReceiptKeyRef = useRef<string | null>(null);
  const hostCompletionReceipt =
    isHost &&
    isCribbageVariant &&
    syncedState?.isComplete &&
    syncedState.winnerPosition !== null
      ? {
          key: `${gameId}:${getDealerSelectionReceiptKey(syncedState)}`,
          cards: syncedState.cards ?? [],
          announcement: syncedState.announcement,
          winnerPosition: syncedState.winnerPosition,
        }
      : null;
  const hostCompletionReceiptRef = useRef(hostCompletionReceipt);
  hostCompletionReceiptRef.current = hostCompletionReceipt;
  const hostCompletionReceiptKey = hostCompletionReceipt?.key ?? null;

  // Cribbage completion is a durable database receipt that can arrive after
  // this hook has already initialized. Drain it from its own exact-keyed
  // effect so eligible-player stability cannot suppress the host handoff.
  useEffect(() => {
    if (!hostCompletionReceiptKey) return;
    if (lastDrainedHostReceiptKeyRef.current === hostCompletionReceiptKey) return;

    const receipt = hostCompletionReceiptRef.current;
    if (!receipt || receipt.key !== hostCompletionReceiptKey) return;

    hasCompletedRef.current = true;
    lastAnnouncementRef.current = receipt.announcement ?? lastAnnouncementRef.current;
    const nextCards = receipt.cards;
    if (nextCards.length === 0) {
      recordHighCardCardsClear({
        source: 'host-complete-sync',
        callsite: 'src/hooks/useHighCardDealerSelection.ts:host-complete-receipt-drain',
        reason: 'host completion receipt arrived with empty cards array',
        cardsLengthBeforeClear: lastCardsLenRef.current,
        cardsLengthAfterClear: 0,
        gameStatus: 'dealer_selection',
        winnerPosition: receipt.winnerPosition,
        dealerSelectionComplete: true,
        gameId,
        surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
      });
    }
    {
      const previousCardIds = (hookStateRef.current.cards ?? []).map(
        (card) =>
          `${card.position}:${card.card?.rank}${card.card?.suit?.[0] ?? '?'}:r${card.roundNumber}`,
      );
      const nextCardIds = nextCards.map(
        (card) =>
          `${card.position}:${card.card?.rank}${card.card?.suit?.[0] ?? '?'}:r${card.roundNumber}`,
      );
      recordHighCardWriter({
        gameId,
        source: 'host-complete-sync',
        callsite:
          'src/hooks/useHighCardDealerSelection.ts:host-complete-receipt-drain onCardsUpdate(nextCards)',
        reason: 'host completion receipt drain mirrors database cards to local presentation',
        previousLength: previousCardIds.length,
        nextLength: nextCardIds.length,
        previousCardIds,
        nextCardIds,
        renderPath: 'host',
        surfaceInstanceId: `useHighCardDealerSelection:${gameId}`,
        winnerPosition: receipt.winnerPosition,
        isComplete: true,
      });
    }
    onCardsUpdateRef.current(nextCards);
    onWinnerPositionUpdateRef.current?.(receipt.winnerPosition);

    const timer = addTimeout(() => {
      const latestReceipt = hostCompletionReceiptRef.current;
      if (!latestReceipt || latestReceipt.key !== hostCompletionReceiptKey) return;
      if (lastDrainedHostReceiptKeyRef.current === hostCompletionReceiptKey) return;

      lastDrainedHostReceiptKeyRef.current = hostCompletionReceiptKey;
      onCompleteRef.current(receipt.winnerPosition);
    }, WINNER_ANNOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [addTimeout, gameId, hostCompletionReceiptKey]);

  useEffect(() => {
    if (isHost) return;
    if (!syncedState) {
      lastNonHostReceiptKeyRef.current = null;
      return;
    }

    const receiptKey = getDealerSelectionReceiptKey(syncedState);
    if (lastNonHostReceiptKeyRef.current === receiptKey) return;
    lastNonHostReceiptKeyRef.current = receiptKey;

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


  // Render the committed receipt; Cribbage may request its server preparation.
  useEffect(() => {
    if (
      !isCribbageVariant &&
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

    // Session-level dealer selection is prepared and advanced by PostgreSQL.
    // This hook only renders the stored receipt; host presence is irrelevant.
    if (!isCribbageVariant) {
      hasInitializedRef.current = true;
      return;
    }

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

    if (isCribbageVariant) {
      hasInitializedRef.current = true;
      void prepareCribbageDealerSelection(gameId).catch((error) => {
        hasInitializedRef.current = false;
        console.error('[HIGH CARD] Server dealer selection failed:', error);
      });
      return;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, eligibleDealerKey]);
}
