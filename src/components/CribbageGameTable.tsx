import { useState, useEffect, useRef, useMemo } from 'react';
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
import { getBotDiscardIndices, getBotPeggingCardIndex, shouldBotCallGo } from '@/lib/cribbageBotLogic';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { 
  useCribbageEventContext, 
  logPeggingPlay, 
  logGoPointEvent,
  logHisHeelsEvent,
  logCutCardEvent,
  logCountingScoringEvents
} from '@/lib/useCribbageEventLogging';
import { getHandScoringCombos } from '@/lib/cribbageScoringDetails';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface CribbageGameTableProps {
  gameId: string;
  roundId: string;
  dealerGameId: string | null; // Required for event logging
  handNumber: number; // Required for event logging (from round data)
  players: Player[];
  currentUserId: string;
  dealerPosition: number;
  anteAmount: number;
  pot: number;
  isHost: boolean;
  onGameComplete: () => void;
}

/**
 * Generate a unique hand key from cribbage state to detect hand transitions.
 */
function getHandKey(state: CribbageState | null): string {
  if (!state) return '';
  const firstPlayerId = state.turnOrder[0];
  const firstPlayerHand = state.playerStates[firstPlayerId]?.hand || [];
  const discarded = state.playerStates[firstPlayerId]?.discardedToCrib || [];
  const handSig = [...firstPlayerHand, ...discarded]
    .map(c => `${c.rank}${c.suit}`)
    .sort()
    .join(',');
  return `${state.dealerPlayerId}-${handSig}`;
}

export const CribbageGameTable = ({
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
}: CribbageGameTableProps) => {
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Track hand key to detect hand transitions and prevent stale card flash
  const currentHandKey = useMemo(() => getHandKey(cribbageState), [cribbageState]);
  const lastHandKeyRef = useRef<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Event logging context - synchronously derived from props (no async fetch!)
  const eventCtx = useCribbageEventContext(roundId, dealerGameId, handNumber);
  
  // Track if we've logged the cut card for this hand
  const cutCardLoggedRef = useRef<string | null>(null);
  
  // Ref to track latest handleGo callback for use in auto-go effect
  // This avoids stale closure issues where eventCtx might be null
  const handleGoRef = useRef<(() => void) | null>(null);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  
  // Derive sequenceStartIndex from state - this is authoritative and survives missed realtime updates
  const sequenceStartIndex = cribbageState?.pegging?.sequenceStartIndex ?? 0;

  // Log cut card event when first revealed (atomic guard prevents duplicates)
  useEffect(() => {
    if (!cribbageState?.cutCard || !eventCtx) return;
    const cutCardKey = `${cribbageState.cutCard.rank}-${cribbageState.cutCard.suit}`;
    if (cutCardLoggedRef.current === cutCardKey) return;
    cutCardLoggedRef.current = cutCardKey;
    logCutCardEvent(eventCtx, cribbageState);
  }, [cribbageState?.cutCard, eventCtx]);

  // Log counting phase events (fire-and-forget, atomic DB guard prevents duplicates)
  const countingLoggedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cribbageState || !eventCtx) return;
    const phase = cribbageState.phase;
    if (phase !== 'counting' && phase !== 'complete') {
      countingLoggedKeyRef.current = null;
      return;
    }
    if (!cribbageState.cutCard) return;

    const key = `${roundId}:${cribbageState.dealerPlayerId}:${cribbageState.pegging.playedCards.length}:${cribbageState.cutCard.rank}${cribbageState.cutCard.suit}`;
    if (countingLoggedKeyRef.current === key) return;
    countingLoggedKeyRef.current = key;

    // Build safe baseline scores (pre-counting) for event logging
    const currentScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      currentScores[playerId] = ps.pegScore ?? 0;
    }

    const dealerId = cribbageState.dealerPlayerId;
    const perPlayerHandTotals: Record<string, number> = {};
    for (const playerId of Object.keys(cribbageState.playerStates)) {
      const hand = cribbageState.pegging.playedCards
        .filter((pc) => pc.playerId === playerId)
        .map((pc) => pc.card);
      const combos = getHandScoringCombos(hand, cribbageState.cutCard, false);
      perPlayerHandTotals[playerId] = combos.reduce((sum, c) => sum + c.points, 0);
    }

    const cribCombos = getHandScoringCombos(cribbageState.crib, cribbageState.cutCard, true);
    const cribTotal = cribCombos.reduce((sum, c) => sum + c.points, 0);

    const runningScores: Record<string, number> = {};
    for (const playerId of Object.keys(cribbageState.playerStates)) {
      const handTotal = perPlayerHandTotals[playerId] ?? 0;
      const cribPts = playerId === dealerId ? cribTotal : 0;
      const subtractTotal = handTotal + cribPts;
      const current = currentScores[playerId] ?? 0;
      const baseline = current >= subtractTotal ? current - subtractTotal : current;
      runningScores[playerId] = Math.max(0, baseline);
    }

    logCountingScoringEvents(eventCtx, cribbageState, players, runningScores);
  }, [cribbageState?.phase, eventCtx, players]);

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
        // Initialize new game - use dealerPosition prop
        const dealerPlayer = players.find(p => p.position === dealerPosition) || players[0];
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
  }, [roundId, players, anteAmount, dealerPosition]);

  // Realtime subscription with polling fallback
  useEffect(() => {
    if (!roundId) return;

    let pollInterval = 2000;
    let pollTimeoutId: ReturnType<typeof setTimeout>;
    let lastSyncTimestamp: string | null = null;
    let isActive = true;

    const handleStateUpdate = (newCribbageState: CribbageState, fromRealtime: boolean) => {
      if (!isActive) return;
      setCribbageState(newCribbageState);
      if (fromRealtime) pollInterval = 2000;
      if (newCribbageState.phase === 'complete' && newCribbageState.winnerPlayerId) {
        onGameComplete();
      }
    };

    // Use a simple state signature since rounds doesn't have updated_at
    const getStateSignature = (state: CribbageState): string => {
      return `${state.phase}-${state.pegging.playedCards.length}-${state.pegging.currentCount}-${state.pegging.currentTurnPlayerId}`;
    };

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
            lastSyncTimestamp = getStateSignature(newState.cribbage_state);
            handleStateUpdate(newState.cribbage_state, true);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[CRIBBAGE_REALTIME] Channel error:', err);
        }
      });

    const poll = async () => {
      if (!isActive) return;
      try {
        const { data, error } = await supabase
          .from('rounds')
          .select('cribbage_state')
          .eq('id', roundId)
          .single();

        if (!error && data?.cribbage_state) {
          const newState = data.cribbage_state as unknown as CribbageState;
          const newSignature = getStateSignature(newState);
          const hasNewData = !lastSyncTimestamp || newSignature !== lastSyncTimestamp;
          if (hasNewData) {
            lastSyncTimestamp = newSignature;
            handleStateUpdate(newState, false);
            pollInterval = 2000;
          } else {
            pollInterval = Math.min(pollInterval * 1.3, 10000);
          }
        } else {
          pollInterval = Math.min(pollInterval * 1.5, 15000);
        }
      } catch (err) {
        pollInterval = Math.min(pollInterval * 1.5, 15000);
      }
      if (isActive) pollTimeoutId = setTimeout(poll, pollInterval);
    };

    pollTimeoutId = setTimeout(poll, pollInterval);

    return () => {
      isActive = false;
      clearTimeout(pollTimeoutId);
      supabase.removeChannel(channel);
    };
  }, [roundId, onGameComplete]);

  // Detect hand transitions to prevent stale card flash
  useEffect(() => {
    if (!currentHandKey) return;
    
    // If hand key changed, we're transitioning to a new hand
    if (lastHandKeyRef.current && lastHandKeyRef.current !== currentHandKey) {
      setIsTransitioning(true);
      // Brief delay to allow the new state to fully settle
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 100);
      return () => clearTimeout(timer);
    }
    
    lastHandKeyRef.current = currentHandKey;
  }, [currentHandKey]);

  // sequenceStartIndex is now derived directly from cribbageState.pegging.sequenceStartIndex
  // No local tracking needed - the state is authoritative

  // Auto-go: When it's our turn and we can't play, automatically call go
  // Uses ref to avoid stale closure issues - ensures eventCtx is always current
  useEffect(() => {
    if (!cribbageState || !currentPlayerId || isProcessing) return;
    if (cribbageState.phase !== 'pegging') return;
    if (cribbageState.pegging.currentTurnPlayerId !== currentPlayerId) return;
    
    const myState = cribbageState.playerStates[currentPlayerId];
    if (!myState) return;
    
    // Check if we have no playable cards
    const canPlay = hasPlayableCard(myState.hand, cribbageState.pegging.currentCount);
    if (!canPlay && myState.hand.length > 0) {
      // Auto-call go after a brief delay so the player sees what happened
      const timeout = setTimeout(() => {
        handleGoRef.current?.();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [cribbageState?.pegging.currentTurnPlayerId, cribbageState?.pegging.currentCount, currentPlayerId, isProcessing]);
  const botActionInProgress = useRef(false);

  // Bot decision logic
  useEffect(() => {
    if (!cribbageState || isProcessing || botActionInProgress.current) return;
    if (cribbageState.phase === 'complete') return;

    const processBotActions = async () => {
      // Check if any bot needs to act
      if (cribbageState.phase === 'discarding') {
        // Find bots that haven't discarded yet
        const expectedDiscard = players.length === 2 ? 2 : 1;
        for (const player of players) {
          if (!player.is_bot) continue;
          
          const botState = cribbageState.playerStates[player.id];
          if (!botState || botState.discardedToCrib.length > 0) continue;
          
          // Bot needs to discard
          botActionInProgress.current = true;
          console.log('[CRIBBAGE BOT] Bot discarding:', player.id);
          
          const isDealer = player.id === cribbageState.dealerPlayerId;
          const discardIndices = getBotDiscardIndices(
            botState.hand,
            players.length,
            isDealer
          );
          
          // Add small delay to make it feel natural
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
          return; // Process one bot at a time
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

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

        try {
          if (shouldBotCallGo(botState, cribbageState.pegging.currentCount)) {
            // Must call go
            const newState = callGo(cribbageState, currentTurnId);
            // Fire-and-forget event logging (atomic DB guard prevents duplicates)
            logGoPointEvent(eventCtx, cribbageState, newState);
            
            await supabase
              .from('rounds')
              .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
              .eq('id', roundId);
          } else {
            // Play a card
            const cardIndex = getBotPeggingCardIndex(
              botState,
              cribbageState.pegging.currentCount,
              cribbageState.pegging.playedCards
            );

            if (cardIndex !== null) {
              const cardPlayed = botState.hand[cardIndex];
              const newState = playPeggingCard(cribbageState, currentTurnId, cardIndex);
              // Fire-and-forget event logging (atomic DB guard prevents duplicates)
              logPeggingPlay(eventCtx, cribbageState, newState, currentTurnId, cardPlayed);
              // Check for his_heels on phase transition
              if (newState.lastEvent?.type === 'his_heels') {
                logHisHeelsEvent(eventCtx, newState);
              }
              
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

    // Small timeout to let state settle
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
    if (!cribbageState || !currentPlayerId || !roundId) return;

    try {
      // CRITICAL: Fetch the latest state from DB to prevent stale state issues
      // This guards against race conditions where bot's move hasn't propagated yet
      const { data: freshRound, error: fetchError } = await supabase
        .from('rounds')
        .select('cribbage_state')
        .eq('id', roundId)
        .single();
      
      if (fetchError || !freshRound?.cribbage_state) {
        console.error('[CRIBBAGE] Failed to fetch fresh state before play:', fetchError);
        toast.error('Failed to sync game state. Try again.');
        return;
      }
      
      const freshState = freshRound.cribbage_state as unknown as CribbageState;
      
      // Verify it's still our turn with fresh state
      if (freshState.pegging.currentTurnPlayerId !== currentPlayerId) {
        console.warn('[CRIBBAGE] Stale state detected - not our turn in fresh state');
        setCribbageState(freshState);
        toast.error('Wait for your turn');
        return;
      }
      
      // Verify the card is still playable with fresh state
      const freshPlayerState = freshState.playerStates[currentPlayerId];
      if (!freshPlayerState || cardIndex >= freshPlayerState.hand.length) {
        console.warn('[CRIBBAGE] Card index invalid in fresh state');
        setCribbageState(freshState);
        toast.error('Card no longer available');
        return;
      }
      
      const cardPlayed = freshPlayerState.hand[cardIndex];
      const newState = playPeggingCard(freshState, currentPlayerId, cardIndex);
      // Fire-and-forget event logging (atomic DB guard prevents duplicates)
      if (cardPlayed) {
        logPeggingPlay(eventCtx, freshState, newState, currentPlayerId, cardPlayed);
      }
      // Check for his_heels on phase transition
      if (newState.lastEvent?.type === 'his_heels') {
        logHisHeelsEvent(eventCtx, newState);
      }
      
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleGo = async () => {
    if (!cribbageState || !currentPlayerId || !roundId) return;

    try {
      // CRITICAL: Fetch fresh state from DB to prevent stale subscription state issues.
      // Same pattern as handlePlayCard - prevents missed Go points.
      const { data: freshRound, error: fetchError } = await supabase
        .from('rounds')
        .select('cribbage_state')
        .eq('id', roundId)
        .single();
      
      let stateForGo = cribbageState;
      if (!fetchError && freshRound?.cribbage_state) {
        const freshState = freshRound.cribbage_state as unknown as CribbageState;
        
        if (freshState.pegging.currentTurnPlayerId !== currentPlayerId) {
          console.warn('[CRIBBAGE] Stale state detected for Go - not our turn in fresh state');
          setCribbageState(freshState);
          return;
        }
        
        const freshPlayerState = freshState.playerStates[currentPlayerId];
        if (freshPlayerState && hasPlayableCard(freshPlayerState.hand, freshState.pegging.currentCount)) {
          console.warn('[CRIBBAGE] Fresh state shows playable card - skipping Go');
          setCribbageState(freshState);
          return;
        }
        
        stateForGo = freshState;
      }
      
      const newState = callGo(stateForGo, currentPlayerId);
      logGoPointEvent(eventCtx, stateForGo, newState);
      
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Keep handleGoRef updated to the latest callback
  useEffect(() => {
    handleGoRef.current = handleGo;
  });

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
        winningScore={cribbageState.pointsToWin}
      />

      {/* Center Area - Cut Card & Pegging */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {/* Cut Card */}
        {cribbageState.cutCard && (
          <div className="text-center">
            <p className="text-[10px] text-amber-200 mb-0.5">Cut Card</p>
            <CribbagePlayingCard card={cribbageState.cutCard} size="sm" />
          </div>
        )}

        {/* Pegging Area */}
        {cribbageState.phase === 'pegging' && (
          <div className="bg-black/20 rounded-lg p-3 w-full max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-amber-200 text-xs">Count:</span>
              <span className="text-xl font-bold text-poker-gold">
                {cribbageState.pegging.currentCount}
              </span>
            </div>
            <div className="flex flex-wrap gap-0.5 justify-center min-h-[48px]">
              {/* Only show cards from current sequence (after last count reset) */}
              {cribbageState.pegging.playedCards.slice(sequenceStartIndex).map((pc, i) => (
                <div key={i} className="relative">
                  <CribbagePlayingCard card={pc.card} size="xs" />
                  <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] text-amber-200 truncate max-w-[28px]">
                    {getPlayerUsername(pc.playerId).slice(0, 4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Turn Indicator */}
        {cribbageState.phase === 'pegging' && cribbageState.pegging.currentTurnPlayerId && (
          <p className="text-amber-200 text-sm">
            {isMyTurn ? (
              <span className="text-poker-gold font-bold">Your turn!</span>
            ) : (
              <>Waiting for {getPlayerUsername(cribbageState.pegging.currentTurnPlayerId)}</>
            )}
          </p>
        )}
      </div>

      {/* Player's Hand - hide during transitions to prevent stale card flash */}
      {myPlayerState && !isTransitioning && (
        <Card key={currentHandKey} className="bg-poker-felt-dark border-poker-gold/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-amber-200">Your Hand</span>
              <span className="text-sm text-poker-gold font-bold">
                Score: {myPlayerState.pegScore}
              </span>
            </div>
            
            <div className="flex gap-1 justify-center flex-wrap">
              {myPlayerState.hand.map((card, index) => (
                <button
                  key={`${card.rank}-${card.suit}-${index}`}
                  onClick={() => handleCardClick(index)}
                  disabled={isProcessing}
                  className={`transition-transform ${
                    selectedCards.includes(index) ? '-translate-y-3' : ''
                  } ${isMyTurn && cribbageState.phase === 'pegging' ? 'hover:-translate-y-2' : ''}`}
                >
                  <CribbagePlayingCard card={card} size="sm" />
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
                <p className="text-amber-200 text-sm animate-pulse">Auto-calling Go...</p>
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
            <div className="flex gap-0.5 justify-center">
              {cribbageState.crib.map((card, i) => (
                <CribbagePlayingCard key={i} card={card} size="xs" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
