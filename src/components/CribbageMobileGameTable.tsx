import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CribbageState } from '@/lib/cribbageTypes';
import { 
  initializeCribbageGame, 
  discardToCrib, 
  playPeggingCard, 
  callGo,
  startNewHand,
} from '@/lib/cribbageGameLogic';
import { hasPlayableCard } from '@/lib/cribbageScoring';
import { getBotDiscardIndices, getBotPeggingCardIndex, shouldBotCallGo } from '@/lib/cribbageBotLogic';
import { CribbageFeltContent } from './CribbageFeltContent';
import { CribbageMobileCardsTab } from './CribbageMobileCardsTab';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageCountingPhase } from './CribbageCountingPhase';
import { CribbageTurnSpotlight } from './CribbageTurnSpotlight';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { cn, formatChipValue } from '@/lib/utils';
import { getDisplayName } from '@/lib/botAlias';
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";
import { MessageSquare, User, Clock } from 'lucide-react';
import { 
  useCribbageEventContext, 
  logPeggingPlay, 
  logGoPointEvent,
  logHisHeelsEvent,
  logCountingScoringEvents 
} from '@/lib/useCribbageEventLogging';

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

// Custom Spade icon for tab
const SpadeIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="0"
  >
    <path d="M12 2C12 2 4 9 4 13.5C4 16.5 6.5 18.5 9 18.5C10.2 18.5 11.2 18 12 17.2C12.8 18 13.8 18.5 15 18.5C17.5 18.5 20 16.5 20 13.5C20 9 12 2 12 2Z" />
    <path d="M12 17.5L12 22" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M9 22L15 22" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

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
  const { getTableColors, getCardBackColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');

  // Counting phase announcement state (propagated from CribbageCountingPhase)
  const [countingAnnouncement, setCountingAnnouncement] = useState<string | null>(null);
  const [countingTargetLabel, setCountingTargetLabel] = useState<string | null>(null);

  // Event logging context (fire-and-forget)
  const eventCtx = useCribbageEventContext(roundId);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  
  const [sequenceStartIndex, setSequenceStartIndex] = useState(0);
  const lastCountRef = useRef<number>(0);

  // Callback for counting phase announcements
  const handleCountingAnnouncementChange = useCallback((announcement: string | null, targetLabel: string | null) => {
    setCountingAnnouncement(announcement);
    setCountingTargetLabel(targetLabel);
  }, []);

  // Initialize game state
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

  // Realtime subscription
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

  // Track pegging sequence resets
  useEffect(() => {
    if (!cribbageState || cribbageState.phase !== 'pegging') return;
    
    const currentCount = cribbageState.pegging.currentCount;
    if (currentCount === 0 && lastCountRef.current > 0) {
      setSequenceStartIndex(cribbageState.pegging.playedCards.length);
    }
    lastCountRef.current = currentCount;
  }, [cribbageState?.pegging.currentCount, cribbageState?.pegging.playedCards.length, cribbageState?.phase]);

  // Log counting phase events (fire-and-forget) when transitioning to counting
  const countingLoggedRef = useRef(false);
  useEffect(() => {
    if (!cribbageState || !eventCtx) return;
    if (cribbageState.phase !== 'counting') {
      countingLoggedRef.current = false;
      return;
    }
    if (countingLoggedRef.current) return;
    countingLoggedRef.current = true;

    // Build initial scores (before counting was applied)
    // We need to reconstruct pre-counting scores from the state
    const runningScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      // Get pre-counting score by looking at the pegging scores only
      // (the state already has post-counting scores, so we track as we log)
      runningScores[playerId] = 0; // Start from 0 for logging deltas; actual score tracked in state
    }

    // Log all hand and crib scoring events
    logCountingScoringEvents(eventCtx, cribbageState, players, runningScores);
  }, [cribbageState?.phase, eventCtx, players]);

  // Auto-go
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

  // Bot logic
  const botActionInProgress = useRef(false);

  useEffect(() => {
    if (!cribbageState || isProcessing || botActionInProgress.current) return;
    if (cribbageState.phase === 'complete') return;

    const processBotActions = async () => {
      if (cribbageState.phase === 'discarding') {
        for (const player of players) {
          if (!player.is_bot) continue;
          
          const botState = cribbageState.playerStates[player.id];
          if (!botState || botState.discardedToCrib.length > 0) continue;
          
          botActionInProgress.current = true;
          
          const isDealer = player.id === cribbageState.dealerPlayerId;
          const discardIndices = getBotDiscardIndices(botState.hand, players.length, isDealer);
          
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

        await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

        try {
          if (shouldBotCallGo(botState, cribbageState.pegging.currentCount)) {
            const newState = callGo(cribbageState, currentTurnId);
            // Fire-and-forget event logging
            logGoPointEvent(eventCtx, cribbageState, newState);
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
              const cardPlayed = botState.hand[cardIndex];
              const newState = playPeggingCard(cribbageState, currentTurnId, cardIndex);
              // Fire-and-forget event logging
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

  const handleDiscard = useCallback(async (cardIndices: number[]) => {
    if (!cribbageState || !currentPlayerId) return;
    
    try {
      const newState = discardToCrib(cribbageState, currentPlayerId, cardIndices);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId]);

  const handlePlayCard = useCallback(async (cardIndex: number) => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const playerState = cribbageState.playerStates[currentPlayerId];
      const cardPlayed = playerState?.hand[cardIndex];
      const newState = playPeggingCard(cribbageState, currentPlayerId, cardIndex);
      // Fire-and-forget event logging
      if (cardPlayed) {
        logPeggingPlay(eventCtx, cribbageState, newState, currentPlayerId, cardPlayed);
      }
      // Check for his_heels on phase transition
      if (newState.lastEvent?.type === 'his_heels') {
        logHisHeelsEvent(eventCtx, newState);
      }
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId, eventCtx]);

  const handleGo = useCallback(async () => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const newState = callGo(cribbageState, currentPlayerId);
      // Fire-and-forget event logging
      logGoPointEvent(eventCtx, cribbageState, newState);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId, eventCtx]);

  // Handle counting phase completion - start a new hand
  const handleCountingComplete = useCallback(async () => {
    if (!cribbageState) return;
    
    try {
      const playerIds = players.map(p => p.id);
      const newState = startNewHand(cribbageState, playerIds);
      await updateState(newState);
      
      // Reset sequence tracking for new hand
      setSequenceStartIndex(0);
      lastCountRef.current = 0;
    } catch (err) {
      console.error('[CRIBBAGE] Error starting new hand:', err);
      toast.error('Failed to start new hand');
    }
  }, [cribbageState, players]);

  const getPlayerUsername = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'Unknown';
    return getDisplayName(players, player, player.profiles?.username || 'Unknown');
  };

  if (!cribbageState || !currentPlayerId) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-poker-gold">Loading Cribbage...</div>
      </div>
    );
  }

  // Get opponents for display around the table
  const opponents = players.filter(p => p.user_id !== currentUserId);
  // Use cribbage_state.dealerPlayerId for crib dealer (rotates each hand), not games.dealer_position
  const isCribDealer = (playerId: string) => cribbageState.dealerPlayerId === playerId;
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Felt Area - Upper Section with circular table */}
      <div 
        className="relative flex items-center justify-center"
        style={{ 
          height: '55vh',
          minHeight: '300px'
        }}
      >
        {/* Light background behind the circle - lower z-index */}
        <div className="absolute inset-0 bg-slate-200 z-0" />

        {/* Circular table - wrapped so overlays can extend past the clipped circle */}
        <div
          className="relative z-10"
          style={{
            width: 'min(90vw, calc(55vh - 32px))',
            height: 'min(90vw, calc(55vh - 32px))',
          }}
        >
          {/* Inner circle is clipped; outer wrapper is not */}
          <div className="relative rounded-full overflow-hidden border-2 border-white/80 w-full h-full">
            {/* Felt background inside circle */}
            {tableColors.showBridge ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${peoriaBridgeMobile})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'brightness(0.5)',
                }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse at center, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
                  filter: 'brightness(0.7)',
                }}
              />
            )}

            {/* Turn Spotlight - z-5 to stay behind pegboard and count */}
            <CribbageTurnSpotlight
              currentTurnPlayerId={cribbageState.pegging.currentTurnPlayerId}
              currentPlayerId={currentPlayerId}
              isVisible={cribbageState.phase === 'pegging'}
            />

            {/* Game Title - Top center of felt */}
            <div className="absolute top-3 left-0 right-0 z-20 flex flex-col items-center">
              <h2 className="text-sm font-bold text-white drop-shadow-lg">
                ${anteAmount} CRIBBAGE
              </h2>
              <p className="text-[9px] text-white/70">
                121 to win • Skunk &lt;91 (2x) • Double &lt;61 (3x)
              </p>
            </div>

            {/* Standard Felt Content (hidden during counting) */}
            <CribbageFeltContent
              cribbageState={cribbageState}
              players={players}
              currentPlayerId={currentPlayerId}
              sequenceStartIndex={sequenceStartIndex}
              getPlayerUsername={getPlayerUsername}
              cardBackColors={cardBackColors}
            />

            {/* Counting Phase Overlay */}
            {cribbageState.phase === 'counting' && (
              <CribbageCountingPhase
                cribbageState={cribbageState}
                players={players}
                onCountingComplete={handleCountingComplete}
                cardBackColors={cardBackColors}
                onAnnouncementChange={handleCountingAnnouncementChange}
              />
            )}

            {/* Dealer button at bottom - only if current player is dealer */}
            {currentPlayer && isCribDealer(currentPlayerId) && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-[10px]">D</span>
                </div>
              </div>
            )}
          </div>

          {/* Opponent overlay (not clipped by the circle) */}
          <div className="absolute inset-0 z-50 pointer-events-none">
            <div className="absolute top-14 left-6 flex flex-col gap-2">
              {opponents.map(opponent => {
                const oppState = cribbageState.playerStates[opponent.id];
                const isDealerPlayer = isCribDealer(opponent.id);

                return (
                  <div key={opponent.id} className="flex flex-col items-start">
                    {/* Chip circle row */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white/40 bg-poker-gold">
                          <span className="text-[10px] font-bold text-slate-900">
                            ${formatChipValue(opponent.chips)}
                          </span>
                        </div>
                      </div>

                      {/* Name */}
                      <span className="text-[10px] text-white/90 truncate max-w-[70px] font-medium">
                        {getDisplayName(players, opponent, opponent.profiles?.username || 'Player')}
                      </span>

                      {/* Dealer button inline */}
                      {isDealerPlayer && (
                        <div className="w-4 h-4 rounded-full bg-red-600 border border-white flex items-center justify-center">
                          <span className="text-white font-bold text-[7px]">D</span>
                        </div>
                      )}
                    </div>

                    {/* Opponent's cards (face down) - shows actual card count */}
                    {oppState && oppState.hand.length > 0 && (
                      <div className="flex -space-x-1.5 mt-1 ml-1">
                        {oppState.hand.map((_, i) => (
                          <div 
                            key={i} 
                            className="w-4 h-6 rounded-sm border border-white/20"
                            style={{
                              background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Tabs and Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        {/* Dealer Announcements Area */}
        {(cribbageState.phase === 'counting' || cribbageState.lastEvent ||
          cribbageState.phase === 'discarding' ||
          cribbageState.phase === 'cutting') && (
          <div className="h-[44px] shrink-0 flex items-center justify-center px-4">
            <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-xs text-center truncate">
                {cribbageState.phase === 'counting'
                  ? countingAnnouncement 
                    ? `${countingTargetLabel}: ${countingAnnouncement}`
                    : `Scoring ${countingTargetLabel || 'hands'}...`
                  : cribbageState.lastEvent
                    ? `${getPlayerUsername(cribbageState.lastEvent.playerId)}: ${cribbageState.lastEvent.label} (+${cribbageState.lastEvent.points})`
                    : cribbageState.phase === 'discarding'
                      ? 'Discard to Crib'
                      : 'Cut Card'}
              </p>
            </div>
          </div>
        )}

        {/* Tab navigation bar */}
        <div className="flex items-center justify-center gap-1 px-4 py-1.5 border-b border-border/50">
          {/* Cards tab */}
          <button 
            onClick={() => setActiveTab('cards')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'cards' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <SpadeIcon className="w-5 h-5" />
          </button>
          {/* Chat tab */}
          <button 
            onClick={() => setActiveTab('chat')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'chat' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          {/* Lobby tab */}
          <button 
            onClick={() => setActiveTab('lobby')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'lobby' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <User className="w-5 h-5" />
          </button>
          {/* History tab */}
          <button 
            onClick={() => setActiveTab('history')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'history' 
                ? 'bg-primary/20 text-foreground' 
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <Clock className="w-5 h-5" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'cards' && currentPlayer && (
            <CribbageMobileCardsTab
              cribbageState={cribbageState}
              currentPlayerId={currentPlayerId}
              playerCount={players.length}
              isProcessing={isProcessing}
              onDiscard={handleDiscard}
              onPlayCard={handlePlayCard}
              currentPlayer={currentPlayer}
              gameId={gameId}
              isDealer={isCribDealer(currentPlayerId)}
            />
          )}

          {activeTab === 'chat' && (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground">Chat coming soon...</span>
            </div>
          )}

          {activeTab === 'lobby' && (
            <div className="p-4 space-y-2">
              {players.map(player => (
                <div key={player.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <span className="text-sm">{getDisplayName(players, player, player.profiles?.username || 'Player')}</span>
                  <span className="text-sm text-poker-gold">${player.chips}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground">History coming soon...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
