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
import { GinRummyOpponentDrawAnimation } from './GinRummyOpponentDrawAnimation';
import { GinRummyMatchWinner } from './GinRummyMatchWinner';
import { GinRummyKnockOverlay } from './GinRummyKnockOverlay';
import { GinRummyGinOverlay } from './GinRummyGinOverlay';
import { CribbageChipTransferAnimation } from './CribbageChipTransferAnimation';
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
  // Lifted lay-off card selection so the felt can show meld targets
  const [layOffSelectedCardIndex, setLayOffSelectedCardIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [chatTabFlashing, setChatTabFlashing] = useState(false);
  // Chip transfer animation at match end (player-to-player like cribbage)
  const [chipAnimTriggerId, setChipAnimTriggerId] = useState<string | null>(null);
  const [storedChipPositions, setStoredChipPositions] = useState<{
    winner: { x: number; y: number };
    losers: { playerId: string; x: number; y: number }[];
  } | null>(null);
  const [chipAnimAmount, setChipAnimAmount] = useState(0);
  const matchEndAnimatedRef = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const prevPhaseRef = useRef<string | null>(null);
  // Guard: suppress realtime/poll overwrites briefly after an optimistic local update
  const optimisticUntilRef = useRef<number>(0);
  const [showKnockOverlay, setShowKnockOverlay] = useState(false);
  const [showGinOverlay, setShowGinOverlay] = useState(false);

  // Opponent draw animation state
  const [opponentDrawTriggerId, setOpponentDrawTriggerId] = useState<string | null>(null);
  const [opponentDrawSource, setOpponentDrawSource] = useState<'stock' | 'discard'>('stock');
  const [opponentDrawCard, setOpponentDrawCard] = useState<GinRummyCard | null>(null);
  const [opponentDrawKey, setOpponentDrawKey] = useState(0);
  const prevLastActionRef = useRef<string | null>(null);

  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerId = currentPlayer?.id;

  // Derive opponent
  const opponentId = ginState
    ? (currentPlayerId === ginState.dealerPlayerId
      ? ginState.nonDealerPlayerId
      : ginState.dealerPlayerId)
    : '';
  const opponent = players.find(p => p.id === opponentId);

  // Play knock sound + show overlay when phase transitions to 'knocking'
  // Show gin overlay when knockResult indicates gin
  useEffect(() => {
    if (!ginState) return;
    const currentPhase = ginState.phase;
    if (currentPhase === 'knocking' && prevPhaseRef.current !== 'knocking' && !showKnockOverlay) {
      console.log('[GIN] Phase → knocking, showing knock overlay');
      setTimeout(() => playKnock(), 100);
      setShowKnockOverlay(true);
    }
    // Detect gin: phase goes to scoring/complete with hasGin flag on a player
    const anyPlayerHasGin = ginState.playerStates && Object.values(ginState.playerStates).some(ps => ps.hasGin);
    if (
      (currentPhase === 'scoring' || currentPhase === 'complete') &&
      prevPhaseRef.current !== 'scoring' &&
      prevPhaseRef.current !== 'complete' &&
      !showGinOverlay &&
      (ginState.knockResult?.isGin || anyPlayerHasGin)
    ) {
      console.log('[GIN] GIN detected, showing gin overlay');
      setShowGinOverlay(true);
    }
    prevPhaseRef.current = currentPhase;
  }, [ginState?.phase, playKnock]);

  // Detect opponent draw actions and trigger animation
  useEffect(() => {
    if (!ginState || !currentPlayerId) return;
    const action = ginState.lastAction;
    if (!action) return;
    const actionKey = `${action.type}-${action.playerId}-${action.timestamp}`;
    if (actionKey === prevLastActionRef.current) return;
    prevLastActionRef.current = actionKey;

    // Only animate opponent draws (not our own)
    if (action.playerId === currentPlayerId) return;
    if (action.type === 'draw_stock') {
      setOpponentDrawSource('stock');
      setOpponentDrawCard(null);
      setOpponentDrawTriggerId(`draw-${actionKey}`);
      setOpponentDrawKey(k => k + 1);
    } else if (action.type === 'draw_discard') {
      setOpponentDrawSource('discard');
      setOpponentDrawCard(action.card ?? null);
      setOpponentDrawTriggerId(`draw-${actionKey}`);
      setOpponentDrawKey(k => k + 1);
    }
  }, [ginState?.lastAction, currentPlayerId]);

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

  // Realtime subscription + aggressive polling fallback
  // Realtime silently drops large JSONB payloads — polling is the safety net for human vs human.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref for onGameComplete to avoid rebuilding the subscription on every parent re-render
  const onGameCompleteRef = useRef(onGameComplete);
  useEffect(() => { onGameCompleteRef.current = onGameComplete; }, [onGameComplete]);

  useEffect(() => {
    if (!roundId) return;
    let isActive = true;

    const applyState = (state: GinRummyState, source: string) => {
      if (!isActive) return;
      // Skip stale realtime/poll updates that arrive right after an optimistic local update
      if (Date.now() < optimisticUntilRef.current) {
        console.log(`[GIN-RUMMY] Suppressed ${source} update (optimistic guard)`);
        return;
      }
      console.log(`[GIN-RUMMY] State update from ${source}`, {
        phase: state.phase,
        turn: state.currentTurnPlayerId?.slice(0, 8),
        firstDrawOfferedTo: state.firstDrawOfferedTo?.slice(0, 8),
      });
      setGinState(state);
      if (state.phase === 'complete' && state.winnerPlayerId) {
        onGameCompleteRef.current();
      }
    };

    // Primary: realtime subscription
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
          if (newData.gin_rummy_state) {
            applyState(newData.gin_rummy_state, 'realtime');
          }
        }
      )
      .subscribe((status) => {
        console.log('[GIN-RUMMY] Realtime subscription status:', status);
      });

    // Fallback polling — unconditional, always applies fresh DB state.
    // Realtime silently drops large JSONB payloads; polling is the guaranteed fallback.
    const poll = async () => {
      if (!isActive) return;

      try {
        const { data } = await supabase
          .from('rounds')
          .select('gin_rummy_state')
          .eq('id', roundId)
          .maybeSingle();

        if (data?.gin_rummy_state && isActive) {
          applyState(data.gin_rummy_state as unknown as GinRummyState, 'poll');
        }
      } catch {
        // Silent fail
      }

      if (isActive) {
        pollTimerRef.current = setTimeout(poll, 1500);
      }
    };

    // First poll after a short delay, then every 1.5s
    pollTimerRef.current = setTimeout(poll, 800);

    return () => {
      isActive = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [roundId]); // ← onGameComplete intentionally excluded; using ref instead

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
          // After first_draw handling, if the turn is no longer the bot's, write and stop
          if (state.currentTurnPlayerId !== botId) {
            optimisticUntilRef.current = Date.now() + 1200;
            await supabase
              .from('rounds')
              .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
              .eq('id', roundId);
            setGinState(state);
            return;
          }
        }
        // Phase: playing - draw (then fall through to discard after 1s delay)
        if (state.phase === 'playing' && state.turnPhase === 'draw') {
          const topDiscard = getDiscardTop(state);
          const source = botChooseDrawSource(botState.hand, topDiscard);
          if (source === 'discard' && topDiscard) {
            state = drawFromDiscard(state, botId);
          } else {
            state = drawFromStock(state, botId);
          }

          // Write draw state to DB so opponent sees the draw animation
          const drawSnapshot = JSON.parse(JSON.stringify(state));
          await supabase
            .from('rounds')
            .update({ gin_rummy_state: drawSnapshot })
            .eq('id', roundId);
          setGinState(drawSnapshot);

          // 1-second delay so opponent can see what the bot drew
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Re-read bot state after draw (hand changed)
          const updatedBotState = state.playerStates[botId];

          // Fall through to discard
          const drawnFromDiscard = state.drawSource === 'discard' && state.lastAction?.card
            ? state.lastAction.card
            : null;

          const knockDecision = botShouldKnock(updatedBotState.hand, drawnFromDiscard);

          if (knockDecision.shouldKnock) {
            const discardCardVal = updatedBotState.hand[knockDecision.discardIndex];
            state = declareKnock(state, botId, discardCardVal);
            if (state.phase === 'scoring') {
              // Gin! Write state first so gin overlay plays, then wait before scoring
              const ginSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: ginSnapshot })
                .eq('id', roundId);
              setGinState(ginSnapshot);
              await new Promise(resolve => setTimeout(resolve, 3500));
              state = scoreHand(state);
            } else if (state.phase === 'knocking') {
              // Knock! Write state so overlay plays, wait for it before tabling cards
              const knockSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: knockSnapshot })
                .eq('id', roundId);
              setGinState(knockSnapshot);
              await new Promise(resolve => setTimeout(resolve, 2800));
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
              // Gin! Write state first so gin overlay plays, then wait before scoring
              const ginSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: ginSnapshot })
                .eq('id', roundId);
              setGinState(ginSnapshot);
              await new Promise(resolve => setTimeout(resolve, 3500));
              state = scoreHand(state);
            } else if (state.phase === 'knocking') {
              // Knock! Write state so overlay plays, wait for it before tabling cards
              const knockSnapshot = JSON.parse(JSON.stringify(state));
              await supabase
                .from('rounds')
                .update({ gin_rummy_state: knockSnapshot })
                .eq('id', roundId);
              setGinState(knockSnapshot);
              await new Promise(resolve => setTimeout(resolve, 2800));
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
            // Show bot's cards on felt first, then wait 3s before laying off
            await supabase
              .from('rounds')
              .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
              .eq('id', roundId);
            setGinState(state);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Lay off cards one at a time with 1.5s delay each so player can follow along
            const layOffs = botGetLayOffs(botState.hand, state.playerStates[knockerId].melds);
            for (const lo of layOffs) {
              try {
                state = layOffCard(state, botId, lo.card, lo.onMeldIndex);
                // Write intermediate state so viewer can see each lay-off
                await supabase
                  .from('rounds')
                  .update({ gin_rummy_state: JSON.parse(JSON.stringify(state)) })
                  .eq('id', roundId);
                setGinState(state);
                await new Promise(resolve => setTimeout(resolve, 1500));
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
        // Record hand result (history only, no chip transfer per-hand)
        if (ginState.knockResult) {
          await recordGinRummyHandResult(gameId, dealerGameId, handNumber, ginState);
        }

        // Check if match is won
        if (ginState.winnerPlayerId) {
          // Trigger chip transfer animation before ending the game
          if (!matchEndAnimatedRef.current) {
            matchEndAnimatedRef.current = true;
            // Compute player-to-player positions like cribbage
            const container = tableContainerRef.current;
            if (container) {
              const rect = container.getBoundingClientRect();
              const winnerId = ginState.winnerPlayerId;
              const loserId = winnerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;
              const winnerPlayer = players.find(p => p.id === winnerId);
              const isWinnerCurrentPlayer = winnerPlayer?.user_id === currentUserId;

              const winnerPos = isWinnerCurrentPlayer
                ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 }
                : { x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 };
              const loserPos = isWinnerCurrentPlayer
                ? { playerId: loserId, x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 }
                : { playerId: loserId, x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 };

              setChipAnimAmount(anteAmount);
              setStoredChipPositions({ winner: winnerPos, losers: [loserPos] });
              setChipAnimTriggerId(`gin-win-${roundId}-${Date.now()}`);
            }
            // Wait for animation to play
            await new Promise(resolve => setTimeout(resolve, 4500));
          }
          await endGinRummyGame(gameId, roundId, ginState);
          onGameComplete();
          return;
        }

        // Start next hand after a delay (longer for gin so players can read cards)
        const isGin = ginState.knockResult?.isGin;
        const delay = !ginState.knockResult ? 1500 : isGin ? 5000 : 3000;
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
    // Suppress realtime/poll overwrites for 500ms so the optimistic state isn't clobbered
    optimisticUntilRef.current = Date.now() + 500;
    // Set local state immediately to prevent stale card flash
    setGinState(newState);
    try {
      const { error } = await supabase
        .from('rounds')
        .update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', roundId);
      if (error) throw error;
    } catch (err) {
      console.error('[GIN-RUMMY] Error updating state:', err);
      toast.error('Failed to update game state');
    } finally {
      setIsProcessing(false);
    }
  };

  // Fetch fresh state from DB to avoid stale closures in multiplayer
  const fetchFreshState = async (): Promise<GinRummyState | null> => {
    const { data } = await supabase
      .from('rounds')
      .select('gin_rummy_state')
      .eq('id', roundId)
      .single();
    return data?.gin_rummy_state as unknown as GinRummyState | null;
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
        // Gin! Show overlay FIRST locally, write to DB for opponent, then delay before tabling
        setShowGinOverlay(true);
        // Write to DB so opponent sees gin phase and gets overlay too
        supabase.from('rounds').update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) }).eq('id', roundId);
        optimisticUntilRef.current = Date.now() + 4000;
        await new Promise(resolve => setTimeout(resolve, 3500));
        await updateState(newState);
        newState = scoreHand(newState);
      } else if (newState.phase === 'knocking') {
        // Knock! Show overlay FIRST locally, write to DB for opponent, then delay before tabling
        setTimeout(() => playKnock(), 100);
        setShowKnockOverlay(true);
        // Write to DB so opponent sees knocking phase and gets overlay too
        supabase.from('rounds').update({ gin_rummy_state: JSON.parse(JSON.stringify(newState)) }).eq('id', roundId);
        optimisticUntilRef.current = Date.now() + 3300;
        await new Promise(resolve => setTimeout(resolve, 2800));
        await updateState(newState);
      }
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleTakeFirstDraw = async () => {
    if (!currentPlayerId || isProcessing) return;
    try {
      // Fetch fresh state from DB to prevent stale closure issues in multiplayer
      const fresh = await fetchFreshState();
      if (!fresh || fresh.phase !== 'first_draw' || fresh.firstDrawOfferedTo !== currentPlayerId) return;
      const newState = takeFirstDrawCard(fresh, currentPlayerId);
      await updateState(newState);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePassFirstDraw = async () => {
    if (!currentPlayerId || isProcessing) return;
    try {
      // Fetch fresh state from DB to prevent stale closure issues in multiplayer
      const fresh = await fetchFreshState();
      if (!fresh || fresh.phase !== 'first_draw' || fresh.firstDrawOfferedTo !== currentPlayerId) return;
      const newState = passFirstDraw(fresh, currentPlayerId);
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
        ref={tableContainerRef}
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
              onDrawDiscard={ginState.phase === 'first_draw' ? handleTakeFirstDraw : handleDrawDiscard}
              isProcessing={isProcessing}
            />

            {/* Opponent Draw Animation */}
            <GinRummyOpponentDrawAnimation
              key={opponentDrawKey}
              triggerId={opponentDrawTriggerId}
              drawSource={opponentDrawSource}
              card={opponentDrawCard}
              cardBackColors={cardBackColors}
            />

            {/* Knock/Gin Felt Display — shows only the OPPONENT's cards on the felt */}
            {(ginState.phase === 'knocking' || ginState.phase === 'laying_off' || ginState.phase === 'scoring' || (ginState.phase === 'complete' && !!ginState.knockResult)) && (
              <GinRummyKnockDisplay
                ginState={ginState}
                getPlayerUsername={getPlayerUsername}
                currentPlayerId={currentPlayerId}
                layOffSelectedCardIndex={layOffSelectedCardIndex}
                onLayOffToMeld={(meldIndex) => {
                  if (layOffSelectedCardIndex !== null) {
                    handleLayOff(layOffSelectedCardIndex, meldIndex);
                    setLayOffSelectedCardIndex(null);
                  }
                }}
                isProcessing={isProcessing}
              />
            )}

            {/* Knock Overlay — shown to all clients */}
            {showKnockOverlay && (() => {
              const knockerEntry = Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked);
              if (!knockerEntry) return null;
              const [knockerId, knockerState] = knockerEntry;
              return (
                <GinRummyKnockOverlay
                  knockerName={getPlayerUsername(knockerId)}
                  deadwood={knockerState.deadwoodValue}
                  onComplete={() => setShowKnockOverlay(false)}
                />
              );
            })()}

            {/* Gin Overlay — cool blue with record scratch */}
            {showGinOverlay && (() => {
              const ginnerEntry = Object.entries(ginState.playerStates).find(([, ps]) => ps.hasGin);
              const winnerId = ginnerEntry?.[0] || ginState.knockResult?.winnerId || '';
              return (
                <GinRummyGinOverlay
                  winnerName={getPlayerUsername(winnerId)}
                  onComplete={() => setShowGinOverlay(false)}
                />
              );
            })()}

            {/* Match Winner Celebration */}
            {ginState.phase === 'complete' && ginState.winnerPlayerId && (
              <GinRummyMatchWinner
                ginState={ginState}
                getPlayerUsername={getPlayerUsername}
              />
            )}

            {/* Player-to-player chip transfer animation at match end */}
            {storedChipPositions && (
              <CribbageChipTransferAnimation
                triggerId={chipAnimTriggerId}
                amount={chipAnimAmount}
                winnerPosition={storedChipPositions.winner}
                loserPositions={storedChipPositions.losers}
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
                {/* Opponent name above chip stack */}
                <span className="text-[10px] text-white/95 truncate max-w-[90px] font-medium bg-black/50 rounded px-1 mb-0.5">
                  {getDisplayName(players, opponent, opponent.profiles?.username || 'Player')}
                </span>

                {/* Chip circle */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white/40 bg-white">
                  <span className="text-[10px] font-bold text-slate-900">
                    ${formatChipValue(opponent.chips)}
                  </span>
                </div>

                {/* Dealer button below chip stack */}
                {isCribDealer(opponentId) && (
                  <div className="w-4 h-4 rounded-full bg-red-600 border border-white flex items-center justify-center mt-0.5">
                    <span className="text-white font-bold text-[7px]">D</span>
                  </div>
                )}
              </div>
            )}

                {/* Opponent's cards (face down) - hide during knock/scoring/complete when melds are shown */}
                {opponent && opponentState && opponentState.hand.length > 0 && ginState.phase !== 'knocking' && ginState.phase !== 'laying_off' && ginState.phase !== 'scoring' && !(ginState.phase === 'complete' && ginState.knockResult) && (
                  <div className="absolute top-14 left-6 mt-[58px] flex -space-x-3">
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
        </div>
      </div>

      {/* Bottom Section - Tabs and Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        {/* Dealer Announcements Area */}
        <div className="h-[36px] shrink-0 flex items-center justify-center px-3">
          {(() => {
            if (ginState.phase === 'complete' && ginState.knockResult) {
              const r = ginState.knockResult;
              const dwDiff = Math.abs(r.opponentDeadwood - r.knockerDeadwood);
              const bonus = r.isGin ? ` (${dwDiff} dw + 25 gin bonus)` :
                            r.isUndercut ? ` (${dwDiff} dw + 25 undercut bonus)` :
                            '';
              return (
                <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                  <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                    {getPlayerUsername(r.winnerId)} +{r.pointsAwarded}{bonus}
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
                const knockerState = ginState.playerStates[knockerId];
                const dwText = knockerState?.hasGin ? '' : ` (${knockerState?.deadwoodValue ?? 0} dw)`;
                return (
                  <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-md px-3 py-1.5 shadow-xl border-2 border-amber-900">
                    <p className="text-slate-900 font-bold text-[11px] text-center truncate">
                      {getPlayerUsername(knockerId)} {knockerState?.hasGin ? 'has GIN! 🎉' : `knocked!${dwText}`}
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
              onFinishLayingOff={() => {
                setLayOffSelectedCardIndex(null);
                handleFinishLayingOff();
              }}
              onLayOffCardSelected={setLayOffSelectedCardIndex}
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
