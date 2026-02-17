// Gin Rummy Game Table - Mobile layout following CribbageMobileGameTable pattern
// Circular felt, opponent chip, tabs (cards, chat, lobby, history)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWakeLock } from '@/hooks/useWakeLock';
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
} from '@/lib/ginRummyGameLogic';
import {
  shouldBotTakeFirstDraw,
  botChooseDrawSource,
  botChooseDiscard,
  botShouldKnock,
  botGetLayOffs,
} from '@/lib/ginRummyBotLogic';
import {
  startNextGinRummyHand,
  recordGinRummyHandResult,
  endGinRummyGame,
} from '@/lib/ginRummyRoundLogic';
import { GinRummyFeltContent } from './GinRummyFeltContent';
import { GinRummyMobileCardsTab } from './GinRummyMobileCardsTab';
import { GinRummyKnockDisplay } from './GinRummyKnockDisplay';
import { GinRummyMatchWinner } from './GinRummyMatchWinner';
import { MobileChatPanel } from './MobileChatPanel';
import { HandHistory } from './HandHistory';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { useKnockSound } from '@/hooks/useKnockSound';
import { useGameChat } from '@/hooks/useGameChat';
import { cn, formatChipValue } from '@/lib/utils';
import { getDisplayName } from '@/lib/botAlias';
import peoriaBridgeMobile from '@/assets/peoria-bridge-mobile.jpg';
import { MessageSquare, User, Clock } from 'lucide-react';

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
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
  const { getTableColors, getCardBackColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  const { playKnock } = useKnockSound();
  
  // Prevent screen from dimming during gameplay
  useWakeLock(true);

  const { allMessages, sendMessage, isSending: isChatSending } = useGameChat(gameId, players, currentUserId);

  const [ginState, setGinState] = useState<GinRummyState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [chatTabFlashing, setChatTabFlashing] = useState(false);
  const prevMessageCountRef = useRef(0);
  const prevPhaseRef = useRef<string | null>(null);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;

  // Derive opponent
  const opponentId = ginState
    ? (currentPlayerId === ginState.dealerPlayerId
      ? ginState.nonDealerPlayerId
      : ginState.dealerPlayerId)
    : '';
  const opponent = players.find(p => p.id === opponentId);

  // Play knock sound when phase transitions to 'knocking'
  useEffect(() => {
    if (!ginState) return;
    const currentPhase = ginState.phase;
    if (currentPhase === 'knocking' && prevPhaseRef.current !== 'knocking') {
      playKnock();
    }
    prevPhaseRef.current = currentPhase;
  }, [ginState?.phase, playKnock]);

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

  // Chat unread tracking
  useEffect(() => {
    if (!allMessages) return;
    const userMessages = allMessages.filter(m => m.user_id !== currentUserId);
    if (userMessages.length > prevMessageCountRef.current && activeTab !== 'chat') {
      setHasUnreadMessages(true);
      setChatTabFlashing(true);
      setTimeout(() => setChatTabFlashing(false), 3000);
    }
    prevMessageCountRef.current = userMessages.length;
  }, [allMessages, activeTab, currentUserId]);

  // ─── Bot Action Loop ────────────────────────────────────────────
  const botActionInProgress = useRef(false);

  useEffect(() => {
    if (!ginState || !currentPlayerId || isProcessing || botActionInProgress.current) return;

    const currentTurnId = ginState.currentTurnPlayerId;
    if (!currentTurnId) return;

    const turnPlayer = players.find(p => p.id === currentTurnId);
    if (!turnPlayer?.is_bot) return;

    // Bot needs to act
    const runBotAction = async () => {
      if (botActionInProgress.current) return;
      botActionInProgress.current = true;

      try {
        // Add a human-like delay
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 600));

        // Re-fetch latest state to prevent stale-closure issues
        const { data } = await supabase
          .from('rounds')
          .select('gin_rummy_state')
          .eq('id', roundId)
          .single();

        if (!data?.gin_rummy_state) return;
        let state = data.gin_rummy_state as unknown as GinRummyState;

        // Verify it's still the bot's turn
        if (state.currentTurnPlayerId !== currentTurnId) return;

        const botId = currentTurnId;
        const botState = state.playerStates[botId];
        if (!botState) return;

        // Phase: first_draw
        if (state.phase === 'first_draw' && state.firstDrawOfferedTo === botId) {
          const upCard = state.discardPile[state.discardPile.length - 1];
          if (upCard && shouldBotTakeFirstDraw(botState.hand, upCard)) {
            state = takeFirstDrawCard(state, botId);
          } else {
            state = passFirstDraw(state, botId);
          }
        }
        // Phase: playing - draw (then fall through to discard)
        if (state.phase === 'playing' && state.turnPhase === 'draw') {
          const topDiscard = getDiscardTop(state);
          const source = botChooseDrawSource(botState.hand, topDiscard);
          if (source === 'discard' && topDiscard) {
            state = drawFromDiscard(state, botId);
          } else {
            state = drawFromStock(state, botId);
          }
          // Re-read bot state after draw (hand changed)
          const updatedBotState = state.playerStates[botId];

          // Fall through to discard immediately
          const drawnFromDiscard = state.drawSource === 'discard' && state.lastAction?.card
            ? state.lastAction.card
            : null;

          const knockDecision = botShouldKnock(updatedBotState.hand, drawnFromDiscard);

          if (knockDecision.shouldKnock) {
            const discardCardVal = updatedBotState.hand[knockDecision.discardIndex];
            state = declareKnock(state, botId, discardCardVal);
            if (state.phase === 'scoring') {
              state = scoreHand(state);
            }
          } else {
            const discardIdx = knockDecision.discardIndex;
            const card = updatedBotState.hand[discardIdx];
            state = discardCard(state, botId, card);
          }
        }
        // Phase: playing - discard only (edge case: state loaded mid-discard)
        else if (state.phase === 'playing' && state.turnPhase === 'discard') {
          const drawnFromDiscard = state.drawSource === 'discard' && state.lastAction?.card
            ? state.lastAction.card
            : null;

          const knockDecision = botShouldKnock(botState.hand, drawnFromDiscard);

          if (knockDecision.shouldKnock) {
            const discardCardVal = botState.hand[knockDecision.discardIndex];
            state = declareKnock(state, botId, discardCardVal);
            if (state.phase === 'scoring') {
              state = scoreHand(state);
            }
          } else {
            const discardIdx = knockDecision.discardIndex;
            const card = botState.hand[discardIdx];
            state = discardCard(state, botId, card);
          }
        }
        // Phase: knocking/laying_off - bot is the non-knocker
        else if ((state.phase === 'knocking' || state.phase === 'laying_off')) {
          const knockerId = Object.entries(state.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
          if (knockerId && botId !== knockerId) {
            // Lay off cards if possible
            const layOffs = botGetLayOffs(botState.hand, state.playerStates[knockerId].melds);
            for (const lo of layOffs) {
              try {
                state = layOffCard(state, botId, lo.card, lo.onMeldIndex);
              } catch {
                break; // Card may no longer be valid
              }
            }
            state = finishLayingOff(state, botId);
            if (state.phase === 'scoring') {
              state = scoreHand(state);
            }
          }
        }

        // Write updated state
        await supabase
          .from('rounds')
          .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
          .eq('id', roundId);

        setGinState(state);
      } catch (err) {
        console.error('[GIN-RUMMY BOT] Error:', err);
      } finally {
        botActionInProgress.current = false;
      }
    };

    const timeout = setTimeout(runBotAction, 300);
    return () => clearTimeout(timeout);
  }, [ginState, currentPlayerId, isProcessing, players, roundId]);

  // ─── Hand Completion & Next Hand ──────────────────────────────
  const handCompletionInProgress = useRef(false);

  useEffect(() => {
    if (!ginState || ginState.phase !== 'complete' || handCompletionInProgress.current) return;
    if (!dealerGameId) return;

    handCompletionInProgress.current = true;

    const processCompletion = async () => {
      try {
        // Record hand result
        if (ginState.knockResult) {
          await recordGinRummyHandResult(gameId, dealerGameId, handNumber, ginState);
        }

        // Check if match is won
        if (ginState.winnerPlayerId) {
          await endGinRummyGame(gameId, roundId, ginState);
          onGameComplete();
          return;
        }

        // Start next hand after a delay (shorter for void hands)
        const delay = ginState.knockResult ? 3000 : 1500;
        await new Promise(resolve => setTimeout(resolve, delay));
        const result = await startNextGinRummyHand(gameId, dealerGameId, ginState);
        if (result.success) {
          console.log('[GIN-RUMMY] Next hand started:', result.handNumber);
        }
      } catch (err) {
        console.error('[GIN-RUMMY] Hand completion error:', err);
      } finally {
        handCompletionInProgress.current = false;
      }
    };

    processCompletion();
  }, [ginState?.phase, ginState?.winnerPlayerId]);

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
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleKnock = async (index: number) => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[index];
    if (!card) return;
    try {
      let newState = declareKnock(ginState, currentPlayerId, card);
      if (newState.phase === 'scoring') {
        newState = scoreHand(newState);
      }
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

  const handleLayOff = async (cardIndex: number, meldIndex: number) => {
    if (!ginState || !currentPlayerId || isProcessing) return;
    const card = ginState.playerStates[currentPlayerId]?.hand[cardIndex];
    if (!card) return;
    try {
      const newState = layOffCard(ginState, currentPlayerId, card, meldIndex);
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

  const getPlayerUsername = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'Unknown';
    return getDisplayName(players, player, player.profiles?.username || 'Player');
  };

  const isCribDealer = (playerId: string | undefined) => {
    if (!ginState || !playerId) return false;
    return ginState.dealerPlayerId === playerId;
  };

  if (!ginState || !currentPlayerId || !currentPlayer) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-poker-gold">Loading Gin Rummy...</div>
      </div>
    );
  }

  const opponentState = ginState.playerStates[opponentId];

  return (
    <div className="h-full flex flex-col">
      {/* Felt Area - Upper Section with circular table */}
      <div
        className="relative flex items-start justify-center pt-1"
        style={{
          height: 'calc(min(90vw, calc(55vh - 32px)) + 10px)',
          minHeight: '300px',
        }}
      >
        {/* Light background behind the circle */}
        <div className="absolute inset-0 bg-slate-200 z-0" />

        {/* Circular table */}
        <div
          className="relative z-10"
          style={{
            width: 'min(90vw, calc(55vh - 32px))',
            height: 'min(90vw, calc(55vh - 32px))',
          }}
        >
          {/* Inner circle */}
          <div className="relative rounded-full overflow-hidden border-2 border-white/80 w-full h-full">
            {/* Felt background */}
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

            {/* Game Title */}
            <div className="absolute top-3 left-0 right-0 z-20 flex flex-col items-center">
              <h2 className="text-sm font-bold text-white drop-shadow-lg">
                ${anteAmount} GIN RUMMY
              </h2>
              <p className="text-[9px] text-white/70">
                To {ginState.pointsToWin} pts
              </p>
            </div>

            {/* Felt Content */}
            <GinRummyFeltContent
              ginState={ginState}
              currentPlayerId={currentPlayerId}
              opponentId={opponentId}
              getPlayerUsername={getPlayerUsername}
              cardBackColors={cardBackColors}
              onDrawStock={handleDrawStock}
              onDrawDiscard={handleDrawDiscard}
              isProcessing={isProcessing}
            />

            {/* Knock Result Display */}
            {(ginState.phase === 'knocking' || ginState.phase === 'laying_off' || ginState.phase === 'scoring' || (ginState.phase === 'complete' && ginState.knockResult)) && (
              <GinRummyKnockDisplay
                ginState={ginState}
                getPlayerUsername={getPlayerUsername}
                currentPlayerId={currentPlayerId}
              />
            )}

            {/* Match Winner Celebration */}
            {ginState.phase === 'complete' && ginState.winnerPlayerId && (
              <GinRummyMatchWinner
                ginState={ginState}
                getPlayerUsername={getPlayerUsername}
              />
            )}

            {/* Dealer button at bottom - only if current player is dealer */}
            {isCribDealer(currentPlayerId) && ginState.phase === 'playing' && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                <div className="w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-[10px]">D</span>
                </div>
              </div>
            )}
          </div>

          {/* Opponent overlay */}
          <div className="absolute inset-0 z-50 pointer-events-none">
            {opponent && opponentState && (
              <div className="absolute top-14 left-6 flex flex-col items-start">
                {/* Chip circle row */}
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white/40 bg-white">
                      <span className="text-[10px] font-bold text-slate-900">
                        ${formatChipValue(opponent.chips)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] text-white/90 truncate max-w-[70px] font-medium">
                    {getDisplayName(players, opponent, opponent.profiles?.username || 'Player')}
                  </span>

                  {isCribDealer(opponentId) && (
                    <div className="w-4 h-4 rounded-full bg-red-600 border border-white flex items-center justify-center">
                      <span className="text-white font-bold text-[7px]">D</span>
                    </div>
                  )}
                </div>

                {/* Opponent's cards (face down) - hide during knock/scoring/complete when melds are shown */}
                {opponentState.hand.length > 0 && ginState.phase !== 'knocking' && ginState.phase !== 'laying_off' && ginState.phase !== 'scoring' && !(ginState.phase === 'complete' && ginState.knockResult) && (
                  <div className="flex -space-x-3 mt-1 ml-1">
                    {opponentState.hand.map((_, i) => (
                      <div
                        key={i}
                        className="w-3.5 h-5 rounded-sm border border-white/20"
                        style={{
                          background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Tabs and Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        {/* Dealer Announcements Area */}
        <div className="h-[36px] shrink-0 flex items-center justify-center px-3">
          {(() => {
            if (ginState.phase === 'complete' && ginState.knockResult) {
              return (
                <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                  <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                    {getPlayerUsername(ginState.knockResult.winnerId)} wins!
                    {ginState.knockResult.isGin && ' GIN!'}
                    {ginState.knockResult.isUndercut && ' Undercut!'}
                    {' +'}
                    {ginState.knockResult.pointsAwarded} pts
                  </p>
                </div>
              );
            }

            if (ginState.phase === 'complete' && !ginState.knockResult) {
              return (
                <div className="w-full bg-muted/80 backdrop-blur-sm rounded-md px-3 py-1.5">
                  <p className="text-muted-foreground font-bold text-[11px] text-center">
                    Void Hand — Stock Exhausted
                  </p>
                </div>
              );
            }

            if (ginState.phase === 'knocking' || ginState.phase === 'laying_off') {
              const knockerId = Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
              if (knockerId) {
                return (
                  <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                    <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                      {getPlayerUsername(knockerId)} {ginState.playerStates[knockerId]?.hasGin ? 'has GIN! 🎉' : 'knocked!'}
                    </p>
                  </div>
                );
              }
            }

            return null;
          })()}
        </div>

        {/* Tab navigation bar */}
        <div className="flex items-center justify-center gap-1 px-3 py-1 border-b border-border/50">
          <button
            onClick={() => setActiveTab('cards')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'cards'
                ? 'bg-primary/20 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <SpadeIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setActiveTab('chat');
              setHasUnreadMessages(false);
            }}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'chat'
                ? 'bg-primary/20 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            } ${chatTabFlashing ? 'animate-pulse' : ''}`}
          >
            <MessageSquare className={`w-5 h-5 ${chatTabFlashing ? 'text-green-500 fill-green-500 animate-pulse' : ''} ${hasUnreadMessages && !chatTabFlashing ? 'text-red-500 fill-red-500' : ''}`} />
          </button>
          <button
            onClick={() => setActiveTab('lobby')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'lobby'
                ? 'bg-primary/20 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <User className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-1.5 px-2 rounded-md transition-all ${
              activeTab === 'history'
                ? 'bg-primary/20 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <Clock className="w-5 h-5" />
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'cards' && currentPlayer && (
            <GinRummyMobileCardsTab
              ginState={ginState}
              currentPlayerId={currentPlayerId}
              isProcessing={isProcessing}
              onDrawStock={handleDrawStock}
              onDrawDiscard={handleDrawDiscard}
              onDiscard={handleDiscard}
              onKnock={handleKnock}
              onTakeFirstDraw={handleTakeFirstDraw}
              onPassFirstDraw={handlePassFirstDraw}
              onLayOff={handleLayOff}
              onFinishLayingOff={handleFinishLayingOff}
              currentPlayer={currentPlayer}
              gameId={gameId}
            />
          )}

          {activeTab === 'chat' && (
            <div className="h-full p-2">
              <MobileChatPanel
                messages={allMessages}
                onSend={sendMessage}
                isSending={isChatSending}
                currentUserId={currentUserId}
              />
            </div>
          )}

          {activeTab === 'lobby' && (
            <div className="p-4 space-y-2">
              {players.map(player => (
                <div key={player.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                  <span className="text-sm">{getDisplayName(players, player, player.profiles?.username || 'Player')}</span>
                  <span className="text-sm text-poker-gold">${formatChipValue(player.chips)}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <HandHistory
              gameId={gameId}
              currentUserId={currentUserId}
              currentPlayerId={currentPlayerId}
              gameType="gin-rummy"
            />
          )}
        </div>
      </div>
    </div>
  );
};
