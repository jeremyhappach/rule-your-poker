// Gin Rummy Mobile Cards Tab - Player's hand display and action buttons
// Follows the CribbageMobileCardsTab pattern

import { useState, useMemo } from 'react';
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

const toDisplayCard = (card: GinRummyCard) => ({
  suit: card.suit as any,
  rank: card.rank,
  value: card.value,
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
  currentPlayer,
  gameId,
}: GinRummyMobileCardsTabProps) => {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [isEmoticonSending, setIsEmoticonSending] = useState(false);

  const myState = ginState.playerStates[currentPlayerId];
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const cardCount = myState?.hand.length || 0;

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
      {/* Cards display */}
      <div className="flex items-center justify-center min-h-[92px] py-0">
        <div
          className={cn(
            "flex justify-center origin-center",
            cardCount > 10 ? "-space-x-3" : "-space-x-1",
            cardCount <= 7 ? "scale-[1.55]" : cardCount <= 10 ? "scale-[1.25]" : "scale-[1.1]"
          )}
        >
          {myState.hand.map((card, index) => {
            const isSelected = selectedCardIndex === index;
            const canSelect = (isMyTurn && ginState.turnPhase === 'discard' && ginState.phase === 'playing') || isLayingOff;
            const isLayOffable = layOffCardIndices.has(index);

            return (
              <button
                key={`${card.rank}-${card.suit}-${index}`}
                onClick={() => handleCardClick(index)}
                onPointerUp={(e) => e.currentTarget.blur()}
                disabled={isProcessing || !canSelect}
                className={cn(
                  "transition-all duration-200 rounded relative",
                  isSelected
                    ? "-translate-y-3 ring-2 ring-poker-gold z-10"
                    : "translate-y-0",
                  canSelect &&
                    !isSelected &&
                    "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-poker-gold/50",
                  isLayingOff && isLayOffable && !isSelected && "ring-1 ring-green-400/60 -translate-y-0.5"
                )}
                style={{ zIndex: isSelected ? 10 : index }}
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
            {selectedCardIndex !== null && selectedLayOffTarget && (
              <Button
                onClick={handleLayOff}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-500 text-white font-bold px-4"
                size="sm"
              >
                Lay Off
              </Button>
            )}
            {selectedCardIndex !== null && !selectedLayOffTarget && (
              <p className="text-[10px] text-red-400">Can't lay off this card</p>
            )}
            <Button
              onClick={onFinishLayingOff}
              disabled={isProcessing}
              variant="outline"
              className="border-white/40 text-foreground px-4"
              size="sm"
            >
              Done
            </Button>
            {layOffOptions.length > 0 && selectedCardIndex === null && (
              <p className="text-green-400 text-[10px] animate-pulse">
                {layOffOptions.length} card{layOffOptions.length > 1 ? 's' : ''} can lay off
              </p>
            )}
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
