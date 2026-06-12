import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { hasPlayableCard, getCardPointValue } from '@/lib/cribbageScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { toast } from 'sonner';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { useCardRowLayout } from '@/lib/canonicalShell/useCardRowLayout';

/**
 * Discrete CribbagePlayingCard size ladder (width px → size token).
 * Kept in sync with sizeStyles in CribbagePlayingCard.tsx.
 * Wave 2C consumes useCardRowLayout to resolve a fluid cardWidth from
 * the pane budget, then nearest-snaps to this ladder so card
 * readability (font / suit sizing) stays on the discrete typographic
 * scale the component already supports — no fluid card mode added.
 */
const CRIBBAGE_CARD_SIZE_LADDER: ReadonlyArray<{ size: 'xs' | 'sm' | 'md' | 'lg'; width: number }> = [
  { size: 'xs', width: 24 },
  { size: 'sm', width: 32 },
  { size: 'md', width: 40 },
  { size: 'lg', width: 48 },
];

function snapToCardSize(resolvedWidth: number): 'xs' | 'sm' | 'md' | 'lg' {
  let best = CRIBBAGE_CARD_SIZE_LADDER[0];
  let bestDelta = Math.abs(resolvedWidth - best.width);
  for (let i = 1; i < CRIBBAGE_CARD_SIZE_LADDER.length; i++) {
    const entry = CRIBBAGE_CARD_SIZE_LADDER[i];
    const delta = Math.abs(resolvedWidth - entry.width);
    if (delta < bestDelta) {
      best = entry;
      bestDelta = delta;
    }
  }
  return best.size;
}

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

/** Diagnostic context passed from parent for render tracing */
interface RenderTraceContext {
  renderHandKey: string;
  currentHandKey: string;
  dealerGameId: string | null;
  isFrozen: boolean;
  authoritativeHand: CribbageCard[] | null;
  renderSource: string;
  expectedRoundId: string | null;
  sourceRoundId: string | null;
  handNumber: number;
  isGameplayMode: boolean;
  viewStateIsCurrentRound: boolean;
  /** Authoritative gate from parent: when false, the rendered hand is NOT the actionable hand. */
  interactionsAllowed?: boolean;
}

interface CribbageMobileCardsTabProps {
  cribbageState: CribbageState;
  currentPlayerId: string;
  playerCount: number;
  isProcessing: boolean;
  onDiscard: (cardIndices: number[]) => void;
  onPlayCard: (cardIndex: number) => void;
  currentPlayer: Player;
  gameId: string;
  isDealer: boolean;
  /** Used to reset selectedCards on hand boundary transitions */
  roundId?: string;
  /** Diagnostic context for render tracing — omit to disable */
  renderTrace?: RenderTraceContext;
}

/** Card identity string for tracing */
function cardId(c: CribbageCard): string {
  return `${c.rank}${c.suit[0]}`;
}

export const CribbageMobileCardsTab = ({
  cribbageState,
  currentPlayerId,
  playerCount,
  isProcessing,
  onDiscard,
  onPlayCard,
  currentPlayer,
  gameId,
  isDealer,
  roundId,
  renderTrace,
}: CribbageMobileCardsTabProps) => {
  const [selectedCards, setSelectedCards] = useState<number[]>([]);

  // Reset selectedCards on hand boundary (roundId change) to prevent stale selections
  const prevRoundIdRef = useRef<string | undefined>(roundId);
  useEffect(() => {
    if (roundId && roundId !== prevRoundIdRef.current) {
      prevRoundIdRef.current = roundId;
      setSelectedCards([]);
    }
  }, [roundId]);

  const myPlayerState = cribbageState.playerStates[currentPlayerId];
  const clientId = currentPlayer.user_id.slice(0, 8);
  const sourceHand = myPlayerState?.hand ?? [];
  const expectedRoundId = renderTrace?.expectedRoundId ?? roundId ?? null;
  const sourceRoundId = renderTrace?.sourceRoundId ?? null;
  const roundIdentityMismatch = !!(renderTrace && expectedRoundId && sourceRoundId && expectedRoundId !== sourceRoundId);
  const handIdentityMismatch = !!(
    renderTrace &&
    renderTrace.renderHandKey &&
    renderTrace.currentHandKey &&
    renderTrace.renderHandKey !== renderTrace.currentHandKey
  );
  const parentSuppressed = !!renderTrace && renderTrace.interactionsAllowed === false;
  const activeHandBlocked = !!renderTrace && (roundIdentityMismatch || handIdentityMismatch || parentSuppressed);
  const renderedHand = activeHandBlocked ? [] : sourceHand;
  const sourceCardIds = sourceHand.map(cardId);
  const renderedCardIds = renderedHand.map(cardId);
  const sourceFingerprint = sourceCardIds.join(',');
  const renderedFingerprint = renderedCardIds.join(',');
  const activeHandSourceName = 'cribbageState.playerStates[currentPlayerId].hand';

  const prevRenderSourceFingerprintRef = useRef<string>('');
  const prevBlockedFingerprintRef = useRef<string>('');
  const prevHydratedFingerprintRef = useRef<string>('');
  useEffect(() => {
    if (!myPlayerState || !renderTrace) return;

    const authIds = renderTrace.authoritativeHand?.map(cardId) ?? null;
    const renderFingerprint = JSON.stringify({
      expectedRoundId,
      sourceRoundId,
      renderHandKey: renderTrace.renderHandKey,
      currentHandKey: renderTrace.currentHandKey,
      sourceFingerprint,
      renderedFingerprint,
      activeHandBlocked,
    });

    if (renderFingerprint !== prevRenderSourceFingerprintRef.current) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: renderTrace.handNumber,
        roundId: expectedRoundId ?? null,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-active-hand-render-source',
        payload: {
          clientId,
          currentRoundId: expectedRoundId?.slice(0, 8) ?? null,
          sourceRoundId: sourceRoundId?.slice(0, 8) ?? null,
          currentHandKey: renderTrace.currentHandKey?.slice(0, 30) ?? null,
          renderHandKey: renderTrace.renderHandKey?.slice(0, 30) ?? null,
          sourceName: activeHandSourceName,
          sourceCardIds,
          sourceCardCount: sourceCardIds.length,
          renderedCardIds,
          renderedCardCount: renderedCardIds.length,
          sourceIdentity: sourceRoundId
            ? `${sourceRoundId.slice(0, 8)}:${renderTrace.renderHandKey?.slice(0, 30) ?? ''}`
            : null,
          isGameplayMode: renderTrace.isGameplayMode,
          viewStateIsCurrentRound: renderTrace.viewStateIsCurrentRound,
          renderSource: renderTrace.renderSource,
          usedPresentationState: renderTrace.renderSource === 'sync-presentation',
          usedLocalFallback: false,
          phase: cribbageState.phase,
          isFrozen: renderTrace.isFrozen,
          authoritativeHandIds: authIds,
        },
      });
      prevRenderSourceFingerprintRef.current = renderFingerprint;
    }

    if (activeHandBlocked && sourceCardIds.length > 0) {
      const blockedFingerprint = `${expectedRoundId}:${sourceRoundId}:${renderTrace.renderHandKey}:${renderTrace.currentHandKey}:${sourceFingerprint}`;
      if (blockedFingerprint !== prevBlockedFingerprintRef.current) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: renderTrace.handNumber,
          roundId: expectedRoundId ?? null,
          eventType: 'invariant',
          severity: 'warn',
          eventName: 'crib-stale-active-hand-blocked',
          payload: {
            clientId,
            currentRoundId: expectedRoundId?.slice(0, 8) ?? null,
            sourceRoundId: sourceRoundId?.slice(0, 8) ?? null,
            currentHandKey: renderTrace.currentHandKey?.slice(0, 30) ?? null,
            renderHandKey: renderTrace.renderHandKey?.slice(0, 30) ?? null,
            blockedSourceName: activeHandSourceName,
            sourceCardIds,
            sourceCardCount: sourceCardIds.length,
            isGameplayMode: renderTrace.isGameplayMode,
            viewStateIsCurrentRound: renderTrace.viewStateIsCurrentRound,
          },
        });
        prevBlockedFingerprintRef.current = blockedFingerprint;
      }
    }

    if (!activeHandBlocked && renderedCardIds.length > 0) {
      const hydratedFingerprint = `${expectedRoundId}:${renderTrace.currentHandKey}:${renderedFingerprint}`;
      if (hydratedFingerprint !== prevHydratedFingerprintRef.current) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: renderTrace.handNumber,
          roundId: expectedRoundId ?? null,
          eventType: 'transition',
          severity: 'info',
          eventName: 'crib-active-hand-hydrated',
          payload: {
            clientId,
            roundId: expectedRoundId?.slice(0, 8) ?? null,
            handKey: renderTrace.currentHandKey?.slice(0, 30) ?? null,
            source: activeHandSourceName,
            cardIds: renderedCardIds,
            cardCount: renderedCardIds.length,
          },
        });
        prevHydratedFingerprintRef.current = hydratedFingerprint;
      }
    }

    if (
      authIds &&
      !activeHandBlocked &&
      (cribbageState.phase === 'discarding' || cribbageState.phase === 'pegging') &&
      renderTrace.renderHandKey === renderTrace.currentHandKey
    ) {
      const authFingerprint = [...authIds].sort().join(',');
      const renderedSorted = [...renderedCardIds].sort().join(',');
      if (authFingerprint !== renderedSorted) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: renderTrace.handNumber,
          roundId: expectedRoundId ?? null,
          eventType: 'invariant',
          severity: 'error',
          eventName: 'CRIBBAGE_RENDER_SOURCE_MISMATCH',
          payload: {
            renderedCardIds,
            authoritativeCardIds: authIds,
            renderHandKey: renderTrace.renderHandKey?.slice(0, 30),
            currentHandKey: renderTrace.currentHandKey?.slice(0, 30),
            renderSource: renderTrace.renderSource,
            phase: cribbageState.phase,
            isFrozen: renderTrace.isFrozen,
          },
        });
      }
    }
  }, [
    activeHandBlocked,
    activeHandSourceName,
    clientId,
    cribbageState.phase,
    expectedRoundId,
    gameId,
    myPlayerState,
    renderTrace,
    renderedCardIds,
    renderedFingerprint,
    sourceCardIds,
    sourceFingerprint,
    sourceRoundId,
  ]);
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;
  const canPlayAnyCard = myPlayerState && hasPlayableCard(renderedHand, cribbageState.pegging.currentCount);
  const haveDiscarded = myPlayerState?.discardedToCrib.length > 0;
  const expectedDiscard = playerCount === 2 ? 2 : 1;
  
  // Pre-discard: show 6 cards compactly; post-discard: show 4 cards relaxed
  const isPreDiscard = cribbageState.phase === 'discarding' && !haveDiscarded;
  const cardCount = renderedHand.length;

  // ────────────────────────────────────────────────────────────────
  // Wave 2C — geometry-resolver consumer for the viewer hand row.
  //
  // Budget owner: the shell-owned ShellHudGrid pane wrapper, marked
  // by [data-cribbage-active-pane-content] in CribbageMobileGameTable.
  // The pane is sized by the shell HUD grid (fixed row 4 height +
  // outer width); the cards row cannot feed back into pane width, so
  // there is no measurement loop. Mirrors the 3-5-7 pattern.
  //
  // After the geometry resolver returns a cardWidth, we nearest-snap
  // to CribbagePlayingCard's discrete xs/sm/md/lg ladder. Overlap is
  // applied as inline `marginLeft` on cards after the first, replacing
  // both the count-keyed `scale-[…]` cascade and the legacy
  // `-space-x-3 / gap-1` overlap classes.
  // ────────────────────────────────────────────────────────────────
  const handRowRef = useRef<HTMLDivElement | null>(null);
  const [paneWidthPx, setPaneWidthPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = handRowRef.current;
    if (!el) return;
    const pane = el.closest<HTMLElement>('[data-cribbage-active-pane-content]');
    if (!pane) return;
    const measure = () => {
      const w = pane.clientWidth;
      setPaneWidthPx(prev => (prev !== null && Math.abs(prev - w) < 0.5 ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(pane);
    return () => ro.disconnect();
  }, []);

  const handLayout = useCardRowLayout({
    availableWidth: paneWidthPx ?? 0,
    count: cardCount > 0 ? cardCount : 1,
    aspect: 2 / 3, // CribbagePlayingCard intrinsic aspect (40×60, 32×48, …)
    minCardWidth: 24,
    maxCardWidth: 48,
    preferredOverlapRatio: isPreDiscard ? 0.32 : 0.05,
    maxOverlapRatio: 0.55,
  });
  const resolvedCardSize: 'xs' | 'sm' | 'md' | 'lg' = handLayout
    ? snapToCardSize(handLayout.cardWidth)
    : 'md';
  // Snap-aware overlap: scale the resolver's overlap fraction onto the
  // snapped card width so adjacent cards remain visually consistent
  // with the discrete render width (the resolver works in fluid px).
  const snappedCardWidthPx =
    CRIBBAGE_CARD_SIZE_LADDER.find(e => e.size === resolvedCardSize)?.width ?? 40;
  const overlapPx = handLayout
    ? Math.round((handLayout.overlapPx / Math.max(handLayout.cardWidth, 1)) * snappedCardWidthPx)
    : 0;

  const handleCardClick = (index: number) => {
    if (!myPlayerState) return;

    if (cribbageState.phase === 'discarding') {
      if (selectedCards.includes(index)) {
        setSelectedCards(selectedCards.filter(i => i !== index));
      } else if (selectedCards.length < expectedDiscard) {
        setSelectedCards([...selectedCards, index]);
      }
    } else if (cribbageState.phase === 'pegging') {
      if (isMyTurn) {
        const card = renderedHand[index];
        if (card && getCardPointValue(card) + cribbageState.pegging.currentCount <= 31) {
          onPlayCard(index);
        } else {
          toast.error('Card would exceed 31');
        }
      }
    }
  };

  const handleDiscard = () => {
    if (selectedCards.length !== expectedDiscard) {
      toast.error(`Select ${expectedDiscard} card(s) to discard`);
      return;
    }
    onDiscard(selectedCards);
    setSelectedCards([]);
  };




  if (!myPlayerState) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Identity row (name / chips / emoticon / "Your Crib") is now
  // shell-owned: rendered by CribbageMobileGameTable in ShellHudGrid's
  // `identity` slot so it persists across all tabs, matching Yahtzee.

  if (activeHandBlocked) {
    return (
      <div className="h-full px-2 flex flex-col">
        <div className="flex items-center justify-center min-h-[92px] py-0" />
        <div className="flex items-center justify-center min-h-[28px]" />
      </div>
    );
  }

  return (
    <div className="h-full px-2 flex flex-col">
      {/* Cards display - adaptive layout */}
      <div className="flex items-center justify-center min-h-[92px] py-0">
        <div 
          className={cn(
            "flex justify-center origin-center",
            // Pre-discard: tighter spacing with overlap for 6 cards
            isPreDiscard ? "-space-x-3" : "gap-1",
            // Scale based on card count - slightly smaller to free up vertical space
            cardCount <= 4 ? "scale-[1.55]" : cardCount <= 5 ? "scale-[1.35]" : "scale-[1.18]"
          )}
        >
          {renderedHand.map((card, index) => {
            const isSelected = selectedCards.includes(index);
            const isPlayable = cribbageState.phase === 'pegging' && 
              isMyTurn && 
              getCardPointValue(card) + cribbageState.pegging.currentCount <= 31;
            
            return (
              <button
                key={index}
                onClick={() => handleCardClick(index)}
                onPointerUp={(e) => e.currentTarget.blur()}
                disabled={isProcessing}
                className={cn(
                  "transition-all duration-200 rounded relative",
                  // Explicit transform for selected vs not-selected states
                  // This ensures deselecting a card returns it to translateY(0)
                  isSelected
                    ? "-translate-y-3 ring-2 ring-poker-gold z-10"
                    : "translate-y-0",
                  // iOS can "stick" :hover after a tap; only apply hover transforms on fine-pointer hover devices.
                  isMyTurn &&
                    isPlayable &&
                    !isSelected &&
                    "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-poker-gold/50",
                  cribbageState.phase === 'discarding' &&
                    !haveDiscarded &&
                    !isSelected &&
                    "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-2 [@media(hover:hover)_and_(pointer:fine)]:hover:z-10"
                )}
                style={{ zIndex: isSelected ? 10 : index }}
              >
                <CribbagePlayingCard card={card} size="md" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Action area - tighter to cards */}
      <div className="flex items-center justify-center min-h-[28px]">
        {cribbageState.phase === 'discarding' && !haveDiscarded && (
          <Button
            onClick={handleDiscard}
            disabled={isProcessing || selectedCards.length !== expectedDiscard}
            className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-6"
          >
            Send to Crib ({selectedCards.length}/{expectedDiscard})
          </Button>
        )}
        
        {cribbageState.phase === 'discarding' && haveDiscarded && (
          <p className="text-muted-foreground text-sm">Waiting for other players...</p>
        )}

        {cribbageState.phase === 'pegging' && isMyTurn && !canPlayAnyCard && (
          <p className="text-amber-400 text-sm animate-pulse">Auto-calling Go...</p>
        )}

        {cribbageState.phase === 'pegging' && isMyTurn && canPlayAnyCard && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap a card to play!</p>
        )}

        {cribbageState.phase === 'pegging' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Waiting for opponent...</p>
        )}

        {cribbageState.phase === 'counting' && (
          <p className="text-poker-gold text-sm">Counting hands...</p>
        )}
      </div>

      {/* Identity row is rendered by ShellHudGrid (shell-owned row 5). */}

      {/* Crib is shown on the felt during counting - no duplicate display here */}
    </div>
  );
};
