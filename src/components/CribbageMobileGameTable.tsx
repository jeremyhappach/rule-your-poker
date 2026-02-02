import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CribbageState } from '@/lib/cribbageTypes';
import { 
  initializeCribbageGame, 
  discardToCrib, 
  playPeggingCard, 
  callGo,
} from '@/lib/cribbageGameLogic';
import { hasPlayableCard } from '@/lib/cribbageScoring';
import { getBotDiscardIndices, getBotPeggingCardIndex, shouldBotCallGo } from '@/lib/cribbageBotLogic';
import { CribbageFeltContent } from './CribbageFeltContent';
import { CribbageMobileCardsTab } from './CribbageMobileCardsTab';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { cn, formatChipValue } from '@/lib/utils';
import { MessageSquare, User, Clock } from 'lucide-react';

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

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;
  
  const [sequenceStartIndex, setSequenceStartIndex] = useState(0);
  const lastCountRef = useRef<number>(0);

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
      const newState = playPeggingCard(cribbageState, currentPlayerId, cardIndex);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId]);

  const handleGo = useCallback(async () => {
    if (!cribbageState || !currentPlayerId) return;

    try {
      const newState = callGo(cribbageState, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [cribbageState, currentPlayerId]);

  const getPlayerUsername = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player?.profiles?.username || 'Unknown';
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
  const isDealer = (playerId: string) => dealerPosition === players.find(p => p.id === playerId)?.position;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Felt Area - Upper Section with circular table */}
      <div 
        className="relative overflow-hidden"
        style={{ 
          height: '55vh',
          minHeight: '300px'
        }}
      >
        {/* Background gradient */}
        <div 
          className="absolute inset-0"
          style={{ 
            background: `linear-gradient(135deg, ${tableColors.color}, ${tableColors.darkColor})`
          }}
        />

        {/* Circular table overlay */}
        <div className="absolute inset-4 rounded-full overflow-hidden border-4 border-amber-900/50">
          <div 
            className="w-full h-full"
            style={{ 
              background: `radial-gradient(ellipse at center, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`
            }}
          />
        </div>

        {/* Opponent positions - upper left to avoid obscuring header */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-30">
          {opponents.map(opponent => {
            const oppState = cribbageState.playerStates[opponent.id];
            const isOppTurn = cribbageState.pegging.currentTurnPlayerId === opponent.id;
            const isDealerPlayer = isDealer(opponent.id);
            
            return (
              <div 
                key={opponent.id}
                className="flex items-center gap-2"
              >
                {/* Chip circle - no outer box */}
                <div className="relative">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2",
                    isOppTurn ? "border-poker-gold bg-white animate-pulse" : "border-white/40 bg-white"
                  )}>
                    <span className="text-xs font-bold text-slate-800">
                      ${formatChipValue(opponent.chips)}
                    </span>
                  </div>
                  {/* Dealer button */}
                  {isDealerPlayer && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-600 border border-white flex items-center justify-center">
                      <span className="text-white font-bold text-[8px]">D</span>
                    </div>
                  )}
                </div>
                
                {/* Name only - score is on peg board */}
                <span className="text-xs text-white/80 truncate max-w-[60px]">
                  {opponent.profiles?.username || 'Player'}
                </span>

                {/* Opponent's cards (face down) */}
                <div className="flex -space-x-2">
                  {oppState?.hand.map((_, i) => (
                    <div key={i} className="transform scale-50 origin-center">
                      <CribbagePlayingCard card={{ rank: 'A', suit: 'spades', value: 1 }} size="xs" faceDown />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cribbage Felt Content - Peg board and pegging area */}
        <CribbageFeltContent
          cribbageState={cribbageState}
          players={players}
          currentPlayerId={currentPlayerId}
          sequenceStartIndex={sequenceStartIndex}
          getPlayerUsername={getPlayerUsername}
          anteAmount={anteAmount}
        />

        {/* Current player position at bottom of felt */}
        {currentPlayer && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className={cn(
                  "w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 bg-white",
                  cribbageState.pegging.currentTurnPlayerId === currentPlayerId 
                    ? "border-poker-gold ring-2 ring-poker-gold animate-pulse" 
                    : "border-slate-600/50"
                )}>
                  <span className="text-sm font-bold text-slate-800">
                    ${formatChipValue(currentPlayer.chips)}
                  </span>
                </div>
                {isDealer(currentPlayerId) && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center">
                    <span className="text-white font-bold text-[10px]">D</span>
                  </div>
                )}
              </div>
              <span className="text-xs text-white/80 mt-1">You</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section - Tabs and Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
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
                  <span className="text-sm">{player.profiles?.username || 'Player'}</span>
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
