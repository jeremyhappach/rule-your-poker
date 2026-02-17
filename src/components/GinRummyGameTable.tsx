// Gin Rummy Game Table - Desktop & Mobile
// Modeled after CribbageGameTable with stock/discard pile UI

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import {
  drawFromStock,
  drawFromDiscard,
  discardCard,
  declareKnock,
  takeFirstDrawCard,
  passFirstDraw,
  layOffCard,
  finishLayingOff,
  scoreHand,
  getDiscardTop,
  stockRemaining,
  isStockExhausted,
} from '@/lib/ginRummyGameLogic';
import {
  findOptimalMelds,
  canKnock,
  hasGin,
  findLayOffOptions,
  describeMelds,
  describeKnockResult,
} from '@/lib/ginRummyScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface GinRummyGameTableProps {
  gameId: string;
  roundId: string;
  dealerGameId: string | null;
  handNumber: number;
  players: Player[];
  currentUserId: string;
  dealerPosition: number;
  anteAmount: number;
  pot: number;
  isHost: boolean;
  onGameComplete: () => void;
}

export const GinRummyGameTable = ({
  gameId,
  roundId,
  dealerGameId,
  handNumber,
  players,
  currentUserId,
  dealerPosition,
  anteAmount,
  pot,
  isHost,
  onGameComplete,
}: GinRummyGameTableProps) => {
  const [ginState, setGinState] = useState<GinRummyState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;

  // Load state from DB
  useEffect(() => {
    if (!roundId) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('gin_rummy_state')
        .eq('id', roundId)
        .single();

      if (!error && data?.gin_rummy_state) {
        setGinState(data.gin_rummy_state as unknown as GinRummyState);
      }
    };
    load();
  }, [roundId]);

  // Realtime subscription
  useEffect(() => {
    if (!roundId) return;
    let isActive = true;

    const channel = supabase
      .channel(`gin-rummy-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        (payload) => {
          const newData = payload.new as { gin_rummy_state?: GinRummyState };
          if (newData.gin_rummy_state && isActive) {
            setGinState(newData.gin_rummy_state);
            if (newData.gin_rummy_state.phase === 'complete' && newData.gin_rummy_state.winnerPlayerId) {
              onGameComplete();
            }
          }
        }
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [roundId, onGameComplete]);

  const updateState = async (newState: GinRummyState) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('rounds')
        .update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', roundId);
      if (error) throw error;
      setGinState(newState);
    } catch (err) {
      console.error('[GIN-RUMMY] Error updating state:', err);
      toast.error('Failed to update game state');
    } finally {
      setIsProcessing(false);
    }
  };

  // Action handlers
  const handleDrawStock = async () => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      const newState = drawFromStock(ginState, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDrawDiscard = async () => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      const newState = drawFromDiscard(ginState, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDiscard = async (index: number) => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[index];
    if (!card) return;
    try {
      const newState = discardCard(ginState, currentPlayerId, card);
      setSelectedCardIndex(null);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleKnock = async () => {
    if (!ginState || !currentPlayerId || isProcessing || selectedCardIndex === null) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[selectedCardIndex];
    if (!card) return;
    try {
      let newState = declareKnock(ginState, currentPlayerId, card);
      // If gin, auto-score
      if (newState.phase === 'scoring') {
        newState = scoreHand(newState);
      }
      setSelectedCardIndex(null);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleTakeFirstDraw = async () => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      const newState = takeFirstDrawCard(ginState, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePassFirstDraw = async () => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      const newState = passFirstDraw(ginState, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleFinishLayingOff = async () => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    try {
      let newState = finishLayingOff(ginState, currentPlayerId);
      if (newState.phase === 'scoring') {
        newState = scoreHand(newState);
      }
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCardClick = (index: number) => {
    if (!ginState || !currentPlayerId) return;
    const myState = ginState.playerStates[currentPlayerId];
    if (!myState) return;

    if (ginState.turnPhase === 'discard' && ginState.currentTurnPlayerId === currentPlayerId) {
      // Toggle selection for discard/knock
      setSelectedCardIndex(selectedCardIndex === index ? null : index);
    }
  };

  // Helpers
  const getPlayerUsername = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player?.profiles?.username || 'Unknown';
  };

  const getPhaseText = () => {
    if (!ginState) return '';
    switch (ginState.phase) {
      case 'first_draw': return 'First Draw';
      case 'playing': return ginState.turnPhase === 'draw' ? 'Draw Phase' : 'Discard Phase';
      case 'knocking': return 'Knocking';
      case 'laying_off': return 'Laying Off';
      case 'scoring': return 'Scoring';
      case 'complete': return 'Hand Complete';
      default: return 'Dealing...';
    }
  };

  if (!ginState || !currentPlayerId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-poker-gold">Loading Gin Rummy...</div>
      </div>
    );
  }

  const myState = ginState.playerStates[currentPlayerId];
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const opponentId = currentPlayerId === ginState.dealerPlayerId
    ? ginState.nonDealerPlayerId
    : ginState.dealerPlayerId;
  const discardTopCard = getDiscardTop(ginState);
  const stockCount = stockRemaining(ginState);

  // Check if we can knock/gin after drawing (during discard phase)
  const canKnockNow = isMyTurn && ginState.turnPhase === 'discard' && myState && canKnock(myState.hand);
  const hasGinNow = isMyTurn && ginState.turnPhase === 'discard' && myState && hasGin(myState.hand);

  // Convert GinRummyCard to CribbageCard format for reuse of PlayingCard component
  const toDisplayCard = (card: GinRummyCard) => ({
    suit: card.suit as any,
    rank: card.rank,
    value: card.value,
  });

  return (
    <div className="h-full flex flex-col bg-poker-felt p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-poker-gold">Gin Rummy</h2>
          <p className="text-sm text-amber-200/80">{getPhaseText()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-poker-gold border-poker-gold">
            Match: {ginState.matchScores[currentPlayerId] || 0} - {ginState.matchScores[opponentId] || 0}
          </Badge>
          <Badge variant="outline" className="text-amber-200 border-amber-200/50">
            To {ginState.pointsToWin}
          </Badge>
        </div>
      </div>

      {/* Opponent Info */}
      <div className="bg-black/20 rounded-lg p-2 flex items-center justify-between">
        <span className="text-amber-200 text-sm font-medium">
          {getPlayerUsername(opponentId)}
          {opponentId === ginState.dealerPlayerId && ' (Dealer)'}
        </span>
        <span className="text-amber-200/60 text-xs">
          {ginState.playerStates[opponentId]?.hand.length ?? 0} cards
        </span>
      </div>

      {/* Center Area - Stock & Discard Piles */}
      <div className="flex-1 flex items-center justify-center gap-6">
        {/* Stock Pile */}
        <button
          onClick={handleDrawStock}
          disabled={isProcessing || !isMyTurn || ginState.turnPhase !== 'draw' || ginState.phase === 'first_draw'}
          className={`flex flex-col items-center gap-1 ${
            isMyTurn && ginState.turnPhase === 'draw' && ginState.phase !== 'first_draw'
              ? 'opacity-100 cursor-pointer'
              : 'opacity-50 cursor-not-allowed'
          }`}
        >
          <div className="w-16 h-24 bg-gradient-to-br from-blue-800 to-blue-950 rounded-lg border-2 border-blue-500/50 flex items-center justify-center shadow-lg">
            <span className="text-blue-200 text-xs font-bold">{stockCount}</span>
          </div>
          <span className="text-amber-200/60 text-[10px]">Stock</span>
        </button>

        {/* Discard Pile */}
        <button
          onClick={ginState.phase === 'first_draw' ? handleTakeFirstDraw : handleDrawDiscard}
          disabled={
            isProcessing ||
            !isMyTurn ||
            (!discardTopCard) ||
            (ginState.phase !== 'first_draw' && ginState.turnPhase !== 'draw')
          }
          className={`flex flex-col items-center gap-1 ${
            isMyTurn && (ginState.phase === 'first_draw' || ginState.turnPhase === 'draw') && discardTopCard
              ? 'opacity-100 cursor-pointer hover:scale-105 transition-transform'
              : 'opacity-50 cursor-not-allowed'
          }`}
        >
          {discardTopCard ? (
            <CribbagePlayingCard card={toDisplayCard(discardTopCard)} size="sm" />
          ) : (
            <div className="w-16 h-24 bg-poker-felt-dark rounded-lg border-2 border-dashed border-amber-600/30 flex items-center justify-center">
              <span className="text-amber-200/30 text-[10px]">Empty</span>
            </div>
          )}
          <span className="text-amber-200/60 text-[10px]">Discard</span>
        </button>
      </div>

      {/* First Draw Phase */}
      {ginState.phase === 'first_draw' && isMyTurn && (
        <div className="flex justify-center gap-3">
          <Button
            onClick={handlePassFirstDraw}
            disabled={isProcessing}
            variant="outline"
            className="border-amber-600 text-amber-200"
          >
            Pass
          </Button>
          <span className="text-amber-200/60 text-sm self-center">or tap the discard to take it</span>
        </div>
      )}

      {/* Turn Indicator */}
      {ginState.phase === 'playing' && (
        <p className="text-center text-sm text-amber-200">
          {isMyTurn ? (
            <span className="text-poker-gold font-bold">
              {ginState.turnPhase === 'draw' ? 'Draw a card!' : 'Select a card to discard'}
            </span>
          ) : (
            <>Waiting for {getPlayerUsername(ginState.currentTurnPlayerId)}</>
          )}
        </p>
      )}

      {/* Knock Result Display */}
      {ginState.phase === 'complete' && ginState.knockResult && (
        <Card className="bg-poker-felt-dark border-poker-gold">
          <CardContent className="p-4 text-center">
            <p className="text-poker-gold text-lg font-bold mb-1">
              {describeKnockResult(ginState.knockResult)}
            </p>
            <p className="text-amber-200 text-sm">
              {getPlayerUsername(ginState.knockResult.winnerId)} wins this hand
            </p>
          </CardContent>
        </Card>
      )}

      {/* Void hand */}
      {ginState.phase === 'complete' && !ginState.knockResult && (
        <Card className="bg-poker-felt-dark border-amber-600/50">
          <CardContent className="p-4 text-center">
            <p className="text-amber-200 text-lg font-bold">Void Hand</p>
            <p className="text-amber-200/60 text-sm">Stock exhausted — no points awarded</p>
          </CardContent>
        </Card>
      )}

      {/* Knocking Phase - Show knocker's melds */}
      {(ginState.phase === 'knocking' || ginState.phase === 'laying_off') && (
        <Card className="bg-poker-felt-dark border-poker-gold/50">
          <CardContent className="p-3">
            <p className="text-xs text-poker-gold mb-2 font-bold">
              {getPlayerUsername(ginState.playerStates[ginState.dealerPlayerId]?.hasKnocked
                ? ginState.dealerPlayerId
                : ginState.nonDealerPlayerId)} knocked!
            </p>
            {/* Show knocker's melds */}
            {Object.entries(ginState.playerStates).map(([pid, ps]) => {
              if (!ps.hasKnocked && !ps.hasGin) return null;
              return (
                <div key={pid} className="mb-2">
                  <p className="text-amber-200/60 text-[10px] mb-1">
                    {getPlayerUsername(pid)}'s melds:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ps.melds.map((meld, mi) => (
                      <div key={mi} className="flex gap-0.5 bg-black/20 rounded p-1">
                        {meld.cards.map((c, ci) => (
                          <CribbagePlayingCard key={ci} card={toDisplayCard(c)} size="xs" />
                        ))}
                      </div>
                    ))}
                  </div>
                  {ps.deadwood.length > 0 && (
                    <div className="mt-1">
                      <p className="text-amber-200/40 text-[10px]">Deadwood ({ps.deadwoodValue}):</p>
                      <div className="flex gap-0.5">
                        {ps.deadwood.map((c, ci) => (
                          <CribbagePlayingCard key={ci} card={toDisplayCard(c)} size="xs" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Lay off button for non-knocker */}
            {currentPlayerId !== ginState.dealerPlayerId && !ginState.playerStates[currentPlayerId]?.hasKnocked && (
              <Button
                onClick={handleFinishLayingOff}
                disabled={isProcessing}
                className="mt-2 bg-poker-gold text-poker-felt-dark hover:bg-poker-gold/80"
                size="sm"
              >
                Done Laying Off
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Player's Hand */}
      {myState && (
        <Card className="bg-poker-felt-dark border-poker-gold/30">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-amber-200">
                Your Hand
                {currentPlayerId === ginState.dealerPlayerId && ' (Dealer)'}
              </span>
              <span className="text-xs text-amber-200/60">
                {myState.hand.length} cards
              </span>
            </div>

            <div className="flex gap-0.5 justify-center flex-wrap">
              {myState.hand.map((card, index) => (
                <button
                  key={`${card.rank}-${card.suit}-${index}`}
                  onClick={() => handleCardClick(index)}
                  disabled={isProcessing || ginState.turnPhase !== 'discard' || !isMyTurn}
                  className={`transition-transform ${
                    selectedCardIndex === index ? '-translate-y-3 ring-2 ring-poker-gold rounded' : ''
                  } ${
                    isMyTurn && ginState.turnPhase === 'discard' ? 'hover:-translate-y-2' : ''
                  }`}
                >
                  <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            {isMyTurn && ginState.turnPhase === 'discard' && selectedCardIndex !== null && (
              <div className="flex justify-center gap-2 mt-3">
                <Button
                  onClick={() => handleDiscard(selectedCardIndex)}
                  disabled={isProcessing}
                  className="bg-amber-700 hover:bg-amber-600 text-white"
                  size="sm"
                >
                  Discard
                </Button>
                {canKnockNow && !hasGinNow && (
                  <Button
                    onClick={handleKnock}
                    disabled={isProcessing}
                    className="bg-poker-gold text-poker-felt-dark hover:bg-poker-gold/80"
                    size="sm"
                  >
                    Knock!
                  </Button>
                )}
                {hasGinNow && (
                  <Button
                    onClick={handleKnock}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold"
                    size="sm"
                  >
                    GIN! 🎉
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
