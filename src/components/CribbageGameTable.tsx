import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  profiles?: { username: string };
}

interface CribbageGameTableProps {
  gameId: string;
  roundId: string;
  dealerGameId: string;
  players: Player[];
  currentUserId: string;
  anteAmount: number;
  pot: number;
  onGameComplete: (winnerId: string, payoutMultiplier: number) => void;
}

export const CribbageGameTable = ({
  gameId,
  roundId,
  dealerGameId,
  players,
  currentUserId,
  anteAmount,
  pot,
  onGameComplete,
}: CribbageGameTableProps) => {
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;

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
        // Initialize new game
        const dealerPlayer = players.find(p => p.position === 1) || players[0];
        const playerIds = players.map(p => p.id);
        const newState = initializeCribbageGame(playerIds, dealerPlayer.id, anteAmount);
        
        // Save to database
        await supabase
          .from('rounds')
          .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
          .eq('id', roundId);
        
        setCribbageState(newState);
      }
    };

    loadOrInitializeState();
  }, [roundId, players, anteAmount]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`cribbage-${roundId}`)
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
            
            // Check for game completion
            if (newState.cribbage_state.phase === 'complete' && newState.cribbage_state.winnerPlayerId) {
              onGameComplete(
                newState.cribbage_state.winnerPlayerId,
                newState.cribbage_state.payoutMultiplier
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, onGameComplete]);

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
      // Toggle card selection for discarding
      const expectedDiscard = players.length === 2 ? 2 : 1;
      if (selectedCards.includes(index)) {
        setSelectedCards(selectedCards.filter(i => i !== index));
      } else if (selectedCards.length < expectedDiscard) {
        setSelectedCards([...selectedCards, index]);
      }
    } else if (cribbageState.phase === 'pegging') {
      // Play card immediately if it's our turn
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

  return (
    <div className="h-full flex flex-col bg-poker-felt p-4 gap-4">
      {/* Game Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-poker-gold">Cribbage</h2>
          <p className="text-sm text-amber-200">
            {getPhaseDisplayName(cribbageState.phase)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-poker-gold border-poker-gold">
            Pot: ${pot}
          </Badge>
          {cribbageState.payoutMultiplier > 1 && (
            <Badge variant="destructive">
              {cribbageState.payoutMultiplier === 2 ? 'SKUNK!' : 'DOUBLE SKUNK!'}
            </Badge>
          )}
        </div>
      </div>

      {/* Peg Board */}
      <CribbagePegBoard 
        players={players}
        playerStates={cribbageState.playerStates}
        winningScore={121}
      />

      {/* Center Area - Cut Card & Pegging */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        {/* Cut Card */}
        {cribbageState.cutCard && (
          <div className="text-center">
            <p className="text-xs text-amber-200 mb-1">Cut Card</p>
            <CribbagePlayingCard card={cribbageState.cutCard} size="md" />
          </div>
        )}

        {/* Pegging Area */}
        {cribbageState.phase === 'pegging' && (
          <div className="bg-black/20 rounded-lg p-4 min-w-[300px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-amber-200 text-sm">Count:</span>
              <span className="text-2xl font-bold text-poker-gold">
                {cribbageState.pegging.currentCount}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 justify-center">
              {cribbageState.pegging.playedCards.slice(-8).map((pc, i) => (
                <div key={i} className="relative">
                  <CribbagePlayingCard card={pc.card} size="sm" />
                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-amber-200 truncate max-w-[40px]">
                    {getPlayerUsername(pc.playerId).slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Turn Indicator */}
        {cribbageState.phase === 'pegging' && cribbageState.pegging.currentTurnPlayerId && (
          <p className="text-amber-200">
            {isMyTurn ? (
              <span className="text-poker-gold font-bold">Your turn!</span>
            ) : (
              <>Waiting for {getPlayerUsername(cribbageState.pegging.currentTurnPlayerId)}</>
            )}
          </p>
        )}
      </div>

      {/* Player's Hand */}
      {myPlayerState && (
        <Card className="bg-poker-felt-dark border-poker-gold/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-amber-200">Your Hand</span>
              <span className="text-sm text-poker-gold font-bold">
                Score: {myPlayerState.pegScore}
              </span>
            </div>
            
            <div className="flex gap-2 justify-center flex-wrap">
              {myPlayerState.hand.map((card, index) => (
                <button
                  key={index}
                  onClick={() => handleCardClick(index)}
                  disabled={isProcessing}
                  className={`transition-transform ${
                    selectedCards.includes(index) ? '-translate-y-4' : ''
                  } ${isMyTurn && cribbageState.phase === 'pegging' ? 'hover:-translate-y-2' : ''}`}
                >
                  <CribbagePlayingCard card={card} size="md" />
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center gap-2 mt-4">
              {cribbageState.phase === 'discarding' && !haveDiscarded && (
                <Button
                  onClick={handleDiscard}
                  disabled={isProcessing || selectedCards.length === 0}
                  className="bg-poker-gold text-poker-felt-dark hover:bg-poker-gold/80"
                >
                  Discard to Crib ({selectedCards.length}/{players.length === 2 ? 2 : 1})
                </Button>
              )}
              
              {cribbageState.phase === 'discarding' && haveDiscarded && (
                <p className="text-amber-200">Waiting for other players...</p>
              )}

              {cribbageState.phase === 'pegging' && isMyTurn && !canPlayAnyCard && (
                <Button
                  onClick={handleGo}
                  disabled={isProcessing}
                  variant="outline"
                  className="border-poker-gold text-poker-gold"
                >
                  Go!
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Crib (visible to dealer during counting) */}
      {cribbageState.phase === 'counting' && 
       currentPlayerId === cribbageState.cribOwnerPlayerId && 
       cribbageState.crib.length > 0 && (
        <Card className="bg-poker-felt-dark border-amber-600/50">
          <CardContent className="p-3">
            <p className="text-xs text-amber-400 mb-2">Your Crib</p>
            <div className="flex gap-1 justify-center">
              {cribbageState.crib.map((card, i) => (
                <CribbagePlayingCard key={i} card={card} size="sm" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
