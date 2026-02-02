import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { 
  initializeCribbageGame, 
  discardToCrib, 
  playPeggingCard, 
  callGo,
  getPhaseDisplayName 
} from '@/lib/cribbageGameLogic';
import { hasPlayableCard, getCardPointValue } from '@/lib/cribbageScoring';
import { getBotDiscardIndices, getBotPeggingCardIndex, shouldBotCallGo } from '@/lib/cribbageBotLogic';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { cn } from '@/lib/utils';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface CribbageMobileGameTableProps {
  gameId: string;
  roundId: string;
  players: Player[];
  currentUserId: string;
  dealerPosition: number;
  anteAmount: number;
  pot: number;
  onGameComplete: () => void;
}

export const CribbageMobileGameTable = ({
  gameId,
  roundId,
  players,
  currentUserId,
  dealerPosition,
  anteAmount,
  pot,
  onGameComplete,
}: CribbageMobileGameTableProps) => {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  
  // Track the last pegging sequence start index for clearing old cards
  const [sequenceStartIndex, setSequenceStartIndex] = useState(0);
  const lastCountRef = useRef<number>(0);

  // Initialize game state from database or create new
  useEffect(() => {
    const loadOrInitializeState = async () => {
      const { data: roundData, error } = await supabase
        .from('rounds')
        .select('cribbage_state')
        .eq('id', roundId)
        .single();

      if (error) {
        console.error('[CRIBBAGE] Error loading state:', error);
        return;
      }

      if (roundData?.cribbage_state) {
        setCribbageState(roundData.cribbage_state as unknown as CribbageState);
      } else {
        const dealerPlayer = players.find(p => p.position === dealerPosition) || players[0];
        const playerIds = players.map(p => p.id);
        const newState = initializeCribbageGame(playerIds, dealerPlayer.id, anteAmount);
        
        await supabase
          .from('rounds')
          .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
          .eq('id', roundId);
        
        setCribbageState(newState);
      }
    };

    loadOrInitializeState();
  }, [roundId, players, anteAmount, dealerPosition]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`cribbage-mobile-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        (payload) => {
          const newState = payload.new as { cribbage_state?: CribbageState };
          if (newState.cribbage_state) {
            setCribbageState(newState.cribbage_state);
            
            if (newState.cribbage_state.phase === 'complete' && newState.cribbage_state.winnerPlayerId) {
              onGameComplete();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, onGameComplete]);

  // Track when pegging sequence resets to clear old cards from display
  useEffect(() => {
    if (!cribbageState || cribbageState.phase !== 'pegging') return;
    
    const currentCount = cribbageState.pegging.currentCount;
    if (currentCount === 0 && lastCountRef.current > 0) {
      setSequenceStartIndex(cribbageState.pegging.playedCards.length);
    }
    lastCountRef.current = currentCount;
  }, [cribbageState?.pegging.currentCount, cribbageState?.pegging.playedCards.length, cribbageState?.phase]);

  // Auto-go: When it's our turn and we can't play, automatically call go
  useEffect(() => {
    if (!cribbageState || !currentPlayerId || isProcessing) return;
    if (cribbageState.phase !== 'pegging') return;
    if (cribbageState.pegging.currentTurnPlayerId !== currentPlayerId) return;
    
    const myState = cribbageState.playerStates[currentPlayerId];
    if (!myState) return;
    
    const canPlay = hasPlayableCard(myState.hand, cribbageState.pegging.currentCount);
    if (!canPlay && myState.hand.length > 0) {
      const timeout = setTimeout(() => {
        handleGo();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [cribbageState?.pegging.currentTurnPlayerId, cribbageState?.pegging.currentCount, currentPlayerId, isProcessing]);

  // Bot decision ref to prevent duplicate actions
  const botActionInProgress = useRef(false);

  // Bot decision logic
  useEffect(() => {
    if (!cribbageState || isProcessing || botActionInProgress.current) return;
    if (cribbageState.phase === 'complete') return;

    const processBotActions = async () => {
      if (cribbageState.phase === 'discarding') {
        const expectedDiscard = players.length === 2 ? 2 : 1;
        for (const player of players) {
          if (!player.is_bot) continue;
          
          const botState = cribbageState.playerStates[player.id];
          if (!botState || botState.discardedToCrib.length > 0) continue;
          
          botActionInProgress.current = true;
          console.log('[CRIBBAGE BOT] Bot discarding:', player.id);
          
          const isDealer = player.id === cribbageState.dealerPlayerId;
          const discardIndices = getBotDiscardIndices(
            botState.hand,
            players.length,
            isDealer
          );
          
          await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
          
          try {
            const newState = discardToCrib(cribbageState, player.id, discardIndices);
            await supabase
              .from('rounds')
              .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
              .eq('id', roundId);
          } catch (err) {
            console.error('[CRIBBAGE BOT] Discard error:', err);
          } finally {
            botActionInProgress.current = false;
          }
          return;
        }
      }

      if (cribbageState.phase === 'pegging') {
        const currentTurnId = cribbageState.pegging.currentTurnPlayerId;
        if (!currentTurnId) return;

        const currentTurnPlayer = players.find(p => p.id === currentTurnId);
        if (!currentTurnPlayer?.is_bot) return;

        const botState = cribbageState.playerStates[currentTurnId];
        if (!botState) return;

        botActionInProgress.current = true;
        console.log('[CRIBBAGE BOT] Bot pegging turn:', currentTurnId);

        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

        try {
          if (shouldBotCallGo(botState, cribbageState.pegging.currentCount)) {
            const newState = callGo(cribbageState, currentTurnId);
            await supabase
              .from('rounds')
              .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
              .eq('id', roundId);
          } else {
            const cardIndex = getBotPeggingCardIndex(
              botState,
              cribbageState.pegging.currentCount,
              cribbageState.pegging.playedCards
            );

            if (cardIndex !== null) {
              const newState = playPeggingCard(cribbageState, currentTurnId, cardIndex);
              await supabase
                .from('rounds')
                .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
                .eq('id', roundId);
            }
          }
        } catch (err) {
          console.error('[CRIBBAGE BOT] Pegging error:', err);
        } finally {
          botActionInProgress.current = false;
        }
      }
    };

    const timeout = setTimeout(processBotActions, 100);
    return () => clearTimeout(timeout);
  }, [cribbageState, isProcessing, players, roundId]);

  const updateState = async (newState: CribbageState) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', roundId);

      if (error) throw error;
      setCribbageState(newState);
    } catch (err) {
      console.error('[CRIBBAGE] Error updating state:', err);
      toast.error('Failed to update game state');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCardClick = (index: number) => {
    if (!cribbageState || !currentPlayerId) return;
    
    const playerState = cribbageState.playerStates[currentPlayerId];
    if (!playerState) return;

    if (cribbageState.phase === 'discarding') {
      const expectedDiscard = players.length === 2 ? 2 : 1;
      if (selectedCards.includes(index)) {
        setSelectedCards(selectedCards.filter(i => i !== index));
      } else if (selectedCards.length < expectedDiscard) {
        setSelectedCards([...selectedCards, index]);
      }
    } else if (cribbageState.phase === 'pegging') {
      if (cribbageState.pegging.currentTurnPlayerId === currentPlayerId) {
        const card = playerState.hand[index];
        if (card && getCardPointValue(card) + cribbageState.pegging.currentCount <= 31) {
          handlePlayCard(index);
        } else {
          toast.error('Card would exceed 31');
        }
      }
    }
  };

  const handleDiscard = async () => {
    if (!cribbageState || !currentPlayerId || selectedCards.length === 0) return;
    
    const expectedDiscard = players.length === 2 ? 2 : 1;
    if (selectedCards.length !== expectedDiscard) {
      toast.error(`Select ${expectedDiscard} card(s) to discard`);
      return;
    }

    try {
      const newState = discardToCrib(cribbageState, currentPlayerId, selectedCards);
      await updateState(newState);
      setSelectedCards([]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePlayCard = async (cardIndex: number) => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const newState = playPeggingCard(cribbageState, currentPlayerId, cardIndex);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleGo = async () => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const newState = callGo(cribbageState, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!cribbageState || !currentPlayerId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-poker-gold">Loading Cribbage...</div>
      </div>
    );
  }

  const myPlayerState = cribbageState.playerStates[currentPlayerId];
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;
  const canPlayAnyCard = myPlayerState && hasPlayableCard(myPlayerState.hand, cribbageState.pegging.currentCount);
  const haveDiscarded = myPlayerState?.discardedToCrib.length > 0;

  const getPlayerUsername = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player?.profiles?.username || 'Unknown';
  };

  // Get opponent player(s) for display at top
  const opponents = players.filter(p => p.user_id !== currentUserId);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Felt Area - Upper Section */}
      <div 
        className="flex-1 relative overflow-hidden"
        style={{ 
          background: `linear-gradient(135deg, ${tableColors.color}, ${tableColors.darkColor})`,
          minHeight: '55vh',
          maxHeight: '60vh'
        }}
      >
        {/* Header - Phase & Pot */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
          <div className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg">
            <p className="text-sm font-medium text-amber-200">
              {getPhaseDisplayName(cribbageState.phase)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cribbageState.payoutMultiplier > 1 && (
              <Badge variant="destructive" className="text-xs">
                {cribbageState.payoutMultiplier === 2 ? 'SKUNK!' : 'DOUBLE SKUNK!'}
              </Badge>
            )}
            <Badge className="bg-poker-gold text-black font-bold">
              Pot: ${pot}
            </Badge>
          </div>
        </div>

        {/* Opponent Area - Top of Felt */}
        <div className="absolute top-12 left-0 right-0 flex justify-center gap-4 px-4">
          {opponents.map(opponent => {
            const oppState = cribbageState.playerStates[opponent.id];
            const isOppTurn = cribbageState.pegging.currentTurnPlayerId === opponent.id;
            
            return (
              <div 
                key={opponent.id}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-lg",
                  "bg-black/30 backdrop-blur-sm border",
                  isOppTurn ? "border-poker-gold ring-2 ring-poker-gold/50" : "border-white/10"
                )}
              >
                <span className="text-xs text-white/80 truncate max-w-[80px]">
                  {opponent.profiles?.username || 'Player'}
                </span>
                <span className="text-lg font-bold text-poker-gold">
                  {oppState?.pegScore || 0}
                </span>
                {/* Opponent's cards (face down during pegging) */}
                <div className="flex gap-0.5 mt-1">
                  {oppState?.hand.map((_, i) => (
                    <CribbagePlayingCard key={i} card={{ rank: 'A', suit: 'spades', value: 1 }} size="xs" faceDown />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Peg Board - Center of Felt */}
        <div className="absolute top-28 left-2 right-2">
          <CribbagePegBoard 
            players={players}
            playerStates={cribbageState.playerStates}
            winningScore={121}
          />
        </div>

        {/* Center Play Area - Pegging Cards & Cut Card */}
        <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 px-4">
          {/* Cut Card */}
          {cribbageState.cutCard && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-white/60 mb-0.5">Cut</span>
              <CribbagePlayingCard card={cribbageState.cutCard} size="sm" />
            </div>
          )}

          {/* Pegging Area */}
          {cribbageState.phase === 'pegging' && (
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-3 w-full max-w-sm border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/60">Count</span>
                <span className="text-2xl font-bold text-poker-gold">
                  {cribbageState.pegging.currentCount}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 justify-center min-h-[52px]">
                {cribbageState.pegging.playedCards.slice(sequenceStartIndex).map((pc, i) => (
                  <div key={i} className="relative">
                    <CribbagePlayingCard card={pc.card} size="sm" />
                    <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-white/70 whitespace-nowrap">
                      {getPlayerUsername(pc.playerId).slice(0, 5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Turn Indicator */}
          {cribbageState.phase === 'pegging' && cribbageState.pegging.currentTurnPlayerId && (
            <p className="text-sm">
              {isMyTurn ? (
                <span className="text-poker-gold font-bold animate-pulse">Your turn - tap a card!</span>
              ) : (
                <span className="text-white/70">Waiting for {getPlayerUsername(cribbageState.pegging.currentTurnPlayerId)}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Player Cards Area - Bottom Section */}
      <div className="bg-gray-900 border-t border-gray-700 p-4">
        {/* Score Display */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">Your Score</span>
          <span className="text-xl font-bold text-poker-gold">
            {myPlayerState?.pegScore || 0}
          </span>
        </div>

        {/* Player's Hand */}
        {myPlayerState && (
          <>
            <div className="flex gap-2 justify-center flex-wrap">
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
                      "transition-all duration-200",
                      isSelected && "-translate-y-4 ring-2 ring-poker-gold rounded",
                      isMyTurn && isPlayable && "hover:-translate-y-2 hover:ring-1 hover:ring-poker-gold/50",
                      cribbageState.phase === 'discarding' && "hover:-translate-y-2"
                    )}
                  >
                    <CribbagePlayingCard card={card} size="md" />
                  </button>
                );
              })}
            </div>

            {/* Action Area */}
            <div className="flex justify-center mt-4">
              {cribbageState.phase === 'discarding' && !haveDiscarded && (
                <Button
                  onClick={handleDiscard}
                  disabled={isProcessing || selectedCards.length === 0}
                  className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-6"
                >
                  Discard to Crib ({selectedCards.length}/{players.length === 2 ? 2 : 1})
                </Button>
              )}
              
              {cribbageState.phase === 'discarding' && haveDiscarded && (
                <p className="text-gray-400 text-sm">Waiting for other players to discard...</p>
              )}

              {cribbageState.phase === 'pegging' && isMyTurn && !canPlayAnyCard && (
                <p className="text-amber-400 text-sm animate-pulse">Auto-calling Go...</p>
              )}
            </div>
          </>
        )}

        {/* Crib Display (dealer only during counting) */}
        {cribbageState.phase === 'counting' && 
         currentPlayerId === cribbageState.cribOwnerPlayerId && 
         cribbageState.crib.length > 0 && (
          <div className="mt-4 p-3 bg-amber-900/30 rounded-lg border border-amber-600/30">
            <p className="text-xs text-amber-400 mb-2">Your Crib</p>
            <div className="flex gap-1 justify-center">
              {cribbageState.crib.map((card, i) => (
                <CribbagePlayingCard key={i} card={card} size="sm" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
