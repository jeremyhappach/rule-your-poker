import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { ChipChangeIndicator } from "./ChipChangeIndicator";
import { CommunityCards } from "./CommunityCards";
import { BuckIndicator } from "./BuckIndicator";
import { LegIndicator } from "./LegIndicator";
import { ChuckyHand } from "./ChuckyHand";
import { ChoppedAnimation } from "./ChoppedAnimation";
import { Card as CardType, evaluateHand, formatHandRank } from "@/lib/cardUtils";
import { useState, useMemo, useLayoutEffect, useEffect, useRef, useCallback } from "react";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { supabase } from "@/integrations/supabase/client";

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  current_decision: string | null;
  decision_locked: boolean | null;
  legs: number;
  is_bot: boolean;
  sitting_out: boolean;
  sitting_out_hands?: number;
  waiting?: boolean;
  profiles?: {
    username: string;
  };
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

interface GameTableProps {
  gameId?: string; // NEW: for self-healing card fetch
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  currentRound: number;
  allDecisionsIn: boolean;
  playerCards: PlayerCards[];
  authoritativeCardCount?: number; // From round.cards_dealt - bypasses state sync issues
  timeLeft: number | null;
  lastRoundResult: string | null;
  dealerPosition: number | null;
  legValue: number;
  legsToWin: number;
  potMaxEnabled: boolean;
  potMaxValue: number;
  pendingSessionEnd: boolean;
  awaitingNextRound: boolean;
  gameType?: string | null;
  communityCards?: CardType[];
  communityCardsRevealed?: number;
  buckPosition?: number | null;
  currentTurnPosition?: number | null;
  chuckyCards?: CardType[];
  chuckyActive?: boolean;
  chuckyCardsRevealed?: number;
  roundStatus?: string;
  pendingDecision?: 'stay' | 'fold' | null;
  isPaused?: boolean;
  debugHolmPaused?: boolean; // DEBUG: pause auto-progression for debugging
  isHost?: boolean; // Host can control bots
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
  onRequestRefetch?: () => void; // NEW: callback to request parent to refetch
  onDebugProceed?: () => void; // DEBUG: manual proceed to next round
  onBotClick?: (botPlayer: Player) => void; // Host clicks bot to control it
}

export const GameTable = ({
  gameId,
  players,
  currentUserId,
  pot,
  currentRound,
  allDecisionsIn,
  playerCards: propPlayerCards,
  authoritativeCardCount,
  timeLeft,
  lastRoundResult,
  dealerPosition,
  legValue,
  legsToWin,
  potMaxEnabled,
  potMaxValue,
  pendingSessionEnd,
  awaitingNextRound,
  gameType,
  communityCards,
  communityCardsRevealed,
  buckPosition,
  currentTurnPosition,
  chuckyCards,
  chuckyActive,
  chuckyCardsRevealed,
  roundStatus,
  pendingDecision,
  isPaused,
  debugHolmPaused,
  isHost,
  onStay,
  onFold,
  onSelectSeat,
  onRequestRefetch,
  onDebugProceed,
  onBotClick,
}: GameTableProps) => {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  
  // REALTIME ROUND SYNC: Subscribe directly to round changes - THIS IS THE SOURCE OF TRUTH
  const [realtimeRound, setRealtimeRound] = useState<{
    id: string;
    round_number: number;
    cards_dealt: number;
    status: string;
  } | null>(null);
  
  // LOCAL CARDS: GameTable owns card state - fetched AFTER round is confirmed
  const [localPlayerCards, setLocalPlayerCards] = useState<PlayerCards[]>([]);
  const lastFetchedRoundIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const realtimeRoundRef = useRef<typeof realtimeRound>(null); // Ref for async closures
  
  // CRITICAL: Track round reset hash (for Holm games where same round ID is reused)
  // This detects when round 2 is reset for a new hand by comparing key fields
  const lastRoundResetHashRef = useRef<string>('');
  
  // Keep ref in sync with state
  realtimeRoundRef.current = realtimeRound;
  
  // REALTIME ROUND SUBSCRIPTION: Get round updates directly - THEN fetch cards
  useEffect(() => {
    if (!gameId) return;
    
    console.log('[GAMETABLE RT] Setting up round subscription for game:', gameId);
    
    // Fetch cards for a specific round ID
    const fetchCardsForRound = async (roundId: string, roundNum: number, retryCount = 0) => {
      if (isFetchingRef.current && retryCount === 0) return;
      isFetchingRef.current = true;
      
      console.log('[GAMETABLE CARDS] Fetching cards for round:', roundNum, 'id:', roundId, 'retry:', retryCount);
      
      try {
        const { data: cardsData, error: cardsError } = await supabase
          .from('player_cards')
          .select('player_id, cards')
          .eq('round_id', roundId);
        
        console.log('[GAMETABLE CARDS] Query result for round', roundNum, ':', {
          roundId,
          cardsCount: cardsData?.length || 0,
          playerIds: cardsData?.map(c => c.player_id),
          error: cardsError?.message
        });
        
        if (cardsData && cardsData.length > 0) {
          console.log('[GAMETABLE CARDS] ✅ Got', cardsData.length, 'player cards for round', roundNum);
          
          // Map cards and validate card counts are appropriate
          const mappedCards = cardsData.map(cd => ({
            player_id: cd.player_id,
            cards: cd.cards as unknown as CardType[]
          }));
          
          // Log card counts for debugging
          console.log('[GAMETABLE CARDS] Card counts:', mappedCards.map(c => ({
            playerId: c.player_id,
            count: c.cards?.length
          })));
          
          setLocalPlayerCards(mappedCards);
          lastFetchedRoundIdRef.current = roundId;
          isFetchingRef.current = false;
        } else if (retryCount < 5) {
          console.log('[GAMETABLE CARDS] ⏳ No cards yet for round', roundNum, '- retry', retryCount + 1);
          // Retry after 200ms if no cards found (up to 5 retries = 1s max)
          setTimeout(() => {
            // Use ref to check current round (avoids stale closure)
            if (realtimeRoundRef.current?.id === roundId) {
              fetchCardsForRound(roundId, roundNum, retryCount + 1);
            } else {
              isFetchingRef.current = false;
            }
          }, 200);
        } else {
          console.log('[GAMETABLE CARDS] ❌ Gave up fetching cards after 5 retries');
          isFetchingRef.current = false;
        }
      } catch (e) {
        console.error('[GAMETABLE CARDS] Error:', e);
        isFetchingRef.current = false;
      }
    };
    
    // Fetch round and then cards atomically
    const fetchRoundAndCards = async () => {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id, round_number, cards_dealt, status')
        .eq('game_id', gameId)
        .order('round_number', { ascending: false })
        .limit(1)
        .single();
      
      if (roundData) {
        console.log('[GAMETABLE RT] Round synced:', roundData);
        setRealtimeRound(roundData);
        
        // NOW fetch cards for this confirmed round
        if (roundData.id !== lastFetchedRoundIdRef.current) {
          await fetchCardsForRound(roundData.id, roundData.round_number);
        }
      }
    };
    
    // Initial fetch
    fetchRoundAndCards();
    
    // Subscribe to round changes for this game
    const roundChannel = supabase
      .channel(`gametable-rounds-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`
        },
        async (payload) => {
          console.log('[GAMETABLE RT] Round change:', payload.eventType, payload.new);
          const newRound = payload.new as any;
          
          if (newRound?.id && newRound?.round_number) {
            // CRITICAL: Generate a hash to detect Holm round resets (same round ID, new hand)
            // In Holm games, round 2 is reused for each hand. We detect a new hand by:
            // - Status changing TO 'betting' (indicates fresh hand setup)
            // - community_cards changing (new cards dealt)
            // - chucky_active becoming false (reset from previous showdown)
            const communityCardsHash = JSON.stringify(newRound.community_cards || []);
            const roundResetHash = `${newRound.id}-${newRound.status}-${communityCardsHash}-${newRound.chucky_active}`;
            
            // Check if this is a round reset (same ID but different state = new Holm hand)
            const currentRealtimeRound = realtimeRoundRef.current;
            const isNewRoundId = !currentRealtimeRound || currentRealtimeRound.id !== newRound.id;
            const isRoundReset = lastRoundResetHashRef.current !== '' && 
                                 lastRoundResetHashRef.current !== roundResetHash &&
                                 newRound.status === 'betting'; // Only treat as reset when back to betting
            
            if (isNewRoundId || isRoundReset) {
              console.log('[GAMETABLE RT] 🔄 NEW ROUND/HAND DETECTED - clearing old cards', {
                isNewRoundId,
                isRoundReset,
                oldHash: lastRoundResetHashRef.current.slice(0, 50),
                newHash: roundResetHash.slice(0, 50)
              });
              setLocalPlayerCards([]);
              lastFetchedRoundIdRef.current = null;
            }
            
            // Update the reset hash
            lastRoundResetHashRef.current = roundResetHash;
            
            // Update round state
            setRealtimeRound({
              id: newRound.id,
              round_number: newRound.round_number,
              cards_dealt: newRound.cards_dealt,
              status: newRound.status
            });
            
            // Fetch cards for new round (with small delay to ensure cards are inserted)
            setTimeout(async () => {
              if (newRound.id !== lastFetchedRoundIdRef.current || isRoundReset) {
                await fetchCardsForRound(newRound.id, newRound.round_number);
              }
            }, 100);
          }
        }
      )
      .subscribe();
    
    // Also subscribe to player_cards for immediate card updates
    const cardsChannel = supabase
      .channel(`gametable-cards-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'player_cards'
        },
        async (payload) => {
          const newCard = payload.new as { round_id: string; player_id: string };
          const currentRoundData = realtimeRoundRef.current;
          
          // CRITICAL: Only process card inserts for the current round
          // This prevents race conditions where cards from different rounds get mixed
          if (currentRoundData?.id && newCard.round_id === currentRoundData.id) {
            console.log('[GAMETABLE RT] 🃏 Card INSERT for current round:', newCard.round_id);
            await fetchCardsForRound(currentRoundData.id, currentRoundData.round_number);
          } else {
            console.log('[GAMETABLE RT] ⚠️ Card INSERT for different round, ignoring:', {
              cardRoundId: newCard.round_id,
              currentRoundId: currentRoundData?.id
            });
          }
        }
      )
      .subscribe();
    
    return () => {
      console.log('[GAMETABLE RT] Cleaning up subscriptions');
      supabase.removeChannel(roundChannel);
      supabase.removeChannel(cardsChannel);
    };
  }, [gameId]);
  
  // CRITICAL: Re-fetch cards when allDecisionsIn becomes true
  // This is necessary because RLS policies allow access to other player cards during showdown
  const lastAllDecisionsInRef = useRef<boolean>(false);
  useEffect(() => {
    if (allDecisionsIn && !lastAllDecisionsInRef.current && gameId && realtimeRound?.id) {
      console.log('[GAMETABLE] 🃏 allDecisionsIn changed to true - re-fetching cards for showdown visibility');
      // Re-fetch cards so RLS allows us to see other player cards now
      const refetchCards = async () => {
        const { data: cardsData } = await supabase
          .from('player_cards')
          .select('player_id, cards')
          .eq('round_id', realtimeRound.id);
        
        if (cardsData && cardsData.length > 0) {
          console.log('[GAMETABLE] ✅ Re-fetched', cardsData.length, 'player cards for showdown');
          setLocalPlayerCards(cardsData.map(cd => ({
            player_id: cd.player_id,
            cards: cd.cards as unknown as CardType[]
          })));
        }
      };
      refetchCards();
    }
    lastAllDecisionsInRef.current = allDecisionsIn;
  }, [allDecisionsIn, gameId, realtimeRound?.id]);
  
  // CRITICAL: Derive effective round from realtime data (source of truth), falling back to props
  const effectiveRoundNumber = realtimeRound?.round_number ?? currentRound;
  const effectiveCardsDealt = realtimeRound?.cards_dealt ?? authoritativeCardCount;
  
  // USE LOCAL CARDS (fetched by GameTable) - only fallback to props if local is empty
  const playerCards = localPlayerCards.length > 0 ? localPlayerCards : propPlayerCards;
  
  // Find the current player's record
  const currentPlayerRecord = players.find(p => p.user_id === currentUserId);
  
  // CRITICAL: Check if player has VALID cards for current game type
  // For Holm: must have exactly 4 cards. For 3-5-7: must have 3, 5, or 7 cards matching round
  const currentPlayerCardsRecord = playerCards.find(pc => pc.player_id === currentPlayerRecord?.id);
  const currentPlayerCardCount = currentPlayerCardsRecord?.cards?.length ?? 0;
  
  const isValidCardCountForGameType = (() => {
    if (!currentPlayerCardsRecord || currentPlayerCardCount === 0) return false;
    if (gameType === 'holm-game') {
      // Holm requires exactly 4 cards
      return currentPlayerCardCount === 4;
    } else if (gameType === '3-5-7-game') {
      // 3-5-7 requires 3, 5, or 7 cards based on round
      return [3, 5, 7].includes(currentPlayerCardCount);
    }
    return currentPlayerCardCount > 0;
  })();
  
  const currentPlayerHasCards = currentPlayerRecord && isValidCardCountForGameType;
  
  console.log('[GAMETABLE] Card validation:', {
    gameType,
    currentPlayerCardCount,
    isValidCardCountForGameType,
    currentPlayerHasCards
  });
  
  // CRITICAL FIX: Self-healing card fetch for current user
  // If we're in a round but current user has no cards, aggressively poll until we get them
  const cardHealingRef = useRef<NodeJS.Timeout | null>(null);
  const lastGameTypeRef = useRef<string | undefined>(gameType);
  
  useEffect(() => {
    // Detect game type switch
    const gameTypeJustChanged = lastGameTypeRef.current !== gameType;
    if (gameTypeJustChanged) {
      console.log('[GAMETABLE HEAL] 🔄 Game type changed from', lastGameTypeRef.current, 'to', gameType);
      lastGameTypeRef.current = gameType;
    }
    
    // Only run healing if:
    // 1. We have a game ID
    // 2. We have a current player record
    // 3. Current player doesn't have cards (or has invalid card count for game type)
    // 4. Game appears to be active
    // 5. Player is not sitting out
    // EXPANDED CONDITIONS to catch edge cases on first hand of new game
    const gameIsActive = roundStatus === 'betting' || roundStatus === 'active' || roundStatus === 'showdown' || !awaitingNextRound;
    const roundIsActive = effectiveRoundNumber > 0 || currentRound > 0;
    // For Holm games specifically, also heal if we have no round data yet but game is in_progress
    const isHolmNeedingCards = gameType === 'holm-game' && !currentPlayerHasCards;
    const shouldHeal = 
      gameId &&
      currentPlayerRecord &&
      !currentPlayerHasCards &&
      (roundIsActive || gameIsActive || isHolmNeedingCards) &&
      !currentPlayerRecord.sitting_out;
    
    if (shouldHeal) {
      console.log('[GAMETABLE HEAL] 🚑 Current user missing cards - starting aggressive polling', {
        gameId,
        realtimeRoundId: realtimeRound?.id,
        currentRound,
        effectiveRoundNumber,
        currentPlayerRecordId: currentPlayerRecord.id
      });
      
      const healingPoll = async () => {
        if (!currentPlayerRecord) return;
        
        // First, ensure we have the round ID (fetch if needed)
        let roundId = realtimeRound?.id;
        
        if (!roundId && gameId) {
          console.log('[GAMETABLE HEAL] 🔍 No realtime round - fetching latest round...');
          const { data: roundData } = await supabase
            .from('rounds')
            .select('id, round_number, cards_dealt, status')
            .eq('game_id', gameId)
            .order('round_number', { ascending: false })
            .limit(1)
            .single();
          
          if (roundData) {
            console.log('[GAMETABLE HEAL] 📦 Found round:', roundData.id, 'number:', roundData.round_number);
            roundId = roundData.id;
            // Also update our realtime round state
            setRealtimeRound(roundData);
          }
        }
        
        if (!roundId) {
          console.log('[GAMETABLE HEAL] ❓ Still no round ID - skipping this poll');
          return;
        }
        
        console.log('[GAMETABLE HEAL] 🔄 Fetching cards for round:', roundId);
        
        const { data: cardsData, error } = await supabase
          .from('player_cards')
          .select('player_id, cards')
          .eq('round_id', roundId);
        
        if (error) {
          console.error('[GAMETABLE HEAL] ❌ Error:', error.message);
          return;
        }
        
        if (cardsData && cardsData.length > 0) {
          const hasCurrentUserCards = cardsData.some(c => c.player_id === currentPlayerRecord.id);
          console.log('[GAMETABLE HEAL] ✅ Got cards:', { count: cardsData.length, hasCurrentUserCards });
          
          if (hasCurrentUserCards) {
            // Validate card counts before accepting
            const currentUserCards = cardsData.find(c => c.player_id === currentPlayerRecord.id);
            const cardCount = (currentUserCards?.cards as any[])?.length || 0;
            
            // Use ref to get current game type (avoids stale closure)
            const currentGameType = lastGameTypeRef.current;
            
            // For Holm, only accept if we have exactly 4 cards
            // For 3-5-7, accept 3, 5, or 7 cards
            const isValidForHolm = currentGameType === 'holm-game' && cardCount === 4;
            const isValidFor357 = currentGameType === '3-5-7-game' && [3, 5, 7].includes(cardCount);
            const isValid = isValidForHolm || isValidFor357 || (!currentGameType);
            
            if (isValid) {
              console.log('[GAMETABLE HEAL] ✅ Valid card count for game type:', { currentGameType, cardCount });
              setLocalPlayerCards(cardsData.map(cd => ({
                player_id: cd.player_id,
                cards: cd.cards as unknown as CardType[]
              })));
              lastFetchedRoundIdRef.current = roundId;
              
              // Stop polling once we have valid cards
              if (cardHealingRef.current) {
                clearInterval(cardHealingRef.current);
                cardHealingRef.current = null;
              }
            } else {
              console.log('[GAMETABLE HEAL] ⚠️ Invalid card count for game type, continuing poll:', { currentGameType, cardCount });
            }
          }
        }
      };
      
      // Start polling every 300ms
      healingPoll(); // Immediate first attempt
      cardHealingRef.current = setInterval(healingPoll, 300);
      
      return () => {
        if (cardHealingRef.current) {
          clearInterval(cardHealingRef.current);
          cardHealingRef.current = null;
        }
      };
    } else if (cardHealingRef.current && currentPlayerHasCards) {
      // Stop polling if we got cards
      clearInterval(cardHealingRef.current);
      cardHealingRef.current = null;
    }
  }, [gameId, realtimeRound?.id, currentRound, currentPlayerRecord?.id, currentPlayerHasCards, effectiveRoundNumber, currentPlayerRecord?.sitting_out, gameType, roundStatus, awaitingNextRound]);
  
  // Debug: Log card sources
  console.log('[GAMETABLE] 🃏 Card sources:', {
    localCards: localPlayerCards.length,
    localCardPlayerIds: localPlayerCards.map(c => c.player_id),
    propCards: propPlayerCards.length,
    usingLocal: localPlayerCards.length > 0,
    currentUserId,
    currentPlayerRecordId: currentPlayerRecord?.id,
    currentPlayerHasCards,
    realtimeRound: realtimeRound?.round_number,
    // Critical: Check if current user's player.id is in the playerCards
    playerCardsMatchesCurrentUser: playerCards.some(pc => pc.player_id === currentPlayerRecord?.id),
    propRound: currentRound,
    effectiveRound: effectiveRoundNumber
  });
  
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const hasDecided = currentPlayer?.decision_locked || !!pendingDecision;
  
  // Stabilize radius calculation to prevent flickering during rapid re-renders
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  // Chopped animation state (when Chucky beats you in Holm)
  const [showChopped, setShowChopped] = useState(false);
  const lastChoppedResultRef = useRef<string | null>(null);
  
  useLayoutEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth(); // Set initial value
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);
  
  // Detect when Chucky wins against the current player in Holm game
  // Only show "YOU GOT CHOPPED" to the player who actually lost
  useEffect(() => {
    if (
      gameType === 'holm-game' && 
      lastRoundResult && 
      lastRoundResult !== lastChoppedResultRef.current &&
      currentUserId
    ) {
      // Get current player info
      const currentPlayer = players.find(p => p.user_id === currentUserId);
      const currentUsername = currentPlayer?.profiles?.username || '';
      
      // Skip if we don't have a valid username to check
      if (!currentUsername) {
        console.log('[CHOPPED] No username for current user, skipping check');
        return;
      }
      
      // Only show chopped if THIS player specifically lost to Chucky
      // Check for exact match: "Chucky beat {username}" - this is 1v1 loss
      const is1v1Loss = lastRoundResult.includes(`Chucky beat ${currentUsername} `);
      
      // Or in tie-breaker: check if username is in the losers list before "lose to Chucky"
      // Format: "Tie broken by Chucky! username1 and username2 lose to Chucky's..."
      const isTieBreakerLoss = lastRoundResult.includes('lose to Chucky') && 
        (lastRoundResult.includes(`${currentUsername} and `) || 
         lastRoundResult.includes(` and ${currentUsername} lose`) ||
         lastRoundResult.includes(`! ${currentUsername} lose`));
      
      console.log('[CHOPPED] Check - username:', currentUsername, 'result:', lastRoundResult, 'is1v1Loss:', is1v1Loss, 'isTieBreakerLoss:', isTieBreakerLoss);
      
      if (is1v1Loss || isTieBreakerLoss) {
        lastChoppedResultRef.current = lastRoundResult;
        setShowChopped(true);
      }
    }
  }, [lastRoundResult, gameType, players, currentUserId]);
  
  const radius = useMemo(() => {
    if (windowWidth < 480) return 32;
    if (windowWidth < 640) return 36;
    if (windowWidth < 1024) return 42;
    return 48;
  }, [windowWidth]);
  
  // Calculate the amount loser will pay: min of pot and pot max (if enabled)
  const loseAmount = potMaxEnabled ? Math.min(pot, potMaxValue) : pot;
  
  // Don't reorder players - just use them as-is since positions are calculated from seat.position
  // This prevents the array from changing order during rapid updates
  const occupiedPositions = new Set(players.map(p => p.position));
  
  // Calculate open seats (max 7 positions)
  const maxSeats = 7;
  const allPositions = Array.from({ length: maxSeats }, (_, i) => i + 1);
  const openSeats = allPositions.filter(pos => !occupiedPositions.has(pos));
  
  // Show seat selection ONLY for observers (users not in the players list at all)
  // Seated players (including sitting_out) cannot change seats
  const isObserver = !currentPlayerRecord;
  const canSelectSeat = onSelectSeat && isObserver;
  
  // Combine players and open seats for rendering - no reordering needed
  const seatsToRender = [...players, ...(canSelectSeat ? openSeats.map(pos => ({ position: pos, isEmpty: true })) : [])];

  // Show pot and timer when no result message is displayed
  const showPotAndTimer = !lastRoundResult || !awaitingNextRound;

  return (
    <div className="relative p-0.5 sm:p-1 md:p-2 lg:p-4 xl:p-8">
      {/* Poker Table - scale down on very small screens */}
      <div 
        className="relative rounded-[50%] aspect-[2/1] w-full max-w-5xl mx-auto p-1 sm:p-2 md:p-4 lg:p-8 xl:p-12 shadow-2xl border-2 sm:border-3 md:border-4 lg:border-6 xl:border-8 border-amber-900 scale-90 sm:scale-95 md:scale-100"
        style={{
          background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`
        }}
      >
        {/* Table edge wood effect */}
        <div className="absolute inset-0 rounded-[50%] shadow-inner" style={{
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.3), inset 0 0 20px rgba(0,0,0,0.5)'
        }} />
        <div className="relative h-full">
          {/* Chopped Animation - when Chucky beats you */}
          <ChoppedAnimation show={showChopped} onComplete={() => setShowChopped(false)} />
          
          {/* Result Message moved outside table - see below */}
          
          {/* Pot and Timer - shown when no result message */}
          {showPotAndTimer && (
            <>
              {/* Pot and Timer Container - game-type specific positioning */}
              {/* Holm: bottom of table (vertical stack), 3-5-7: center of table (horizontal) */}
              <div className={`absolute ${gameType === 'holm-game' ? 'bottom-0 pb-2' : 'top-1/2 -translate-y-1/2'} left-1/2 transform -translate-x-1/2 z-20`}>
                <div className={`flex ${gameType === 'holm-game' ? 'flex-col' : 'flex-row'} items-center justify-center gap-2 sm:gap-3 md:gap-4`}>
                  {/* Last Hand Warning - shown when session ending */}
                  {pendingSessionEnd && (
                    <div className="whitespace-nowrap">
                      <p className="text-red-500 font-bold text-[10px] sm:text-xs drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                        ⚠️ LAST HAND
                      </p>
                    </div>
                  )}
                  
                  {/* Pot */}
                  <div className="relative">
                    <div className="bg-poker-felt-dark/90 rounded-lg p-1.5 sm:p-2 md:p-3 backdrop-blur-sm border-2 border-poker-gold/30 shadow-2xl">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-[10px] sm:text-xs md:text-sm text-poker-gold/80 font-semibold">POT:</span>
                        <span className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-poker-gold drop-shadow-lg">${pot}</span>
                      </div>
                      <p className="text-[8px] sm:text-[10px] md:text-xs text-white/90 mt-0.5 font-semibold">Lose: ${loseAmount}</p>
                      {gameType && gameType !== 'holm-game' && (
                        <p className="text-[8px] sm:text-[10px] md:text-xs text-white/90 mt-0.5 font-semibold">{legsToWin} legs to win</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Timer - hide during transitions, results, showdowns, and when all decisions in */}
                  {/* For Holm games, show timer when round is betting and it's someone's turn */}
                  {timeLeft !== null && timeLeft >= 1 && !awaitingNextRound && !lastRoundResult && 
                   (gameType === 'holm-game' ? roundStatus === 'betting' : (roundStatus !== 'completed' && !allDecisionsIn)) && (
                    <div className="relative">
                      <div className={`bg-poker-felt-dark/90 rounded-lg p-1 sm:p-1.5 md:p-2 backdrop-blur-sm border-2 ${timeLeft <= 3 ? 'border-red-500 animate-pulse' : 'border-blue-500'} shadow-2xl`}>
                        <p className={`text-xl sm:text-2xl md:text-3xl font-black ${timeLeft <= 3 ? 'text-red-500' : 'text-white'} drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]`}>
                          {timeLeft}
                        </p>
                        <p className="text-[7px] sm:text-[8px] md:text-[10px] text-white/70">
                          sec
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Community Cards for Holm Game */}
          {gameType === 'holm-game' && communityCards && communityCards.length > 0 && (
            <CommunityCards 
              cards={communityCards} 
              revealed={communityCardsRevealed || 2} 
            />
          )}

          {/* Chucky's Hand for Holm Game - positioned below community cards, offset left */}
          {/* Keep Chucky visible during results announcement (awaitingNextRound) */}
          {gameType === 'holm-game' && chuckyActive && chuckyCards && (
            <ChuckyHand 
              cards={chuckyCards}
              show={true}
              revealed={chuckyCardsRevealed}
              x={48}
              y={62}
            />
          )}

          {/* Players and open seats around table */}
          {seatsToRender.map((seat) => {
            const isEmptySeat = 'isEmpty' in seat && seat.isEmpty;
            const player = !isEmptySeat ? seat as Player : null;
            const isCurrentUser = player?.user_id === currentUserId;
            const hasPlayerDecided = player?.decision_locked;
            // Always show current user's decision immediately, or all decisions when allDecisionsIn
            const playerDecision = (isCurrentUser || allDecisionsIn || gameType === 'holm-game') 
              ? player?.current_decision 
              : null;
            
            // In Holm game, buck just indicates who decides first, but all players can decide
            // Only show buck when round is fully initialized with turn position
            const roundIsReady = currentTurnPosition !== null && currentTurnPosition !== undefined;
            const hasBuck = gameType === 'holm-game' && buckPosition === player?.position && !awaitingNextRound && roundStatus !== 'completed' && roundIsReady;
            
            console.log('[GAME_TABLE] Buck check for position', player?.position, ':', {
              gameType,
              buckPosition,
              awaitingNextRound,
              roundStatus,
              currentTurnPosition,
              roundIsReady,
              hasBuck
            });
            
            // Use seat position (1-7) for stable angle calculation
            // CLOCKWISE direction: negate the angle to reverse direction
            const seatPosition = seat.position;
            const totalSeats = 7; // Max seats around table
            // Position 1 at top, increasing positions go CLOCKWISE (negative angle direction)
            const angle = -((seatPosition - 1) / totalSeats) * 2 * Math.PI - Math.PI / 2;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);
            
            // Get cards for this player
            const rawCards = player ? playerCards.find(pc => pc.player_id === player.id)?.cards || [] : [];
            
            // Calculate expected card count based on game type and round
            // Use realtime-derived round for accuracy
            const getExpectedCardCountForGameType = (gameTypeArg: string | null | undefined, round: number): number => {
              if (gameTypeArg === 'holm-game') {
                return 4; // Holm game always has 4 cards per player
              }
              // 3-5-7 game - calculate from round number
              if (round === 1) return 3;
              if (round === 2) return 5;
              if (round === 3) return 7;
              // Fallback: if round is invalid, try to infer from card count
              return 0;
            };
            
            // CRITICAL: Use effectiveRoundNumber from realtime subscription for accurate validation
            const expectedCardCount = getExpectedCardCountForGameType(gameType, effectiveRoundNumber);
            
            // CRITICAL: For 3-5-7, STRICTLY match card count to realtime round
            // This prevents rendering stale cards from previous rounds
            const cardsMatchExpectedCount = rawCards.length === expectedCardCount;
            
            // Determine if cards are valid based on game type
            let cardsAreValidForCurrentRound: boolean;
            if (gameType === 'holm-game') {
              // HOLM: Must have EXACTLY 4 cards - reject stale 3-5-7 data (3, 5, or 7 cards)
              // This prevents showing 7-card hands from previous 3-5-7 game
              const isValidHolmCardCount = rawCards.length === 4;
              if (isCurrentUser) {
                // Current user: show cards only if they have exactly 4 (Holm hand)
                cardsAreValidForCurrentRound = isValidHolmCardCount;
              } else {
                // For other players in Holm, also check for exactly 4 cards
                cardsAreValidForCurrentRound = isValidHolmCardCount;
              }
            } else {
              // 3-5-7: For current user, show their cards if count matches expected for round
              // This prevents stale cards from wrong round (e.g., 7 cards in round 1)
              if (isCurrentUser && rawCards.length > 0) {
                // Current user: show cards only if count matches expected for this round
                cardsAreValidForCurrentRound = cardsMatchExpectedCount && effectiveRoundNumber > 0;
              } else {
                // Other players: strict match (though RLS means this rarely matters)
                cardsAreValidForCurrentRound = cardsMatchExpectedCount && effectiveRoundNumber > 0;
              }
            }
            
            // Show cards ONLY when they match the current realtime round
            const hasValidCards = player && !player.sitting_out && cardsAreValidForCurrentRound && rawCards.length > 0;
            
            // Final cards to display (only for current user or when cards are available)
            const cards: CardType[] = hasValidCards ? rawCards : [];
            
            // Show card backs when:
            // - Player is not sitting out
            // - Round is active (effectiveRoundNumber > 0)  
            // - We expect cards to exist
            // - For current user: ONLY show card backs if we have valid cards (never show backs while loading own cards)
            // - For other players: show card backs even if their cards aren't fetched (RLS blocks them)
            const shouldShowCardBacks = player && 
              !player.sitting_out && 
              effectiveRoundNumber > 0 && 
              expectedCardCount > 0 &&
              // CRITICAL: Current user should NEVER see card backs for their own hand
              // If we don't have their cards yet, show nothing rather than card backs
              (!isCurrentUser || hasValidCards);
            
            // Debug logging for card sync issues
            if (isCurrentUser) {
              console.log('[GAMETABLE] Current user card check:', {
                playerId: player?.id,
                rawCardsCount: rawCards.length,
                playerCardsTotal: playerCards.length,
                playerCardIds: playerCards.map(pc => pc.player_id),
                expectedCardCount,
                effectiveRoundNumber,
                hasValidCards,
                cardsAreValidForCurrentRound
              });
            } else if (rawCards.length > 0 && !hasValidCards) {
              console.log('[GAMETABLE] Rejecting cards:', {
                playerId: player?.id,
                rawCardsCount: rawCards.length,
                expectedCardCount,
                effectiveRoundNumber,
                cardsAreValidForCurrentRound,
                gameType
              });
            }
            
            // Handle empty seat click
            if (isEmptySeat) {
              return (
                <div
                  key={`empty-${seat.position}`}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  onClick={() => onSelectSeat && onSelectSeat(seat.position)}
                >
                  <Card className="border-dashed border-2 border-amber-700/50 bg-gradient-to-br from-amber-900/20 to-amber-950/20 backdrop-blur-sm hover:border-amber-500 hover:bg-amber-900/30 transition-all duration-300">
                    <CardContent className="p-1 sm:p-1.5 md:p-2 lg:p-3 text-center min-w-[70px] sm:min-w-[90px] md:min-w-[110px] lg:min-w-[130px] xl:min-w-[140px] max-w-[110px] sm:max-w-[130px] md:max-w-none">
                      <div className="space-y-1 sm:space-y-1.5">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 mx-auto rounded-full bg-amber-900/30 flex items-center justify-center border-2 border-amber-700/50">
                          <span className="text-base sm:text-lg md:text-xl lg:text-2xl">💺</span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] md:text-xs text-amber-300/70 font-semibold">Open</p>
                        <p className="text-[8px] sm:text-[9px] md:text-[10px] text-amber-300/50">Click</p>
                        <Badge variant="outline" className="text-[8px] sm:text-[9px] md:text-[10px] border-amber-700/50 text-amber-300/70">
                          #{seat.position}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            }
            
            if (!player) return null;

            return (
              <div
                key={player.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <div className="relative">
                  <BuckIndicator show={gameType === 'holm-game' && buckPosition === player.position} />
                  <LegIndicator 
                    legs={gameType !== 'holm-game' ? player.legs : 0} 
                    maxLegs={legsToWin} 
                  />
                  
                  <Card className={`
                    ${isCurrentUser ? "border-poker-gold border-3 shadow-xl shadow-poker-gold/50" : "border-amber-800 border-2"} 
                    ${hasPlayerDecided ? "ring-2 ring-green-500 ring-offset-1 ring-offset-poker-felt" : ""}
                    ${playerDecision === 'fold' ? "opacity-40 brightness-50" : ""}
                    ${playerDecision === 'stay' ? "ring-[6px] ring-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)] brightness-110" : ""}
                    ${player.sitting_out ? "opacity-50 grayscale" : ""}
                    bg-gradient-to-br from-amber-900 to-amber-950 backdrop-blur-sm
                    transition-all duration-500
                  `}>
                    {/* Pulsing yellow border when it's your turn in Holm game */}
                    {gameType === 'holm-game' && 
                     isCurrentUser && 
                     currentTurnPosition === player.position && 
                     !awaitingNextRound && 
                     roundStatus !== 'completed' && 
                     !hasPlayerDecided && (
                      <div className="absolute inset-0 rounded-lg border-[6px] border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.9)] animate-pulse pointer-events-none" />
                    )}
                    {playerDecision === 'stay' && (
                      <div className="absolute inset-0 rounded-lg border-4 sm:border-[6px] border-green-500 animate-[pulse_3s_ease-in-out_infinite] pointer-events-none" />
                    )}
                  <CardContent className="p-1 sm:p-1.5 md:p-2 lg:p-3 text-center min-w-[70px] sm:min-w-[90px] md:min-w-[110px] lg:min-w-[130px] xl:min-w-[140px] max-w-[110px] sm:max-w-[130px] md:max-w-none">
                    <div className="space-y-0.5 sm:space-y-1 md:space-y-1.5">
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-1.5 relative">
                        <ChipChangeIndicator currentChips={player.chips} playerId={player.id} />
                        {/* Player name - clickable for host if it's a bot */}
                        {isHost && player.is_bot && onBotClick ? (
                          <button
                            onClick={() => onBotClick(player)}
                            className="font-bold text-[9px] sm:text-[10px] md:text-xs text-amber-100 truncate max-w-[50px] sm:max-w-[70px] md:max-w-[90px] lg:max-w-[100px] hover:text-amber-300 cursor-pointer underline underline-offset-2 decoration-dotted"
                          >
                            {player.profiles?.username || `Bot ${player.position}`}
                            {player.sitting_out && (
                              <span className="text-red-400">
                                {' '}(Out{player.sitting_out_hands !== undefined && player.sitting_out_hands > 0 
                                  ? ` - ${14 - player.sitting_out_hands} left` 
                                  : ''})
                              </span>
                            )}
                          </button>
                        ) : (
                          <p className="font-bold text-[9px] sm:text-[10px] md:text-xs text-amber-100 truncate max-w-[50px] sm:max-w-[70px] md:max-w-[90px] lg:max-w-[100px]">
                            {player.profiles?.username || (player.is_bot ? `Bot ${player.position}` : `P${player.position}`)}
                            {player.sitting_out && (
                              <span className="text-red-400">
                                {' '}(Out{player.sitting_out_hands !== undefined && player.sitting_out_hands > 0 
                                  ? ` - ${14 - player.sitting_out_hands} left` 
                                  : ''})
                              </span>
                            )}
                          </p>
                        )}
                        {player.position === dealerPosition && (
                          <div className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 rounded-full bg-poker-gold flex items-center justify-center border border-black shadow-lg">
                            <span className="text-black font-black text-[7px] sm:text-[8px] md:text-[10px]">D</span>
                          </div>
                        )}
                        {isCurrentUser && !player.is_bot && (
                          <Badge variant="secondary" className="text-[7px] sm:text-[8px] md:text-[10px] bg-poker-gold text-black border-0 px-0.5 py-0">You</Badge>
                        )}
                        {player.is_bot && (
                          <Badge className="text-[7px] sm:text-[8px] md:text-[10px] bg-purple-500 text-white border-0 px-0.5 py-0">🤖</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-2">
                        
                        {/* Hand evaluation hint - only for non-Holm games, hide during Chucky showdown */}
                        {/* For 3-5-7: use wildcards based on round (3s in R1, 5s in R2, 7s in R3) */}
                        {isCurrentUser && cards.length > 0 && gameType && gameType !== 'holm-game' && !chuckyActive && (
                          <div className="bg-poker-gold/20 px-0.5 sm:px-1 md:px-2 py-0.5 rounded border border-poker-gold/40">
                            <span className="text-poker-gold text-[7px] sm:text-[8px] md:text-[10px] font-bold">
                              {formatHandRank(evaluateHand(cards, true).rank)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-0.5 sm:gap-1 justify-center flex-wrap">
                        {/* Only show current user's decision status before all decisions lock */}
                        {isCurrentUser && hasPlayerDecided && !allDecisionsIn && (
                          <Badge className="text-[8px] sm:text-[10px] bg-green-500 text-white border-0 px-0.5 sm:px-1 py-0">✓</Badge>
                        )}
                        {/* Show all decisions only after all decisions are locked */}
                        {playerDecision === 'stay' && allDecisionsIn && (
                          <Badge className="text-[8px] sm:text-[10px] bg-green-500 text-white border-0 px-0.5 sm:px-1 py-0">In</Badge>
                        )}
                        {playerDecision === 'fold' && allDecisionsIn && (
                          <Badge variant="destructive" className="text-[8px] sm:text-[10px] px-0.5 sm:px-1 py-0">Out</Badge>
                        )}
                      </div>
                      <div className="flex justify-center min-h-[35px] sm:min-h-[45px] md:min-h-[55px] lg:min-h-[60px] items-center">
                        {(cards.length > 0 || shouldShowCardBacks) ? (
                          <PlayerHand 
                            cards={cards} 
                            expectedCardCount={expectedCardCount}
                            isHidden={
                              // Show cards if: 
                              // 1. It's the current user, OR
                              // 2. In Holm game, round is in showdown/completed phase AND player stayed, OR
                              // 3. allDecisionsIn is true and player stayed (showdown in progress)
                              !isCurrentUser && !(
                                gameType === 'holm-game' && 
                                (roundStatus === 'showdown' || roundStatus === 'completed' || communityCardsRevealed === 4 || allDecisionsIn) && 
                                playerDecision === 'stay'
                              )
                            }
                          />
                        ) : (
                          <div className="text-[7px] sm:text-[8px] md:text-[10px] text-amber-300/50">Wait...</div>
                        )}
                      </div>
                      
                      {/* Action buttons and chip stack row */}
                      <div className="flex items-center justify-between gap-0.5 sm:gap-1 md:gap-2 pt-0.5 sm:pt-1 md:pt-1.5 border-t border-amber-700">
                        {(() => {
                          // For Holm game, only show buttons when buck is assigned, it's the player's turn, and game is ready
                          const buckIsAssigned = buckPosition !== null && buckPosition !== undefined;
                          const roundIsReady = currentTurnPosition !== null && currentTurnPosition !== undefined;
                          // Round is active during 'betting' phase (not 'pending', 'showdown', or 'completed')
                          // Also allow undefined roundStatus as a fallback during game type transitions
                          const roundIsActive = roundStatus === 'betting' || roundStatus === 'active' || (roundStatus === undefined && roundIsReady);
                          
                          const isPlayerTurn = gameType === 'holm-game' 
                            ? (buckIsAssigned && roundIsReady && roundIsActive && currentTurnPosition === player.position && !awaitingNextRound)
                            : true; // 3-5-7 is simultaneous - all players can decide at once
                          
                          // For 3-5-7 games: show buttons if player hasn't decided, has cards, and round is active
                          const hasCards357 = gameType !== 'holm-game' && expectedCardCount > 0 && effectiveRoundNumber > 0;
                          
                          // For Holm: If it's player's turn, they should see buttons even if allDecisionsIn is stuck
                          // This handles edge case where allDecisionsIn=true but round is still betting
                          const holmPlayerCanDecide = gameType === 'holm-game' && 
                            isPlayerTurn && 
                            roundStatus === 'betting' && 
                            !hasPlayerDecided;
                          
                          const canDecide = isCurrentUser && 
                            !hasPlayerDecided && 
                            player.status === 'active' && 
                            (!allDecisionsIn || holmPlayerCanDecide) && 
                            isPlayerTurn && 
                            !isPaused &&
                            (gameType === 'holm-game' || hasCards357);
                          
                          // Debug log for 3-5-7 button visibility issues
                          if (gameType !== 'holm-game' && isCurrentUser) {
                            console.log('[GAMETABLE] 357 Button check:', {
                              position: player.position,
                              hasCards357,
                              expectedCardCount,
                              effectiveRoundNumber,
                              hasPlayerDecided,
                              allDecisionsIn,
                              isPaused,
                              canDecide
                            });
                          }
                          
                          const hasDecidedFold = isCurrentUser && (hasPlayerDecided && playerDecision === 'fold') || pendingDecision === 'fold';
                          const hasDecidedStay = isCurrentUser && (hasPlayerDecided && playerDecision === 'stay') || pendingDecision === 'stay';
                          
                          if (gameType === 'holm-game' && isCurrentUser) {
                            console.log('[GAME_TABLE] Decision buttons check for player position', player.position, ':', {
                              roundIsReady,
                              currentTurnPosition,
                              playerPosition: player.position,
                              canDecide,
                              hasDecidedFold,
                              hasDecidedStay
                            });
                          }
                          
                          // For 3-5-7: Show visual feedback when decision is made
                          const is357Game = gameType === '3-5-7-game';
                          const myDecision = pendingDecision || (hasPlayerDecided ? playerDecision : null);
                          // Show feedback while waiting for other players (before allDecisionsIn)
                          // OR even after allDecisionsIn if we have a pending decision (immediate feedback)
                          const showStayFeedback = is357Game && isCurrentUser && myDecision === 'stay' && (!allDecisionsIn || pendingDecision === 'stay');
                          const showFoldFeedback = is357Game && isCurrentUser && myDecision === 'fold' && (!allDecisionsIn || pendingDecision === 'fold');
                          
                          // Debug: Log 3-5-7 feedback state
                          if (is357Game && isCurrentUser) {
                            console.log('[357 FEEDBACK]', {
                              pendingDecision,
                              hasPlayerDecided,
                              playerDecision,
                              myDecision,
                              allDecisionsIn,
                              showStayFeedback,
                              showFoldFeedback
                            });
                          }
                          
                          // In 3-5-7, once you've decided, hide the other button and enlarge your choice
                          if (is357Game && isCurrentUser && (showStayFeedback || showFoldFeedback)) {
                            return (
                              <>
                                {/* Show enlarged DROPPED button if folded */}
                                {showFoldFeedback ? (
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    disabled
                                    className="text-[8px] sm:text-[10px] md:text-[12px] px-2 sm:px-3 py-1 h-auto scale-110 ring-2 ring-red-400 shadow-lg shadow-red-500/50"
                                  >
                                    ✓ DROPPED
                                  </Button>
                                ) : (
                                  <div className="w-6 sm:w-8 md:w-10 lg:w-12"></div>
                                )}
                                
                                {/* Chip balance (center) with status indicator */}
                                <div className={`flex items-center justify-center px-1.5 py-0.5 rounded ${
                                  player.sitting_out ? '' : player.waiting ? 'bg-yellow-500/20 ring-1 ring-yellow-500/40' : 'bg-green-500/20 ring-1 ring-green-500/40'
                                }`}>
                                  <p className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold ${player.chips < 0 ? 'text-red-500' : 'text-poker-gold'}`}>
                                    ${player.chips.toLocaleString()}
                                  </p>
                                </div>
                                
                                {/* Show enlarged STAYED button if stayed */}
                                {showStayFeedback ? (
                                  <Button 
                                    size="sm"
                                    disabled
                                    className="bg-poker-chip-green text-white text-[8px] sm:text-[10px] md:text-[12px] px-2 sm:px-3 py-1 h-auto scale-110 ring-2 ring-green-400 shadow-lg shadow-green-500/50"
                                  >
                                    ✓ STAYED
                                  </Button>
                                ) : (
                                  <div className="w-6 sm:w-8 md:w-10 lg:w-12"></div>
                                )}
                              </>
                            );
                          }
                          
                          // Default: show clickable buttons if canDecide
                          return (
                            <>
                              {/* Fold/Drop button (left) */}
                              {canDecide ? (
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={onFold}
                                  className="text-[7px] sm:text-[8px] md:text-[10px] px-1 sm:px-1.5 md:px-2 py-0.5 h-auto"
                                >
                                  {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                                </Button>
                              ) : (
                                <div className="w-6 sm:w-8 md:w-10 lg:w-12"></div>
                              )}
                              
                              {/* Chip balance (center) with status indicator */}
                              <div className={`flex items-center justify-center px-1.5 py-0.5 rounded ${
                                player.sitting_out ? '' : player.waiting ? 'bg-yellow-500/20 ring-1 ring-yellow-500/40' : 'bg-green-500/20 ring-1 ring-green-500/40'
                              }`}>
                                <p className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold ${player.chips < 0 ? 'text-red-500' : 'text-poker-gold'}`}>
                                  ${player.chips.toLocaleString()}
                                </p>
                              </div>
                              
                              {/* Stay button (right) */}
                              {canDecide ? (
                                <Button 
                                  size="sm"
                                  onClick={onStay}
                                  className="bg-poker-chip-green hover:bg-poker-chip-green/80 text-white text-[7px] sm:text-[8px] md:text-[10px] px-1 sm:px-1.5 md:px-2 py-0.5 h-auto"
                                >
                                  Stay
                                </Button>
                              ) : (
                                <div className="w-6 sm:w-8 md:w-10 lg:w-12"></div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Result Message - displayed below the felt */}
      {lastRoundResult && (
        awaitingNextRound || 
        roundStatus === 'completed' || 
        roundStatus === 'showdown' || 
        allDecisionsIn || 
        chuckyActive ||
        (gameType === 'holm-game' && lastRoundResult.includes(' has '))
      ) && (() => {
        // Parse debug data from result message (strip it for display)
        let displayMessage = lastRoundResult;
        
        if (lastRoundResult.includes('|||DEBUG:')) {
          const parts = lastRoundResult.split('|||DEBUG:');
          displayMessage = parts[0];
        }
        
        return (
          <div className="mt-4 flex justify-center">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 shadow-2xl border-4 border-amber-900 max-w-2xl">
              <p className="text-slate-900 font-black text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-center drop-shadow-lg animate-pulse">
                {displayMessage}
              </p>
            </div>
          </div>
        );
      })()}
      
      {/* Debug Panel - Outside game table, below */}
      {/* TEMPORARILY DISABLED - set SHOW_DEBUG_PANEL to true to re-enable */}
      {(() => {
        const SHOW_DEBUG_PANEL = false; // Set to true to show debug panel
        if (!SHOW_DEBUG_PANEL) return null;
        
        if (!lastRoundResult || !lastRoundResult.includes('|||DEBUG:')) return null;
        
        const parts = lastRoundResult.split('|||DEBUG:');
        const displayMessage = parts[0];
        let debugData: any = null;
        try {
          debugData = JSON.parse(parts[1]);
        } catch (e) {
          return null;
        }
        
        if (!debugData) return null;
        
        return (
          <div className="mt-4 mx-auto max-w-2xl bg-black/95 rounded-lg p-4 text-left text-xs font-mono border border-yellow-500 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <span className="text-yellow-400 font-bold text-sm">🔍 DEBUG INFO</span>
              <button
                onClick={() => {
                  let txt = `Result: ${displayMessage}\nRound: ${debugData.roundId}\nCommunity: ${debugData.communityCards}\n\n`;
                  debugData.evaluations?.forEach((e: any) => {
                    txt += `${e.name}${e.name === debugData.winnerName ? ' (WINNER)' : ''}\n`;
                    txt += `  ID: ${e.playerId}\n`;
                    txt += `  Cards (${e.cardCount || 0}): ${e.cards}\n`;
                    txt += `  Hand: ${e.handDesc}\n`;
                    txt += `  Value: ${e.value}${e.value === debugData.maxValue ? ' (MAX)' : ''}\n\n`;
                  });
                  navigator.clipboard.writeText(txt);
                }}
                className="text-yellow-400 text-xs border border-yellow-500 px-3 py-1 rounded hover:bg-yellow-500/20"
              >
                📋 Copy
              </button>
            </div>
            
            {/* Result message */}
            <div className="bg-poker-gold/20 border border-poker-gold rounded p-2 mb-3">
              <p className="text-poker-gold font-bold text-sm">{displayMessage}</p>
            </div>
            
            <p className="text-gray-300 mb-1">Round: <span className="text-white">{debugData.roundId?.substring(0, 8)}</span></p>
            <p className="text-gray-300 mb-3">Community: <span className="text-white">{debugData.communityCards}</span></p>
            
            {debugData.evaluations?.map((evalData: any, idx: number) => (
              <div 
                key={idx} 
                className={`p-2 rounded mb-2 ${evalData.name === debugData.winnerName ? 'bg-green-900/70 border border-green-500' : 'bg-gray-800/70 border border-gray-600'}`}
              >
                <p className="text-amber-300 font-bold">
                  {evalData.name} {evalData.name === debugData.winnerName && '👑'}
                </p>
                <p className="text-gray-400 text-[10px]">ID: {evalData.playerId?.substring(0, 8)}</p>
                <p className="text-white">Cards ({evalData.cardCount || 0}): {evalData.cards || '(empty)'}</p>
                <p className="text-cyan-400">Hand: {evalData.handDesc}</p>
                <p className={evalData.value === debugData.maxValue ? 'text-green-400' : 'text-red-400'}>
                  Value: {evalData.value} {evalData.value === debugData.maxValue && '(MAX)'}
                </p>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
};
