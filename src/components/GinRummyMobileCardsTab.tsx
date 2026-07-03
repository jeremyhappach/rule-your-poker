// Gin Rummy Mobile Cards Tab - Player's hand display and action buttons
// My cards always live here — never on the felt.
// During knocking/laying_off: show melds + deadwood organized, with lay-off UX.

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CARDS_PER_PLAYER as GIN_CARDS_PER_PLAYER, type GinRummyState, type GinRummyCard, type GinRummyPlayerState, type Meld } from '@/lib/ginRummyTypes';
import { canKnock, hasGin, findLayOffOptions, findOptimalMelds } from '@/lib/ginRummyScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { MeasuredActiveHandFan } from './activeHand/MeasuredActiveHandFan';
import {
  computeStageRectFromPane,
  useActiveHandLayoutPolicy,
} from '@/lib/activeHand/activeHandLayoutSettings';
import type { Card as CanonicalCardType } from '@/lib/cardUtils';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
// (Removed cardArtifactOverlap import — Gin active hand is HUDStack-owned,
// not a felt-artifact overlap value. Prior static margins restored below.)

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface GinRummyMobileCardsTabProps {
  ginState: GinRummyState;
  currentPlayerId: string;
  isProcessing: boolean;
  onDrawStock: () => void;
  onDrawDiscard: () => void;
  onDiscard: (index: number) => void;
  onKnock: (index: number) => void;
  onTakeFirstDraw: () => void;
  onPassFirstDraw: () => void;
  onLayOff: (cardIndex: number, meldIndex: number) => void;
  onFinishLayingOff: () => void;
  /** Called whenever the selected card index changes during lay-off */
  onLayOffCardSelected?: (index: number | null) => void;
  currentPlayer: Player;
  gameId: string;
  /** Full current-hand identity from the Gin shell: dealer-game + round + hand. */
  handIdentityKey?: string | null;
  /** Cards to hide from the rendered hand while their self-draw
   *  transport animations are in flight. Each entry is keyed by its
   *  own intent and released independently on its own settle. */
  withheldDrawnCards?: Array<{ rank: string; suit: string }>;
}

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

const SUIT_ORDER: Record<string, number> = {
  '♠': 0, '♥': 1, '♣': 2, '♦': 3,
};

// Determine if we're in a post-knock phase where the active player box shows organized melds
const isPostKnockPhase = (phase: string) =>
  phase === 'knocking' || phase === 'laying_off' || phase === 'scoring' || phase === 'complete';

const isCurrentHandLocalHandPhase = (phase: string) =>
  phase === 'first_draw' || phase === 'playing' || phase === 'knocking' || phase === 'laying_off' || phase === 'scoring';

// Local-hand presentation is a LIVE PROJECTION admitted from the
// authoritative Gin state stream (never a synthesised source of truth).
type CachedLocalHandProjection = {
  identityKey: string;
  playerId: string;
  state: GinRummyPlayerState;
};

type LocalHandBaselineCommit = {
  identityKey: string;
  committed: boolean;
};

const cloneLocalPlayerState = (state: GinRummyPlayerState): GinRummyPlayerState => ({
  ...state,
  hand: [...state.hand],
  melds: state.melds.map((meld) => ({ ...meld, cards: [...meld.cards] })),
  deadwood: [...state.deadwood],
  laidOffCards: [...state.laidOffCards],
});

export const GinRummyMobileCardsTab = ({
  ginState,
  currentPlayerId,
  isProcessing,
  onDrawStock,
  onDrawDiscard,
  onDiscard,
  onKnock,
  onTakeFirstDraw,
  onPassFirstDraw,
  onLayOff,
  onFinishLayingOff,
  onLayOffCardSelected,
  currentPlayer,
  gameId,
  handIdentityKey,
  withheldDrawnCards,
}: GinRummyMobileCardsTabProps) => {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  
  const [drawnCard, setDrawnCard] = useState<{ rank: string; suit: string } | null>(null);
  const prevTurnPhaseRef = useRef(ginState.turnPhase);

  // Shared active-hand policy for instrumentation. The pane composition
  // itself is now owned by MeasuredActiveHandFan (portal + pane-based
  // reservation math) — no more independent stageRect measurement here.
  const ginPolicy = useActiveHandLayoutPolicy('ginRummy');
  // Bumped whenever the committed policy value changes (proves GeoLab
  // Apply + realtime remote updates reach the active-hand render path).
  const ginPolicyRevisionRef = useRef(0);
  const [ginPolicyRevision, setGinPolicyRevision] = useState(0);
  useEffect(() => {
    ginPolicyRevisionRef.current += 1;
    setGinPolicyRevision(ginPolicyRevisionRef.current);
  }, [ginPolicy]);

  const localHandIdentityKey = `${gameId}|${handIdentityKey ?? `gin-hand:${ginState.handNumber ?? 'unknown'}`}|p:${currentPlayerId}`;
  const localHandProjectionRef = useRef<CachedLocalHandProjection | null>(null);
  const localHandBaselineRef = useRef<LocalHandBaselineCommit | null>(null);
  const rawMyStateAuthoritative = ginState.playerStates[currentPlayerId];
  const rawAuthoritativeHandCount = rawMyStateAuthoritative?.hand?.length ?? 0;

  // ── Current-hand readiness gate ─────────────────────────────────
  // On EVERY new identity (dealerGameId / roundId / handNumber /
  // viewer flip encoded in localHandIdentityKey), the baseline is
  // reset to "not committed". Prior-hand cards are never bridged.
  // Baseline commits the FIRST time this identity's live projection
  // admits a non-empty local hand. Subsequent transient empties for
  // the SAME identity are absorbed by the sticky cache below.
  if (localHandBaselineRef.current?.identityKey !== localHandIdentityKey) {
    localHandBaselineRef.current = { identityKey: localHandIdentityKey, committed: false };
    // Drop any prior-identity cache so no old cards can leak forward.
    if (localHandProjectionRef.current?.identityKey !== localHandIdentityKey) {
      localHandProjectionRef.current = null;
    }
  }
  if (rawAuthoritativeHandCount > 0 && localHandBaselineRef.current) {
    localHandBaselineRef.current.committed = true;
  }
  const currentHandBaselineCommitted = !!localHandBaselineRef.current?.committed;

  const stableMyStateAuthoritative = useMemo(() => {
    if (rawMyStateAuthoritative && rawAuthoritativeHandCount > 0) {
      localHandProjectionRef.current = {
        identityKey: localHandIdentityKey,
        playerId: currentPlayerId,
        state: cloneLocalPlayerState(rawMyStateAuthoritative),
      };
      return rawMyStateAuthoritative;
    }

    // Sticky cache only fires AFTER baseline for the same identity
    // has already committed. Never bridges identities.
    const cached = localHandProjectionRef.current;
    if (
      cached &&
      cached.identityKey === localHandIdentityKey &&
      cached.playerId === currentPlayerId &&
      currentHandBaselineCommitted &&
      isCurrentHandLocalHandPhase(ginState.phase)
    ) {
      return cached.state;
    }

    return rawMyStateAuthoritative;
  }, [rawMyStateAuthoritative, rawAuthoritativeHandCount, localHandIdentityKey, currentPlayerId, ginState.phase, currentHandBaselineCommitted]);

  // Withhold each freshly drawn card from the rendered hand while its
  // own self-draw transport animation is in flight. The cards are
  // committed to ginState (so subsequent actions like discard remain
  // legal) but we visually withhold each face until its own flight
  // settles, mirroring the opponent ownership-claim model.
  const rawMyState = useMemo(() => {
    if (!stableMyStateAuthoritative) return stableMyStateAuthoritative;
    if (!withheldDrawnCards || withheldDrawnCards.length === 0) return stableMyStateAuthoritative;
    const clipped = [...stableMyStateAuthoritative.hand];
    for (const w of withheldDrawnCards) {
      const idx = clipped.findIndex(c => c.rank === w.rank && c.suit === w.suit);
      if (idx !== -1) clipped.splice(idx, 1);
    }
    if (clipped.length === stableMyStateAuthoritative.hand.length) return stableMyStateAuthoritative;
    return { ...stableMyStateAuthoritative, hand: clipped };
  }, [stableMyStateAuthoritative, withheldDrawnCards]);
  // Opening-deal prefix gate applies ONLY to the opening dealt-card
  // sequence (cardsPerPlayer cards). Once authoritative hand membership
  // exceeds the opening manifest size, the additional card was acquired
  // via a gameplay action (e.g. take-upcard / draw-stock / draw-discard)
  // and must render immediately — gameplay-acquired cards are NOT part
  // of the opening-deal settlement ledger.
  const deal = useDealRuntime();
  const myState = useMemo(() => {
    if (!rawMyState) return rawMyState;
    if (!deal) return rawMyState;
    if (deal.phase === 'GAMEPLAY' || deal.phase === 'READY') return rawMyState;
    // DealRuntime is transport lifecycle, not card ownership. Once the
    // authoritative Gin phase is playable, a seated client's own hand must
    // stay rendered even if the deal runtime remounts, re-enters PRE_DEAL,
    // or has a temporarily empty settlement ledger.
    if (ginState.phase !== 'dealing') return rawMyState;
    // Authoritative gameplay membership beyond opening size → render full hand.
    if (rawMyState.hand.length > GIN_CARDS_PER_PLAYER) return rawMyState;
    if (deal.phase === 'PRE_DEAL') return { ...rawMyState, hand: [] };
    const allowed = Math.min(
      deal.getSettledCountForPlayer(currentPlayerId),
      GIN_CARDS_PER_PLAYER,
    );
    if (allowed >= rawMyState.hand.length) return rawMyState;
    return { ...rawMyState, hand: rawMyState.hand.slice(0, allowed) };
  }, [rawMyState, deal, currentPlayerId, ginState.phase, deal?.phase, deal?.settledCardIds]);

  // Single-owner discard contract: Take must be disabled until the
  // opening discard intent for the current hand has settled.
  const discardCardId = deal?.handContextId ? `${deal.handContextId}#discard` : null;
  const discardRevealed = !deal || !discardCardId
    ? true
    : deal.phase === 'GAMEPLAY' || deal.phase === 'READY' || deal.isSettled(discardCardId);

  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;

  useEffect(() => {
  }, [ginState.handNumber, ginState.phase, ginState.turnPhase, ginState.actionCount, isMyTurn, isProcessing, rawMyState?.hand?.length, myState?.hand?.length, deal?.handContextId, deal?.phase, deal?.expectedCount, deal?.settledCardIds.size, currentPlayerId]);

  // Track newly drawn card
  useEffect(() => {
    if (prevTurnPhaseRef.current === 'draw' && ginState.turnPhase === 'discard' && isMyTurn) {
      const lastAct = ginState.lastAction;
      if (lastAct && (lastAct.type === 'draw_stock' || lastAct.type === 'draw_discard') && lastAct.card) {
        setDrawnCard({ rank: lastAct.card.rank, suit: lastAct.card.suit });
      }
    }
    prevTurnPhaseRef.current = ginState.turnPhase;
  }, [ginState.turnPhase, ginState.lastAction, isMyTurn]);

  useEffect(() => {
    if (!isMyTurn || ginState.phase !== 'playing') {
      setDrawnCard(null);
    }
  }, [isMyTurn, ginState.phase]);

  // Clear selected card on phase transition
  useEffect(() => {
    setSelectedCardIndex(null);
    onLayOffCardSelected?.(null);
  }, [ginState.phase]);

  // Knock/Gin checks
  const handAfterDiscard = useMemo(() => {
    if (selectedCardIndex === null || !myState) return null;
    const h = [...myState.hand];
    h.splice(selectedCardIndex, 1);
    return h;
  }, [selectedCardIndex, myState]);

  const canKnockNow = isMyTurn && ginState.turnPhase === 'discard' && handAfterDiscard && canKnock(handAfterDiscard);
  const hasGinNow = isMyTurn && ginState.turnPhase === 'discard' && handAfterDiscard && hasGin(handAfterDiscard);

  // Lay-off detection: am I the non-knocker in knocking/laying_off phase?
  const knockerId = useMemo(() => {
    return Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
  }, [ginState.playerStates]);

  const iAmKnocker = knockerId === currentPlayerId;
  const isLayingOff = (ginState.phase === 'knocking' || ginState.phase === 'laying_off') &&
    ginState.currentTurnPlayerId === currentPlayerId && !iAmKnocker;

  const layOffOptions = useMemo(() => {
    if (!isLayingOff || !knockerId || !myState) return [];
    const knockerMelds = ginState.playerStates[knockerId].melds;
    return findLayOffOptions(myState.hand, knockerMelds);
  }, [isLayingOff, knockerId, myState, ginState.playerStates]);

  const selectedLayOffTarget = useMemo(() => {
    if (selectedCardIndex === null || !myState) return null;
    const selectedCard = myState.hand[selectedCardIndex];
    if (!selectedCard) return null;
    return layOffOptions.find(lo => lo.card.rank === selectedCard.rank && lo.card.suit === selectedCard.suit) || null;
  }, [selectedCardIndex, myState, layOffOptions]);

  // Organize hand: deadwood first (rank-sorted), then melds
  const organizedHand = useMemo(() => {
    if (!myState || myState.hand.length === 0) return { meldCards: [], deadwoodCards: [], melds: [] as Meld[] };
    const { melds, deadwood } = findOptimalMelds(myState.hand);

    const meldCards: Array<{ card: GinRummyCard; originalIndex: number; meldGroup: number }> = [];
    melds.forEach((meld, meldIdx) => {
      meld.cards.forEach(card => {
        const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        if (originalIndex !== -1) meldCards.push({ card, originalIndex, meldGroup: meldIdx });
      });
    });

    const deadwoodCards = [...deadwood]
      .sort((a, b) => (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0))
      .map(card => {
        const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        return { card, originalIndex, meldGroup: -1 };
      });

    return { meldCards, deadwoodCards, melds };
  }, [myState]);

  // For post-knock phase: use the scored melds/deadwood if available, else computed
  const postKnockMelds: Meld[] = myState?.melds?.length > 0 ? myState.melds : organizedHand.melds;
  const postKnockDeadwoodCards = useMemo(() => {
    if (!myState) return [];
    if (myState.deadwood?.length > 0) {
      return [...myState.deadwood]
        .sort((a, b) => (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0));
    }
    return organizedHand.deadwoodCards.map(d => d.card);
  }, [myState, organizedHand.deadwoodCards]);

  // Laidoff cards for knocker display — tracked on the NON-knocker's state
  const laidOffOnMyMelds: GinRummyCard[] = useMemo(() => {
    if (!iAmKnocker || !knockerId) return [];
    const nonKnockerId = knockerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;
    const nonKnockerState = ginState.playerStates[nonKnockerId];
    return nonKnockerState?.laidOffCards || [];
  }, [iAmKnocker, knockerId, ginState.playerStates, ginState.dealerPlayerId, ginState.nonDealerPlayerId]);

  const handleCardClick = (index: number) => {
    if (!myState) return;
    const canSelect = (ginState.turnPhase === 'discard' && isMyTurn && ginState.phase === 'playing') || isLayingOff;
    if (canSelect) {
      const newIndex = selectedCardIndex === index ? null : index;
      setSelectedCardIndex(newIndex);
      if (isLayingOff) {
        onLayOffCardSelected?.(newIndex);
      }
    }
  };

  const handleDiscard = () => {
    if (selectedCardIndex === null) return;
    onDiscard(selectedCardIndex);
    setSelectedCardIndex(null);
  };

  const handleKnock = () => {
    if (selectedCardIndex === null) return;
    onKnock(selectedCardIndex);
    setSelectedCardIndex(null);
  };

  const handleLayOff = () => {
    if (selectedCardIndex === null || !selectedLayOffTarget) return;
    onLayOff(selectedCardIndex, selectedLayOffTarget.onMeldIndex);
    onLayOffCardSelected?.(null);
    setSelectedCardIndex(null);
  };




  if (!myState) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const layOffCardIndices = new Set(
    isLayingOff
      ? layOffOptions.map(lo => myState.hand.findIndex(c => c.rank === lo.card.rank && c.suit === lo.card.suit)).filter(i => i !== -1)
      : []
  );

  const inPostKnock = isPostKnockPhase(ginState.phase);
  const flatSortedHand = [...organizedHand.deadwoodCards, ...organizedHand.meldCards]
    .sort((a, b) => {
      const rankDiff = (RANK_ORDER[a.card.rank] || 0) - (RANK_ORDER[b.card.rank] || 0);
      if (rankDiff !== 0) return rankDiff;
      return (SUIT_ORDER[a.card.suit] || 0) - (SUIT_ORDER[b.card.suit] || 0);
    });

  // Static margins — match the prior `-space-x-4` (16px) overlap on lg
  // (48px) cards; md (40px) scaled proportionally. Adaptive fan behavior
  // for this hand will move to the HUDStack contract.
  const ginLgMarginPx = -16;
  const ginMdMarginPx = -13;


  return (
    <div className="relative h-full px-2 flex flex-col">

      {/* ── POST-KNOCK VIEW: Melds left-justified, deadwood right-justified, wraps naturally ── */}
      {inPostKnock ? (
        <div className={cn("flex flex-col w-full", isLayingOff ? "gap-0 py-0" : "gap-1 py-1")}>
          {/* Single flex-wrap row: melds flush-left, deadwood flush-right */}
          <div className={cn("flex items-end flex-wrap w-full px-1", isLayingOff ? "gap-y-0" : "gap-y-1")}>
            {/* Melds */}
            {postKnockMelds.map((meld, meldIdx) => (
              <div key={`my-meld-${meldIdx}`} className={cn("flex", meldIdx > 0 && "ml-3")}>
                {meld.cards.map((card, ci) => {
                  const isLaidOff = iAmKnocker && laidOffOnMyMelds.some(lo => lo.rank === card.rank && lo.suit === card.suit);
                  const m = isLayingOff ? ginMdMarginPx : ginLgMarginPx;
                  return (
                    <div
                      key={`my-meld-${meldIdx}-${ci}`}
                      className={cn(isLaidOff && "rounded ring-[3px] ring-blue-400 shadow-[0_0_8px_2px_rgba(96,165,250,0.7)]")}
                      style={{ zIndex: ci, marginLeft: ci === 0 ? 0 : `${m}px` }}
                    >
              <CribbagePlayingCard card={toDisplayCard(card)} size={isLayingOff ? "md" : "lg"} tier="large" />
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Laid-off cards are already shown within the melds with blue highlight — no separate section needed */}

            {/* Deadwood — pushed to the right on whichever row it lands on */}
            {postKnockDeadwoodCards.length > 0 && (
              <div className="flex ml-auto items-end">
                {postKnockDeadwoodCards.map((card, ci) => {
                  const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
                  const isSelected = selectedCardIndex === originalIndex;
                  const m = isLayingOff ? ginMdMarginPx : ginLgMarginPx;
                  return (
                    <button
                      key={`dw-${card.rank}-${card.suit}-${ci}`}
                      onClick={() => originalIndex !== -1 && handleCardClick(originalIndex)}
                      disabled={isProcessing || !isLayingOff}
                      className={cn(
                        "transition-all duration-200 rounded relative opacity-80",
                        isSelected ? "-translate-y-3 ring-2 ring-poker-gold z-20" : "",
                        isLayingOff && "cursor-pointer"
                      )}
                      style={{ zIndex: isSelected ? 20 : ci, marginLeft: ci === 0 ? 0 : `${m}px` }}
                    >
                      <CribbagePlayingCard card={toDisplayCard(card)} size={isLayingOff ? "md" : "lg"} tier="large" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DW value — right-aligned */}
          <div className={cn("flex items-center justify-end pr-2", isLayingOff && "py-0")}>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              DW: {postKnockDeadwoodCards.length > 0
                ? (myState.deadwoodValue > 0 ? myState.deadwoodValue : findOptimalMelds(myState.hand).deadwoodValue)
                : 0}
            </span>
          </div>
        </div>
      ) : (
        /* ── NORMAL PLAY VIEW: shared active-hand fan ── */
        <>
          {/*
            Pane-owned composition: the top spacer + fan host fill the
            pane; the DW label now lives inside the lower-zone action
            strip below (right-aligned) so the top of the pane stays
            clear and the portaled fan has full vertical breathing
            room. The active-hand fan is portaled INTO
            `[data-gin-active-pane-content]` by MeasuredActiveHandFan,
            which measures the un-transformed pane rect and every
            `[data-active-hand-lower-zone]` sibling (below), then
            derives:
                stageRect.height = paneH·maxHeightPct
                                     bounded by paneH − reserved − clearance
                reserved  = max(paneH·reservedLowerZonePct,
                                measured lower zone + safe area)
                clearance = paneH · interZoneClearancePctOfPane
            Cards align flex-end inside stageRect, so their bottom edge
            sits exactly `clearance` px above the action zone. Tuning
            `interZoneClearancePctOfPane` now visibly repositions the
            gap — no independent Gin action-zone layout path remains.
          */}
          <div
            data-gin-active-hand-stage-spacer=""
            className="flex-1 min-h-0"
          />

          <MeasuredActiveHandFan
            game="ginRummy"
            cards={flatSortedHand.map(({ card }) => ({
              suit: card.suit as CanonicalCardType['suit'],
              rank: card.rank as CanonicalCardType['rank'],
            }))}
            capacity={GIN_CARDS_PER_PLAYER + 1}
            portalTargetSelector="[data-gin-active-pane-content]"
            phaseLockKey={`gin|h${ginState.handNumber}|ph:${ginState.phase}|tp:${ginState.turnPhase}|p:${currentPlayerId}`}
            applyFan
            renderCard={({ index, card_node }) => {
              const item = flatSortedHand[index];
              if (!item) return null;
              const { card, originalIndex, meldGroup } = item;
              const isSelected = selectedCardIndex === originalIndex;
              const canSelect = (isMyTurn && ginState.turnPhase === 'discard' && ginState.phase === 'playing') || isLayingOff;
              const isNewlyDrawn = drawnCard && card.rank === drawnCard.rank && card.suit === drawnCard.suit;
              const isMeld = meldGroup >= 0;
              return (
                <button
                  onClick={() => handleCardClick(originalIndex)}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  disabled={isProcessing || !canSelect}
                  className={cn(
                    "transition-all duration-200 rounded relative pointer-events-auto",
                    isMeld ? "opacity-100" : "opacity-80",
                    isSelected ? "-translate-y-3 ring-2 ring-poker-gold z-20" : "translate-y-0",
                    canSelect && !isSelected && "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1",
                    isNewlyDrawn && !isSelected && "ring-2 ring-sky-400"
                  )}
                  style={{ zIndex: isSelected ? 20 : index }}
                >
                  {card_node}
                </button>
              );
            }}
          />
        </>
      )}

      {/* ── Action area ── */}
      <div data-active-hand-lower-zone="" className="relative flex items-center justify-center min-h-[28px] gap-2 flex-wrap">
        {/* Deadwood readout — right-aligned inside the action strip so
            it no longer eats vertical room above the fan. Post-knock
            view renders its own DW block above (line ~379). */}
        {!inPostKnock && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground pointer-events-none">
            DW: {myState.hand.length > 0 ? findOptimalMelds(myState.hand).deadwoodValue : '–'}
          </span>
        )}

        {/* First Draw phase — tap discard on felt to take, Pass button to pass */}
        {ginState.phase === 'first_draw' && isMyTurn && (
          <>
            <Button onClick={onTakeFirstDraw} disabled={isProcessing || !discardRevealed} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4 disabled:opacity-50" size="sm">
              Take
            </Button>
            <Button onClick={onPassFirstDraw} disabled={isProcessing || !discardRevealed} variant="outline" className="border-white/40 text-foreground px-4 disabled:opacity-50" size="sm">
              Pass
            </Button>
          </>
        )}

        {ginState.phase === 'first_draw' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Opponent deciding on upcard...</p>
        )}

        {/* Draw phase */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'draw' && isMyTurn && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap stock or discard on felt</p>
        )}

        {/* Discard phase - card selected */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'discard' && isMyTurn && selectedCardIndex !== null && (
          <>
            <Button onClick={handleDiscard} disabled={isProcessing} className="bg-amber-700 hover:bg-amber-600 text-white font-bold px-4" size="sm">
              Discard
            </Button>
            {canKnockNow && !hasGinNow && (
              <Button onClick={handleKnock} disabled={isProcessing} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4" size="sm">
                Knock!
              </Button>
            )}
            {hasGinNow && (
              <Button onClick={handleKnock} disabled={isProcessing} className="bg-green-600 hover:bg-green-500 text-white font-bold px-4" size="sm">
                GIN! 🎉
              </Button>
            )}
          </>
        )}

        {/* Discard phase - no card selected */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'discard' && isMyTurn && selectedCardIndex === null && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap a card to select</p>
        )}

        {/* Waiting for opponent during play */}
        {ginState.phase === 'playing' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Waiting for opponent...</p>
        )}

        {/* Laying off - my turn as non-knocker */}
        {isLayingOff && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Button onClick={onFinishLayingOff} disabled={isProcessing} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4" size="sm">
              Done Laying Off
            </Button>
          </div>
        )}

        {/* Waiting while opponent (the non-knocker) lays off onto my melds */}
        {(ginState.phase === 'knocking' || ginState.phase === 'laying_off') && iAmKnocker && (
          <p className="text-muted-foreground text-sm">Opponent laying off...</p>
        )}

        {/* Scoring */}
        {ginState.phase === 'scoring' && (
          <p className="text-poker-gold text-sm">Resolving hand...</p>
        )}

        {/* Complete */}
        {ginState.phase === 'complete' && (
          <p className="text-muted-foreground text-sm">
            {ginState.winnerPlayerId ? 'Match over!' : ginState.knockResult ? 'Dealing next hand...' : 'Void hand — re-dealing...'}
          </p>
        )}
      </div>
      <GinActivePaneGeometryPill
        policy={ginPolicy}
        policyRevision={ginPolicyRevision}
      />
    </div>
  );
};

// ─── Instrumentation ────────────────────────────────────────────────
// Temporary on-screen Gin active-pane geometry pill. Hidden by default;
// enable by appending `?ginGeom=1` to the URL, or set
// `localStorage.ptp_ginGeom = '1'`. Also exposes the same snapshot on
// `window.__ptp_ginPaneGeom` for export.
function GinActivePaneGeometryPill({
  policy,
  policyRevision,
}: {
  policy: ReturnType<typeof useActiveHandLayoutPolicy>;
  policyRevision: number;
}) {
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('ginGeom') === '1') return true;
      return window.localStorage?.getItem('ptp_ginGeom') === '1';
    } catch {
      return false;
    }
  });
  const [snap, setSnap] = useState<{
    paneTop: number;
    paneBottom: number;
    paneH: number;
    stageTop: number;
    stageBottom: number;
    stageH: number;
    resolvedClearancePx: number;
    reservedLowerZonePx: number;
    actionZoneComputedTop: number;
    actionZoneActualTop: number;
    actionZoneH: number;
    delta: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!enabled && typeof window !== 'undefined' && !(window as any).__ptp_ginPaneGeomAlwaysCompute) {
      // Still compute & publish to window for headless export, but
      // don't render. Cheap; runs only when a pane exists.
    }
    const compute = () => {
      const pane = document.querySelector<HTMLElement>('[data-gin-active-pane-content]');
      if (!pane) return;
      const paneRect = pane.getBoundingClientRect();
      const action = pane.querySelector<HTMLElement>('[data-active-hand-lower-zone]');
      const actionRect = action?.getBoundingClientRect() ?? null;
      const measuredLowerZoneMinPx = actionRect ? actionRect.height : 0;
      const { stageRect, reservedLowerZonePx, interZoneClearancePx } =
        computeStageRectFromPane(
          { width: paneRect.width, height: paneRect.height },
          policy,
          { measuredLowerZoneMinPx, safeAreaBottomPx: 0 },
        );
      const stageTop = paneRect.top;
      const stageBottom = stageTop + stageRect.height;
      const actionZoneComputedTop = stageBottom + interZoneClearancePx;
      const actionZoneActualTop = actionRect ? actionRect.top : NaN;
      const next = {
        paneTop: paneRect.top,
        paneBottom: paneRect.bottom,
        paneH: paneRect.height,
        stageTop,
        stageBottom,
        stageH: stageRect.height,
        resolvedClearancePx: interZoneClearancePx,
        reservedLowerZonePx,
        actionZoneComputedTop,
        actionZoneActualTop,
        actionZoneH: actionRect?.height ?? 0,
        delta: Number.isFinite(actionZoneActualTop)
          ? actionZoneActualTop - actionZoneComputedTop
          : NaN,
      };
      if (typeof window !== 'undefined') {
        (window as any).__ptp_ginPaneGeom = { ...next, policy, policyRevision };
      }
      setSnap(next);
    };
    compute();
    if (typeof ResizeObserver === 'undefined') return;
    const pane = document.querySelector<HTMLElement>('[data-gin-active-pane-content]');
    if (!pane) return;
    const ro = new ResizeObserver(compute);
    ro.observe(pane);
    const action = pane.querySelector<HTMLElement>('[data-active-hand-lower-zone]');
    if (action) ro.observe(action);
    const mo = new MutationObserver(compute);
    mo.observe(pane, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [enabled, policy, policyRevision]);

  if (!enabled || !snap) return null;
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');
  return (
    <div
      data-gin-active-pane-geom-pill=""
      className="pointer-events-none absolute left-1 bottom-1 z-[9999] rounded bg-black/80 px-2 py-1 font-mono text-[10px] leading-tight text-emerald-300 shadow"
      style={{ maxWidth: 220 }}
    >
      <div className="text-emerald-200">gin pane geom · rev {policyRevision}</div>
      <div>pane H: {fmt(snap.paneH)}</div>
      <div>stage T/B: {fmt(snap.stageTop)} / {fmt(snap.stageBottom)}</div>
      <div>stage H: {fmt(snap.stageH)}</div>
      <div>clearance: {fmt(snap.resolvedClearancePx)}</div>
      <div>reserved LZ: {fmt(snap.reservedLowerZonePx)}</div>
      <div>action ⌐ top (calc): {fmt(snap.actionZoneComputedTop)}</div>
      <div>action ⌐ top (actual): {fmt(snap.actionZoneActualTop)}</div>
      <div className={Math.abs(snap.delta) < 2 ? 'text-emerald-300' : 'text-amber-300'}>
        Δ: {fmt(snap.delta)}px
      </div>
    </div>
  );
}
