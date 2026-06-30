// Gin Rummy Mobile Cards Tab - Player's hand display and action buttons
// My cards always live here — never on the felt.
// During knocking/laying_off: show melds + deadwood organized, with lay-off UX.

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CARDS_PER_PLAYER as GIN_CARDS_PER_PLAYER, type GinRummyState, type GinRummyCard, type Meld } from '@/lib/ginRummyTypes';
import { canKnock, hasGin, findLayOffOptions, findOptimalMelds } from '@/lib/ginRummyScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { recordGinRunbackTrace } from '@/lib/ginRunbackTrace';
import {
  cardId,
  cardIds,
  diffIds,
  getCurrentGinSelfDrawTraceId,
  recordGinSelfDrawEvent,
} from '@/lib/ginSelfDrawTrace';
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
  withheldDrawnCards,
}: GinRummyMobileCardsTabProps) => {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  
  const [drawnCard, setDrawnCard] = useState<{ rank: string; suit: string } | null>(null);
  const prevTurnPhaseRef = useRef(ginState.turnPhase);

  const rawMyStateAuthoritative = ginState.playerStates[currentPlayerId];
  // Withhold each freshly drawn card from the rendered hand while its
  // own self-draw transport animation is in flight. The cards are
  // committed to ginState (so subsequent actions like discard remain
  // legal) but we visually withhold each face until its own flight
  // settles, mirroring the opponent ownership-claim model.
  const rawMyState = useMemo(() => {
    if (!rawMyStateAuthoritative) return rawMyStateAuthoritative;
    if (!withheldDrawnCards || withheldDrawnCards.length === 0) return rawMyStateAuthoritative;
    const clipped = [...rawMyStateAuthoritative.hand];
    for (const w of withheldDrawnCards) {
      const idx = clipped.findIndex(c => c.rank === w.rank && c.suit === w.suit);
      if (idx !== -1) clipped.splice(idx, 1);
    }
    if (clipped.length === rawMyStateAuthoritative.hand.length) return rawMyStateAuthoritative;
    return { ...rawMyStateAuthoritative, hand: clipped };
  }, [rawMyStateAuthoritative, withheldDrawnCards]);
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
    // Authoritative gameplay membership beyond opening size → render full hand.
    if (rawMyState.hand.length > GIN_CARDS_PER_PLAYER) return rawMyState;
    if (deal.phase === 'PRE_DEAL') return { ...rawMyState, hand: [] };
    const allowed = Math.min(
      deal.getSettledCountForPlayer(currentPlayerId),
      GIN_CARDS_PER_PLAYER,
    );
    if (allowed >= rawMyState.hand.length) return rawMyState;
    return { ...rawMyState, hand: rawMyState.hand.slice(0, allowed) };
  }, [rawMyState, deal, currentPlayerId, deal?.phase, deal?.settledCardIds]);

  // Single-owner discard contract: Take must be disabled until the
  // opening discard intent for the current hand has settled.
  const discardCardId = deal?.handContextId ? `${deal.handContextId}#discard` : null;
  const discardRevealed = !deal || !discardCardId
    ? true
    : deal.phase === 'GAMEPLAY' || deal.phase === 'READY' || deal.isSettled(discardCardId);

  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;

  useEffect(() => {
  }, [ginState.handNumber, ginState.phase, ginState.turnPhase, ginState.actionCount, isMyTurn, isProcessing, rawMyState?.hand?.length, myState?.hand?.length, deal?.handContextId, deal?.phase, deal?.expectedCount, deal?.settledCardIds.size, currentPlayerId]);

  // (6/7) RENDERED_HAND + DISPLAY_DIFF — emit whenever rendered self-hand changes.
  const prevRenderedRef = useRef<string[]>([]);
  useEffect(() => {
    const rawAuthIds = cardIds(rawMyStateAuthoritative?.hand ?? []);
    const displayIds = cardIds(rawMyState?.hand ?? []);
    const renderedIds = cardIds(myState?.hand ?? []);
    const withheldIds = (withheldDrawnCards ?? []).map(c => `${c.rank}${c.suit}`);
    const drawnCardId = withheldIds[withheldIds.length - 1] ?? null;
    const drawTraceId = getCurrentGinSelfDrawTraceId();
    const prev = prevRenderedRef.current;
    if (prev.length !== renderedIds.length || prev.some((v, i) => v !== renderedIds[i])) {
      const { added, removed } = diffIds(prev, renderedIds);
      const reasonParts: string[] = [];
      if (deal?.phase === 'PRE_DEAL') reasonParts.push('deal:PRE_DEAL→empty');
      else if (deal?.phase === 'DEALING') reasonParts.push('deal:DEALING settled-clip');
      else if (deal?.phase) reasonParts.push(`deal:${deal.phase} passthrough`);
      if (withheldIds.length > 0) reasonParts.push(`withheldDrawnCards active (${withheldIds.length})`);
      prevRenderedRef.current = renderedIds;
    }
  });

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
    <div className="h-full px-2 flex flex-col">

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
              <CribbagePlayingCard card={toDisplayCard(card)} size={isLayingOff ? "md" : "lg"} />
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
                      <CribbagePlayingCard card={toDisplayCard(card)} size={isLayingOff ? "md" : "lg"} />
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
        /* ── NORMAL PLAY VIEW: Flat horizontal row ── */
        <>
          <div className="flex items-center pl-2 pt-1">
            <span className="text-sm font-mono font-bold text-muted-foreground tracking-wide">
              DW: {myState.hand.length > 0 ? findOptimalMelds(myState.hand).deadwoodValue : '–'}
            </span>
          </div>
          <div className="flex items-start justify-center py-1 overflow-visible">
            {flatSortedHand.map(({ card, originalIndex, meldGroup }, ci) => {
              const isSelected = selectedCardIndex === originalIndex;
              const canSelect = (isMyTurn && ginState.turnPhase === 'discard' && ginState.phase === 'playing') || isLayingOff;
              const isNewlyDrawn = drawnCard && card.rank === drawnCard.rank && card.suit === drawnCard.suit;
              const isMeld = meldGroup >= 0;
              return (
                <button
                  key={`${card.rank}-${card.suit}-${originalIndex}`}
                  onClick={() => handleCardClick(originalIndex)}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  disabled={isProcessing || !canSelect}
                  className={cn(
                    "transition-all duration-200 rounded relative",
                    isMeld ? "opacity-100" : "opacity-80",
                    isSelected ? "-translate-y-3 ring-2 ring-poker-gold z-20" : "translate-y-0",
                    canSelect && !isSelected && "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1",
                    isNewlyDrawn && !isSelected && "ring-2 ring-sky-400"
                  )}
                  style={{ zIndex: isSelected ? 20 : ci, marginLeft: ci === 0 ? 0 : `${ginLgMarginPx}px` }}
                >
                  <CribbagePlayingCard card={toDisplayCard(card)} size="lg" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Action area ── */}
      <div className="flex items-center justify-center min-h-[28px] gap-2 flex-wrap">
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
    </div>
  );
};
