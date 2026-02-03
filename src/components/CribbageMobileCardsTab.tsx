import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn, formatChipValue } from '@/lib/utils';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { hasPlayableCard, getCardPointValue } from '@/lib/cribbageScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { QuickEmoticonPicker } from './QuickEmoticonPicker';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
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
}: CribbageMobileCardsTabProps) => {
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [isEmoticonSending, setIsEmoticonSending] = useState(false);
  
  const myPlayerState = cribbageState.playerStates[currentPlayerId];
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;
  const canPlayAnyCard = myPlayerState && hasPlayableCard(myPlayerState.hand, cribbageState.pegging.currentCount);
  const haveDiscarded = myPlayerState?.discardedToCrib.length > 0;
  const expectedDiscard = playerCount === 2 ? 2 : 1;
  
  // Pre-discard: show 6 cards compactly; post-discard: show 4 cards relaxed
  const isPreDiscard = cribbageState.phase === 'discarding' && !haveDiscarded;
  const cardCount = myPlayerState?.hand.length || 0;

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
        const card = myPlayerState.hand[index];
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

  if (!myPlayerState) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
      <div className="px-2 flex flex-col flex-1">
      {/* Cards display - adaptive layout */}
      <div className="flex items-center justify-center min-h-[108px] py-0.5">
        <div 
          className={cn(
            "flex justify-center origin-center",
            // Pre-discard: tighter spacing with overlap for 6 cards
            isPreDiscard ? "-space-x-3" : "gap-1",
            // Scale based on card count - slightly smaller to free up vertical space
            cardCount <= 4 ? "scale-[1.7]" : cardCount <= 5 ? "scale-[1.5]" : "scale-[1.3]"
          )}
        >
          {myPlayerState.hand.map((card, index) => {
            const isSelected = selectedCards.includes(index);
            const isPlayable = cribbageState.phase === 'pegging' && 
              isMyTurn && 
              getCardPointValue(card) + cribbageState.pegging.currentCount <= 31;
            
            return (
              <button
                key={index}
                onClick={() => handleCardClick(index)}
                disabled={isProcessing}
                className={cn(
                  "transition-all duration-200 rounded relative",
                  isSelected && "-translate-y-3 ring-2 ring-poker-gold z-10",
                  isMyTurn && isPlayable && "hover:-translate-y-1 hover:ring-1 hover:ring-poker-gold/50",
                  cribbageState.phase === 'discarding' && !haveDiscarded && "hover:-translate-y-2 hover:z-10"
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
      <div className="flex items-center justify-center min-h-[32px]">
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

      {/* Player info row - same styling as MobileGameTable, below action buttons */}
      <div className="flex items-center justify-center gap-2 py-1">
        {/* Quick emoticon picker - left of player name */}
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

      {/* Crib is shown on the felt during counting - no duplicate display here */}
    </div>
  );
};
