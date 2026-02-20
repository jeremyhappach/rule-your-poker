// Gin Rummy Mobile Cards Tab - Player's hand display and action buttons
// My cards always live here — never on the felt.
// During knocking/laying_off: show melds + deadwood organized, with lay-off UX.

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn, formatChipValue } from '@/lib/utils';
import type { GinRummyState, GinRummyCard, Meld } from '@/lib/ginRummyTypes';
import { canKnock, hasGin, findLayOffOptions, findOptimalMelds } from '@/lib/ginRummyScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { QuickEmoticonPicker } from './QuickEmoticonPicker';
import { supabase } from '@/integrations/supabase/client';

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
}: GinRummyMobileCardsTabProps) => {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [isEmoticonSending, setIsEmoticonSending] = useState(false);
  const [drawnCard, setDrawnCard] = useState<{ rank: string; suit: string } | null>(null);
  const prevTurnPhaseRef = useRef(ginState.turnPhase);

  const myState = ginState.playerStates[currentPlayerId];
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;

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

  // Laidoff cards for knocker display (cards opponent played onto my melds)
  const laidOffOnMyMelds: GinRummyCard[] = useMemo(() => {
    if (!myState || !iAmKnocker) return [];
    return myState.laidOffCards || [];
  }, [myState, iAmKnocker]);

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

  const handleQuickEmoticon = async (emoticon: string) => {
    if (isEmoticonSending || !currentPlayer) return;
    setIsEmoticonSending(true);
    try {
      const expiresAt = new Date(Date.now() + 4000).toISOString();
      await supabase.from('chip_stack_emoticons').insert({
        game_id: gameId,
        player_id: currentPlayer.id,
        emoticon,
        expires_at: expiresAt,
      });
    } catch (err) {
      console.error('Failed to send emoticon:', err);
    } finally {
      setIsEmoticonSending(false);
    }
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
  const flatSortedHand = [...organizedHand.deadwoodCards, ...organizedHand.meldCards];

  return (
    <div className="h-full px-2 flex flex-col">

      {/* ── POST-KNOCK VIEW: Organized melds + deadwood ── */}
      {inPostKnock ? (
        <div className="flex flex-col gap-1 py-1">
          {/* My melds */}
          {postKnockMelds.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap gap-1.5 justify-center">
                {postKnockMelds.map((meld, meldIdx) => (
                  <div key={`my-meld-${meldIdx}`} className="flex flex-col items-center gap-0.5">
                    <span className="text-[6px] text-white/40 uppercase tracking-wide">
                      {meld.type === 'run' ? 'Run' : 'Set'}
                    </span>
                    <div className="flex -space-x-2">
                      {meld.cards.map((card, ci) => (
                        <CribbagePlayingCard
                          key={`my-meld-${meldIdx}-${ci}`}
                          card={toDisplayCard(card)}
                          size="lg"
                        />
                      ))}
                      {/* Laid-off cards on this meld shown with blue highlight */}
                      {iAmKnocker && laidOffOnMyMelds.filter((_, li) => {
                        // We don't have per-meld tracking, show all laid off after the meld group
                        return false; // handled below
                      }).map((card, li) => (
                        <div key={`laid-off-${li}`} className="ring-2 ring-blue-400 rounded">
                          <CribbagePlayingCard card={toDisplayCard(card)} size="lg" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* All laid-off cards shown separately with blue ring if I'm the knocker */}
              {iAmKnocker && laidOffOnMyMelds.length > 0 && (
                <div className="flex flex-col items-center gap-0.5 mt-0.5">
                  <span className="text-[6px] text-blue-400/70 uppercase tracking-wide">Laid off onto you</span>
                  <div className="flex -space-x-2">
                    {laidOffOnMyMelds.map((card, li) => (
                      <div key={`lo-${li}`} className="ring-2 ring-blue-400 rounded">
                        <CribbagePlayingCard card={toDisplayCard(card)} size="lg" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* My deadwood */}
          {postKnockDeadwoodCards.length > 0 && (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[6px] text-red-400/70 uppercase tracking-wide">Deadwood</span>
              <div className={cn(
                "flex -space-x-2",
                isLayingOff ? "" : ""
              )}>
                {postKnockDeadwoodCards.map((card, ci) => {
                  const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
                  const isSelected = selectedCardIndex === originalIndex;
                  const isLayOffable = layOffCardIndices.has(originalIndex);
                  return (
                    <button
                      key={`dw-${card.rank}-${card.suit}-${ci}`}
                      onClick={() => originalIndex !== -1 && handleCardClick(originalIndex)}
                      disabled={isProcessing || !isLayingOff}
                      className={cn(
                        "transition-all duration-200 rounded relative",
                        isSelected ? "-translate-y-3 ring-2 ring-poker-gold z-20" : "",
                        isLayingOff && isLayOffable && !isSelected && "ring-1 ring-green-400/60",
                        isLayingOff && !isLayOffable && "opacity-50",
                        isLayingOff && "cursor-pointer"
                      )}
                      style={{ zIndex: isSelected ? 20 : ci }}
                    >
                      <CribbagePlayingCard card={toDisplayCard(card)} size="lg" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DW value */}
          <div className="flex items-center justify-center">
            <span className="text-xs font-mono font-bold text-muted-foreground">
              DW: {myState.deadwoodValue ?? findOptimalMelds(myState.hand).deadwoodValue}
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
          <div className="flex items-start justify-center py-1 overflow-visible -space-x-4">
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
                  style={{ zIndex: isSelected ? 20 : ci }}
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
        {/* First Draw phase */}
        {ginState.phase === 'first_draw' && isMyTurn && (
          <>
            <Button onClick={onTakeFirstDraw} disabled={isProcessing} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4" size="sm">
              Take Upcard
            </Button>
            <Button onClick={onPassFirstDraw} disabled={isProcessing} variant="outline" className="border-white/40 text-foreground px-4" size="sm">
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
            {layOffOptions.length > 0 && selectedCardIndex !== null && selectedLayOffTarget && (
              <Button onClick={handleLayOff} disabled={isProcessing} className="bg-green-600 hover:bg-green-500 text-white font-bold px-4" size="sm">
                Lay Off → Felt
              </Button>
            )}
            {layOffOptions.length > 0 && selectedCardIndex === null && (
              <p className="text-green-400 text-[10px] animate-pulse">
                {layOffOptions.length} card{layOffOptions.length > 1 ? 's' : ''} can lay off — select then tap meld on felt
              </p>
            )}
            {layOffOptions.length === 0 && (
              <p className="text-muted-foreground text-[10px]">Nothing to lay off</p>
            )}
            <Button onClick={onFinishLayingOff} disabled={isProcessing} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4" size="sm">
              {layOffOptions.length === 0 ? 'Continue' : 'Done Laying Off'}
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

      {/* Player info row */}
      <div className="flex items-center justify-center gap-2 py-0.5">
        <QuickEmoticonPicker onSelect={handleQuickEmoticon} disabled={isEmoticonSending || !currentPlayer} />
        <p className="font-semibold text-sm text-foreground">
          {currentPlayer.profiles?.username || 'You'}
        </p>
        <span className="font-bold text-lg text-poker-gold">
          ${formatChipValue(currentPlayer.chips)}
        </span>
      </div>
    </div>
  );
};
