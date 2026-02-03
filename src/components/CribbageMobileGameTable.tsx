import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import type { CribbageCard, CribbageState } from '@/lib/cribbageTypes';
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
import { HighCardDealerSelection, type DealerSelectionCard, type DealerSelectionState } from './HighCardDealerSelection';
import { CribbageSkunkOverlay } from './CribbageSkunkOverlay';
import { CribbageWinnerAnnouncement } from './CribbageWinnerAnnouncement';
import { CribbageChipTransferAnimation } from './CribbageChipTransferAnimation';
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
  sitting_out?: boolean;
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
  isHost: boolean;
  onGameComplete: () => void;
  // Dealer selection props (optional - used during cribbage_dealer_selection phase)
  dealerSelectionCards?: DealerSelectionCard[];
  dealerSelectionAnnouncement?: string | null;
  dealerSelectionWinnerPosition?: number | null;
  isDealerSelection?: boolean;
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

/**
 * Generate a unique hand key from cribbage state to detect hand transitions.
 * Uses dealerPlayerId + first player's hand signature to uniquely identify a hand.
 */
function getHandKey(state: CribbageState | null): string {
  if (!state) return '';
  const firstPlayerId = state.turnOrder[0];
  const firstPlayerHand = state.playerStates[firstPlayerId]?.hand || [];
  // Include discardedToCrib to differentiate pre/post discard
  const discarded = state.playerStates[firstPlayerId]?.discardedToCrib || [];
  const handSig = [...firstPlayerHand, ...discarded]
    .map(c => `${c.rank}${c.suit}`)
    .sort()
    .join(',');
  return `${state.dealerPlayerId}-${handSig}`;
}

export const CribbageMobileGameTable = ({
  gameId,
  roundId,
  players,
  currentUserId,
  dealerPosition,
  anteAmount,
  pot,
  isHost,
  onGameComplete,
  // Dealer selection props (from parent during cribbage_dealer_selection phase)
  dealerSelectionCards: externalDealerSelectionCards,
  dealerSelectionAnnouncement: externalDealerSelectionAnnouncement,
  dealerSelectionWinnerPosition: externalDealerSelectionWinnerPosition,
  isDealerSelection = false,
}: CribbageMobileGameTableProps) => {
  const { getTableColors, getCardBackColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  
  const [cribbageState, setCribbageState] = useState<CribbageState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');

  // High card dealer selection state - only for first hand
  const [showHighCardSelection, setShowHighCardSelection] = useState(false);
  const [highCardAnnouncement, setHighCardAnnouncement] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const hasInitializedRef = useRef(false);

  // DB-synced high-card selection state (so all clients see the same deal)
  const [highCardSyncedState, setHighCardSyncedState] = useState<DealerSelectionState | null>(null);
  const [highCardCards, setHighCardCards] = useState<DealerSelectionCard[]>([]);
  const [highCardWinnerPosition, setHighCardWinnerPosition] = useState<number | null>(null);

  // When in external dealer selection mode (cribbage_dealer_selection status), use external props
  const effectiveShowHighCardSelection = isDealerSelection || showHighCardSelection;
  const effectiveHighCardCards = isDealerSelection ? (externalDealerSelectionCards || []) : highCardCards;
  const effectiveHighCardAnnouncement = isDealerSelection ? externalDealerSelectionAnnouncement : highCardAnnouncement;
  const effectiveHighCardWinnerPosition = isDealerSelection ? externalDealerSelectionWinnerPosition : highCardWinnerPosition;

  // Track hand key to detect hand transitions and prevent stale card flash
  const currentHandKey = useMemo(() => getHandKey(cribbageState), [cribbageState]);
  const lastHandKeyRef = useRef<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Counting phase announcement state (propagated from CribbageCountingPhase)
  const [countingAnnouncement, setCountingAnnouncement] = useState<string | null>(null);
  const [countingTargetLabel, setCountingTargetLabel] = useState<string | null>(null);
  
  // Counting phase animated scores - peg board reads these instead of final scores
  const [countingScoreOverrides, setCountingScoreOverrides] = useState<Record<string, number> | null>(null);
  
  // Delay before showing counting phase to allow final pegging announcement to display
  const [countingDelayActive, setCountingDelayActive] = useState(false);
  const countingDelayFiredRef = useRef<string | null>(null);

  // Win sequence state
  type WinSequencePhase = 'idle' | 'skunk' | 'announcement' | 'chips' | 'complete';
  const [winSequencePhase, setWinSequencePhase] = useState<WinSequencePhase>('idle');
  const [winSequenceData, setWinSequenceData] = useState<{
    winnerId: string;
    winnerName: string;
    multiplier: number;
    amountPerLoser: number;
    totalWinnings: number;
    loserIds: string[];
  } | null>(null);
  const [chipAnimationTriggerId, setChipAnimationTriggerId] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const winSequenceFiredRef = useRef<string | null>(null);

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

  // Delay showing counting phase by 2 seconds to allow final pegging announcement to display
  useEffect(() => {
    if (!cribbageState) return;
    if (cribbageState.phase !== 'counting') {
      // Reset when leaving counting phase
      setCountingDelayActive(false);
      countingDelayFiredRef.current = null;
      return;
    }
    
    // Create a unique key for this counting phase instance
    const countingKey = `${roundId}-${cribbageState.dealerPlayerId}`;
    if (countingDelayFiredRef.current === countingKey) return;
    countingDelayFiredRef.current = countingKey;
    
    // Start delay - counting phase will be hidden until delay completes
    setCountingDelayActive(true);
    const timer = setTimeout(() => {
      setCountingDelayActive(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [cribbageState?.phase, cribbageState?.dealerPlayerId, roundId]);

  // Initialize game state - check if we need high card selection first
  // This runs ONCE on mount to determine if we need high-card selection or can load existing state
  useEffect(() => {
    // Guard: need roundId to proceed
    if (!roundId) {
      console.log('[CRIBBAGE] No roundId yet, waiting...');
      return;
    }
    
    const loadOrInitializeState = async () => {
      if (hasInitializedRef.current || initialLoadComplete) {
        console.log('[CRIBBAGE] Already initialized, skipping');
        return;
      }
      
      console.log('[CRIBBAGE] Loading state for round:', roundId);
      
      const { data: roundData, error } = await supabase
        .from('rounds')
        .select('cribbage_state, hand_number')
        .eq('id', roundId)
        .single();

      if (error) {
        console.error('[CRIBBAGE] Error loading state:', error);
        setInitialLoadComplete(true);
        return;
      }

      console.log('[CRIBBAGE] Round data loaded:', { 
        hasState: !!roundData?.cribbage_state, 
        handNumber: roundData?.hand_number 
      });

      // If state already exists, use it (game already in progress or resumed)
      if (roundData?.cribbage_state) {
        console.log('[CRIBBAGE] Using existing state from DB');
        hasInitializedRef.current = true;
        setInitialLoadComplete(true);
        setCribbageState(roundData.cribbage_state as unknown as CribbageState);
        return;
      }

      // First hand of a new cribbage game - show high card selection
      // Mark load complete but show selection (don't set hasInitializedRef yet)
      const isFirstHand = !roundData?.hand_number || roundData.hand_number <= 1;
      
      if (isFirstHand) {
        console.log('[CRIBBAGE] First hand - starting high card selection');
        setShowHighCardSelection(true);
        setInitialLoadComplete(true);
        return;
      }

      // Not first hand but no state - initialize with session dealer
      console.log('[CRIBBAGE] Not first hand, initializing with session dealer');
      hasInitializedRef.current = true;
      setInitialLoadComplete(true);
      const dealerId = players.find(p => p.position === dealerPosition)?.id || players[0].id;
      const playerIds = players.map(p => p.id);
      const newState = initializeCribbageGame(playerIds, dealerId, anteAmount);
      
      await supabase
        .from('rounds')
        .update({ cribbage_state: JSON.parse(JSON.stringify(newState)) })
        .eq('id', roundId);
      
      setCribbageState(newState);
    };

    loadOrInitializeState();
  }, [roundId, initialLoadComplete]); // Re-run if roundId changes, include initialLoadComplete in deps

  // Keep showHighCardSelection from "sticking" after the real cribbage_state arrives (non-host clients)
  useEffect(() => {
    if (!showHighCardSelection) return;
    if (!cribbageState) return;
    setShowHighCardSelection(false);
    setHighCardAnnouncement(null);
  }, [showHighCardSelection, cribbageState]);

  // Subscribe to DB-synced dealer selection state so everyone sees the same animation
  useEffect(() => {
    if (!gameId) return;

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('dealer_selection_state')
        .eq('id', gameId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error('[CRIBBAGE] Failed to load dealer_selection_state:', error);
        return;
      }

      setHighCardSyncedState((data?.dealer_selection_state as unknown as DealerSelectionState) ?? null);
    };

    load();

    const channel = supabase
      .channel(`cribbage-dealer-selection-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const next = (payload.new as any)?.dealer_selection_state ?? null;
          setHighCardSyncedState(next as DealerSelectionState | null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Handle high card selection complete
  // NOTE: HighCardDealerSelection returns a winning *position* (seat), not a player id.
  const handleHighCardComplete = useCallback(async (winnerPosition: number) => {
    const winnerPlayer = players.find(p => p.position === winnerPosition);
    if (!winnerPlayer) {
      console.error('[CRIBBAGE] High card winner position not found:', winnerPosition);
      return;
    }

    console.log('[CRIBBAGE] High card winner:', { position: winnerPosition, playerId: winnerPlayer.id });

    // Non-host clients should NOT write state; they will receive cribbage_state via realtime.
    if (!isHost) return;

    setShowHighCardSelection(false);
    setHighCardAnnouncement(null);
    setInitialLoadComplete(true);

    // Initialize the game with the winner as dealer
    hasInitializedRef.current = true;
    const playerIds = players.map(p => p.id);
    const newState = initializeCribbageGame(playerIds, winnerPlayer.id, anteAmount);

    await supabase
      .from('rounds')
      .update({
        cribbage_state: JSON.parse(JSON.stringify(newState)),
        pot: 0,
        cards_dealt: 6,
      })
      .eq('id', roundId);

    // Persist dealt hands for privacy + rejoin
    await Promise.all(
      playerIds.map(async (playerId) => {
        const ps = newState.playerStates[playerId];
        if (!ps) return;
        const { error } = await supabase
          .from('player_cards')
          .upsert(
            {
              player_id: playerId,
              round_id: roundId,
              cards: ps.hand as any,
            },
            { onConflict: 'player_id,round_id' }
          );
        if (error) {
          console.error('[CRIBBAGE] Failed to persist player_cards:', playerId, error);
        }
      })
    );

    // Clear dealer selection state now that we have a real dealer + dealt state
    await supabase
      .from('games')
      .update({ dealer_selection_state: null })
      .eq('id', gameId);

    setCribbageState(newState);
  }, [players, anteAmount, roundId, isHost, gameId]);

  const getHighCardDisplayNameByPosition = useCallback((position: number) => {
    const player = players.find(p => p.position === position);
    if (!player) return `Seat ${position}`;
    return getDisplayName(players, player, player.profiles?.username || `Seat ${position}`);
  }, [players]);

  const toCribbageCard = useCallback((card: { suit: string; rank: string }): CribbageCard => {
    // High-card selection uses the shared cardUtils deck which encodes suits as symbols.
    // Cribbage UI expects word suits. Convert symbols → words for rendering.
    const suit = (() => {
      switch (card.suit) {
        case '♠':
          return 'spades';
        case '♥':
          return 'hearts';
        case '♦':
          return 'diamonds';
        case '♣':
          return 'clubs';
        default:
          return card.suit;
      }
    })();

    const rank = card.rank;
    const value =
      rank === 'A'
        ? 14
        : rank === 'K'
          ? 13
          : rank === 'Q'
            ? 12
            : rank === 'J'
              ? 11
              : parseInt(rank, 10);

    return {
      suit: suit as CribbageCard['suit'],
      rank: card.rank as CribbageCard['rank'],
      value: Number.isFinite(value) ? value : 0,
    };
  }, []);

  // Trigger win sequence when game completes
  const triggerWinSequence = useCallback((state: CribbageState) => {
    if (!state.winnerPlayerId || winSequenceFiredRef.current === roundId) return;
    winSequenceFiredRef.current = roundId;

    const winnerId = state.winnerPlayerId;
    const winnerPlayer = players.find(p => p.id === winnerId);
    const winnerName = winnerPlayer 
      ? getDisplayName(players, winnerPlayer, winnerPlayer.profiles?.username || 'Player')
      : 'Player';

    const multiplier = state.payoutMultiplier || 1;
    const loserIds = players.filter(p => p.id !== winnerId).map(p => p.id);
    const amountPerLoser = anteAmount * multiplier;
    const totalWinnings = amountPerLoser * loserIds.length;

    setWinSequenceData({
      winnerId,
      winnerName,
      multiplier,
      amountPerLoser,
      totalWinnings,
      loserIds,
    });

    // Fire confetti only for the winner
    if (currentPlayerId === winnerId) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'],
      });
    }

    // Start sequence - skunk overlay if applicable, otherwise straight to announcement
    if (multiplier >= 2) {
      setWinSequencePhase('skunk');
    } else {
      setWinSequencePhase('announcement');
    }
  }, [players, anteAmount, currentPlayerId, roundId]);

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
            
            // Trigger win sequence instead of immediate game complete
            if (newState.cribbage_state.phase === 'complete' && newState.cribbage_state.winnerPlayerId) {
              triggerWinSequence(newState.cribbage_state);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, triggerWinSequence]);

  // Also check for complete phase on initial load
  useEffect(() => {
    if (cribbageState?.phase === 'complete' && cribbageState.winnerPlayerId && winSequencePhase === 'idle') {
      triggerWinSequence(cribbageState);
    }
  }, [cribbageState?.phase, cribbageState?.winnerPlayerId, winSequencePhase, triggerWinSequence]);

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
    
    // Clear the animated score overrides so pegboard shows real scores again
    setCountingScoreOverrides(null);
    
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

  // Win sequence phase handlers
  const handleSkunkComplete = useCallback(() => {
    setWinSequencePhase('announcement');
  }, []);

  const handleAnnouncementComplete = useCallback(() => {
    // Compute chip animation positions
    if (!winSequenceData || !tableContainerRef.current) {
      setWinSequencePhase('complete');
      onGameComplete();
      return;
    }

    const container = tableContainerRef.current;
    const rect = container.getBoundingClientRect();

    // Winner position - find the winner player's chip stack position
    const winnerPlayer = players.find(p => p.id === winSequenceData.winnerId);
    const isWinnerCurrentPlayer = winnerPlayer?.user_id === currentUserId;

    // Calculate positions based on player layout
    // Winner at bottom center if current player, otherwise in opponent area
    const winnerPos = isWinnerCurrentPlayer
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 }
      : { x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 };

    // Loser positions
    const loserPositions = winSequenceData.loserIds.map((loserId, index) => {
      const loserPlayer = players.find(p => p.id === loserId);
      const isLoserCurrentPlayer = loserPlayer?.user_id === currentUserId;
      
      if (isLoserCurrentPlayer) {
        return {
          playerId: loserId,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height * 0.85,
        };
      }
      
      // Opponent positions - stack vertically on left side
      return {
        playerId: loserId,
        x: rect.left + rect.width * 0.15,
        y: rect.top + rect.height * (0.2 + index * 0.15),
      };
    });

    setChipAnimationTriggerId(`crib-win-${roundId}-${Date.now()}`);
    setWinSequencePhase('chips');
  }, [winSequenceData, players, currentUserId, onGameComplete, roundId]);

  const handleChipAnimationEnd = useCallback(() => {
    setWinSequencePhase('complete');
    // Small delay before transitioning to next game
    setTimeout(() => {
      onGameComplete();
    }, 500);
  }, [onGameComplete]);

  // Compute chip animation positions for render
  const chipAnimationPositions = useMemo(() => {
    if (!winSequenceData || !tableContainerRef.current) {
      return { winner: { x: 0, y: 0 }, losers: [] as { playerId: string; x: number; y: number }[] };
    }

    const container = tableContainerRef.current;
    const rect = container.getBoundingClientRect();

    const winnerPlayer = players.find(p => p.id === winSequenceData.winnerId);
    const isWinnerCurrentPlayer = winnerPlayer?.user_id === currentUserId;

    const winnerPos = isWinnerCurrentPlayer
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.85 }
      : { x: rect.left + rect.width * 0.15, y: rect.top + rect.height * 0.25 };

    const loserPositions = winSequenceData.loserIds.map((loserId, index) => {
      const loserPlayer = players.find(p => p.id === loserId);
      const isLoserCurrentPlayer = loserPlayer?.user_id === currentUserId;
      
      if (isLoserCurrentPlayer) {
        return {
          playerId: loserId,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height * 0.85,
        };
      }
      
      return {
        playerId: loserId,
        x: rect.left + rect.width * 0.15,
        y: rect.top + rect.height * (0.2 + index * 0.15),
      };
    });

    return { winner: winnerPos, losers: loserPositions };
  }, [winSequenceData, players, currentUserId]);

  // Show high card selection if needed (internal or external dealer selection mode)
  if (effectiveShowHighCardSelection) {
    const latestRoundNum = effectiveHighCardCards.length > 0
      ? Math.max(...effectiveHighCardCards.map(c => c.roundNumber))
      : 1;
    const visibleCards = effectiveHighCardCards
      .filter(c => c.roundNumber === latestRoundNum)
      .sort((a, b) => a.position - b.position);

    return (
      <div className="h-full flex flex-col overflow-hidden bg-background">
        {/* Felt Area for high card selection */}
        <div 
          className="relative flex items-center justify-center"
          style={{ 
            height: '55vh',
            minHeight: '300px'
          }}
        >
          <div className="absolute inset-0 bg-slate-200 z-0" />
          <div
            className="relative z-10"
            style={{
              width: 'min(90vw, calc(55vh - 32px))',
              height: 'min(90vw, calc(55vh - 32px))',
            }}
          >
            <div className="relative rounded-full overflow-hidden border-2 border-white/80 w-full h-full">
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

              {/* DB-synced high-card selection logic (renders nothing) - only run if NOT external mode */}
              {!isDealerSelection && (
                <HighCardDealerSelection
                  gameId={gameId}
                  players={players as any}
                  onComplete={handleHighCardComplete}
                  isHost={isHost}
                  allowBotDealers={true}
                  syncedState={highCardSyncedState}
                  onCardsUpdate={setHighCardCards}
                  onAnnouncementUpdate={(message, _isComplete) => setHighCardAnnouncement(message)}
                  onWinnerPositionUpdate={setHighCardWinnerPosition}
                />
              )}

              {/* Centered render of the current selection round */}
              <div className="absolute inset-0 flex items-center justify-center z-40">
                <div className="flex gap-4 items-end">
                  {visibleCards.map((dc) => {
                    const isWinner = dc.isWinner || (effectiveHighCardWinnerPosition !== null && dc.position === effectiveHighCardWinnerPosition);
                    const dim = dc.isDimmed;
                    return (
                      <div
                        key={`${dc.playerId}-${dc.roundNumber}`}
                        className={cn(
                          'flex flex-col items-center transition-all duration-300',
                          isWinner ? 'transform -translate-y-2 scale-110' : '',
                          dim ? 'opacity-50' : ''
                        )}
                      >
                        <div className={cn(isWinner ? 'ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' : '')}>
                          <CribbagePlayingCard card={toCribbageCard(dc.card as any)} size="md" />
                        </div>
                        <span className={cn('text-xs mt-1', isWinner ? 'text-poker-gold font-bold' : 'text-white/70')}>
                          {getHighCardDisplayNameByPosition(dc.position)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Announcement banner */}
        {effectiveHighCardAnnouncement && (
          <div className="bg-poker-gold/95 px-4 py-3 text-center">
            <p className="text-sm font-bold text-slate-900">{effectiveHighCardAnnouncement}</p>
          </div>
        )}

        {/* Tab section placeholder */}
        <div className="flex-1 bg-background" />
      </div>
    );
  }

  // Show loading only AFTER initial load attempt completes and still no state (not in external dealer selection mode)
  if (!isDealerSelection && (!initialLoadComplete || !cribbageState || !currentPlayerId)) {
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
      {/* Win Sequence Overlays - Portaled above everything */}
      {winSequencePhase === 'skunk' && winSequenceData && (
        <CribbageSkunkOverlay
          multiplier={winSequenceData.multiplier}
          onComplete={handleSkunkComplete}
        />
      )}

      {winSequencePhase === 'announcement' && winSequenceData && (
        <CribbageWinnerAnnouncement
          winnerName={winSequenceData.winnerName}
          multiplier={winSequenceData.multiplier}
          totalWinnings={winSequenceData.totalWinnings}
          onComplete={handleAnnouncementComplete}
        />
      )}

      {winSequencePhase === 'chips' && winSequenceData && (
        <CribbageChipTransferAnimation
          triggerId={chipAnimationTriggerId}
          amount={winSequenceData.amountPerLoser}
          winnerPosition={chipAnimationPositions.winner}
          loserPositions={chipAnimationPositions.losers}
          onAnimationEnd={handleChipAnimationEnd}
        />
      )}

      {/* Felt Area - Upper Section with circular table */}
      <div 
        ref={tableContainerRef}
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
              countingScoreOverrides={countingScoreOverrides ?? undefined}
            />

            {/* Counting Phase Overlay - delayed 2s to allow final pegging announcement */}
            {cribbageState.phase === 'counting' && !countingDelayActive && (
              <CribbageCountingPhase
                cribbageState={cribbageState}
                players={players}
                onCountingComplete={handleCountingComplete}
                cardBackColors={cardBackColors}
                onAnnouncementChange={handleCountingAnnouncementChange}
                onScoreUpdate={setCountingScoreOverrides}
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
          {activeTab === 'cards' && currentPlayer && !isTransitioning && (
            <CribbageMobileCardsTab
              key={currentHandKey} // Force remount on hand change to prevent stale card flash
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
