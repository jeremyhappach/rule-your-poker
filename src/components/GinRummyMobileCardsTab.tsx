// Gin Rummy Mobile Cards Tab - Player's hand display and action buttons
// Follows the CribbageMobileCardsTab pattern

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn, formatChipValue } from '@/lib/utils';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import { canKnock, hasGin, findLayOffOptions } from '@/lib/ginRummyScoring';
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
  currentPlayer: Player;
  gameId: string;
}

// Convert symbol suits to word suits for CribbagePlayingCard
const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

// Rank order for sorting
const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

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
  currentPlayer,
  gameId,
}: GinRummyMobileCardsTabProps) => {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [isEmoticonSending, setIsEmoticonSending] = useState(false);
  const [drawnCard, setDrawnCard] = useState<{ rank: string; suit: string } | null>(null);
  const prevTurnPhaseRef = useRef(ginState.turnPhase);

  const myState = ginState.playerStates[currentPlayerId];
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const cardCount = myState?.hand.length || 0;

  // Track newly drawn card: when turnPhase changes to 'discard', capture the drawn card
  useEffect(() => {
    if (prevTurnPhaseRef.current === 'draw' && ginState.turnPhase === 'discard' && isMyTurn) {
      const lastAct = ginState.lastAction;
      if (lastAct && (lastAct.type === 'draw_stock' || lastAct.type === 'draw_discard') && lastAct.card) {
        setDrawnCard({ rank: lastAct.card.rank, suit: lastAct.card.suit });
      }
    }
    if (ginState.turnPhase === 'draw' || !isMyTurn || ginState.phase !== 'playing') {
      setDrawnCard(null);
    }
    prevTurnPhaseRef.current = ginState.turnPhase;
  }, [ginState.turnPhase, ginState.lastAction, isMyTurn, ginState.phase]);

  const canKnockNow = isMyTurn && ginState.turnPhase === 'discard' && myState && canKnock(myState.hand);
  const hasGinNow = isMyTurn && ginState.turnPhase === 'discard' && myState && hasGin(myState.hand);

  // Lay-off detection: am I the non-knocker in knocking/laying_off phase?
  const isLayingOff = (ginState.phase === 'knocking' || ginState.phase === 'laying_off') &&
    ginState.currentTurnPlayerId === currentPlayerId;

  const knockerId = useMemo(() => {
    return Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
  }, [ginState.playerStates]);

  const layOffOptions = useMemo(() => {
    if (!isLayingOff || !knockerId || !myState) return [];
    const knockerMelds = ginState.playerStates[knockerId].melds;
    return findLayOffOptions(myState.hand, knockerMelds);
  }, [isLayingOff, knockerId, myState, ginState.playerStates]);

  // Check if a selected card can be laid off
  const selectedLayOffTarget = useMemo(() => {
    if (selectedCardIndex === null || !myState) return null;
    const selectedCard = myState.hand[selectedCardIndex];
    if (!selectedCard) return null;
    const match = layOffOptions.find(
      lo => lo.card.rank === selectedCard.rank && lo.card.suit === selectedCard.suit
    );
    return match || null;
  }, [selectedCardIndex, myState, layOffOptions]);

  // Sort hand by rank for display, preserving original indices for actions
  const sortedHand = useMemo(() => {
    if (!myState) return [];
    return myState.hand
      .map((card, index) => ({ card, originalIndex: index }))
      .sort((a, b) => (RANK_ORDER[a.card.rank] || 0) - (RANK_ORDER[b.card.rank] || 0));
  }, [myState]);


  const handleCardClick = (index: number) => {
    if (!myState) return;
    // Allow selection during discard phase or lay-off phase
    if ((ginState.turnPhase === 'discard' && isMyTurn && ginState.phase === 'playing') || isLayingOff) {
      setSelectedCardIndex(selectedCardIndex === index ? null : index);
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

  // Highlight cards that can be laid off
  const layOffCardIndices = new Set(
    isLayingOff
      ? layOffOptions.map(lo => myState.hand.findIndex(c => c.rank === lo.card.rank && c.suit === lo.card.suit)).filter(i => i !== -1)
      : []
  );

  return (
    <div className="h-full px-2 flex flex-col">
      {/* Cards display - arched fan layout */}
      <div className="flex items-end justify-center min-h-[130px] py-1 overflow-visible">
        <div className="relative flex items-end justify-center" style={{ width: `${Math.min(cardCount * 28 + 20, 340)}px`, height: '110px' }}>
          {sortedHand.map(({ card, originalIndex }, i) => {
            const isSelected = selectedCardIndex === originalIndex;
            const canSelect = (isMyTurn && ginState.turnPhase === 'discard' && ginState.phase === 'playing') || isLayingOff;
            const isLayOffable = layOffCardIndices.has(originalIndex);
            const isNewlyDrawn = drawnCard && card.rank === drawnCard.rank && card.suit === drawnCard.suit;

            // Fan arc: spread cards evenly, rotate around center
            const mid = (cardCount - 1) / 2;
            const offset = i - mid;
            const maxAngle = cardCount > 8 ? 3 : 4; // degrees per card
            const rotation = offset * maxAngle;
            const maxOffset = Math.abs(mid);
            const yOffset = (maxOffset * maxOffset - offset * offset) * 1.5; // inverted parabola: high in center, low at edges
            const xSpread = offset * (cardCount > 9 ? 22 : 26);

            return (
              <button
                key={`${card.rank}-${card.suit}-${originalIndex}`}
                onClick={() => handleCardClick(originalIndex)}
                onPointerUp={(e) => e.currentTarget.blur()}
                disabled={isProcessing || !canSelect}
                className={cn(
                  "absolute transition-all duration-200 rounded",
                  isSelected
                    ? "ring-2 ring-poker-gold z-20"
                    : "",
                  canSelect &&
                    !isSelected &&
                    "[@media(hover:hover)_and_(pointer:fine)]:hover:ring-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-poker-gold/50",
                  isLayingOff && isLayOffable && !isSelected && "ring-1 ring-green-400/60",
                  isNewlyDrawn && !isSelected && "ring-2 ring-sky-400 animate-pulse"
                )}
                style={{
                  zIndex: isSelected ? 20 : i,
                  left: '50%',
                  transform: `translateX(${xSpread - 16}px) translateY(${isSelected ? -(yOffset + 14) : -yOffset}px) rotate(${rotation}deg)`,
                  transformOrigin: 'bottom center',
                }}
              >
                <CribbagePlayingCard card={toDisplayCard(card)} size="md" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Action area */}
      <div className="flex items-center justify-center min-h-[28px] gap-2">
        {/* First Draw phase */}
        {ginState.phase === 'first_draw' && isMyTurn && (
          <>
            <Button
              onClick={onTakeFirstDraw}
              disabled={isProcessing}
              className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4"
              size="sm"
            >
              Take Upcard
            </Button>
            <Button
              onClick={onPassFirstDraw}
              disabled={isProcessing}
              variant="outline"
              className="border-white/40 text-foreground px-4"
              size="sm"
            >
              Pass
            </Button>
          </>
        )}

        {ginState.phase === 'first_draw' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Opponent deciding on upcard...</p>
        )}

        {/* Draw phase */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'draw' && isMyTurn && (
          <>
            <Button
              onClick={onDrawStock}
              disabled={isProcessing}
              className="bg-blue-700 hover:bg-blue-600 text-white font-bold px-4"
              size="sm"
            >
              Draw Stock
            </Button>
            <Button
              onClick={onDrawDiscard}
              disabled={isProcessing}
              className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4"
              size="sm"
            >
              Draw Discard
            </Button>
          </>
        )}

        {/* Discard phase - card selected */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'discard' && isMyTurn && selectedCardIndex !== null && (
          <>
            <Button
              onClick={handleDiscard}
              disabled={isProcessing}
              className="bg-amber-700 hover:bg-amber-600 text-white font-bold px-4"
              size="sm"
            >
              Discard
            </Button>
            {canKnockNow && !hasGinNow && (
              <Button
                onClick={handleKnock}
                disabled={isProcessing}
                className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4"
                size="sm"
              >
                Knock!
              </Button>
            )}
            {hasGinNow && (
              <Button
                onClick={handleKnock}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-500 text-white font-bold px-4"
                size="sm"
              >
                GIN! 🎉
              </Button>
            )}
          </>
        )}

        {/* Discard phase - no card selected */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'discard' && isMyTurn && selectedCardIndex === null && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap a card to select</p>
        )}

        {/* Waiting for opponent */}
        {ginState.phase === 'playing' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Waiting for opponent...</p>
        )}

        {/* Laying off - human player */}
        {isLayingOff && (
          <div className="flex items-center gap-2">
            {layOffOptions.length > 0 && selectedCardIndex !== null && selectedLayOffTarget && (
              <Button
                onClick={handleLayOff}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-500 text-white font-bold px-4"
                size="sm"
              >
                Lay Off
              </Button>
            )}
            {layOffOptions.length > 0 && selectedCardIndex === null && (
              <p className="text-green-400 text-[10px] animate-pulse">
                {layOffOptions.length} card{layOffOptions.length > 1 ? 's' : ''} can lay off — tap to select
              </p>
            )}
            {layOffOptions.length === 0 && (
              <p className="text-muted-foreground text-[10px]">Nothing to lay off</p>
            )}
            <Button
              onClick={onFinishLayingOff}
              disabled={isProcessing}
              className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4"
              size="sm"
            >
              {layOffOptions.length === 0 ? 'Continue' : 'Done Laying Off'}
            </Button>
          </div>
        )}

        {/* Waiting during knocking phase (not my turn to lay off) */}
        {(ginState.phase === 'knocking' || ginState.phase === 'laying_off') && !isLayingOff && (
          <p className="text-muted-foreground text-sm">Opponent laying off...</p>
        )}

        {/* Scoring */}
        {ginState.phase === 'scoring' && (
          <p className="text-poker-gold text-sm">Resolving knock...</p>
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
        <QuickEmoticonPicker
          onSelect={handleQuickEmoticon}
          disabled={isEmoticonSending || !currentPlayer}
        />
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
