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
import { SweepsPotAnimation } from "./SweepsPotAnimation";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { PlayerOptionsMenu } from "./PlayerOptionsMenu";

import { Card as CardType, evaluateHand, formatHandRank } from "@/lib/cardUtils";
import { getAggressionAbbreviation } from "@/lib/botAggression";
import { getBotAlias } from "@/lib/botAlias";
import { formatChipValue } from "@/lib/utils";
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
  created_at?: string;
  profiles?: {
    username: string;
    aggression_level?: string;
  };
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

interface ChatBubbleData {
  id: string;
  user_id: string;
  message: string;
  username?: string;
  expiresAt: number;
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
  isHost?: boolean; // Host can control players
  gameStatus?: string; // Game status for detecting new game start
  handContextId?: string | null; // Authoritative round id to hard-reset UI caches (prevents stale community/Chucky cards)
  dealerSetupMessage?: string | null; // Yellow announcement when another player is configuring game
  // Chat props
  chatBubbles?: ChatBubbleData[];
  onSendChat?: (message: string, imageFile?: File) => void;
  isChatSending?: boolean;
  getPositionForUserId?: (userId: string) => number | undefined;
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
  onRequestRefetch?: () => void; // NEW: callback to request parent to refetch
  onDebugProceed?: () => void; // DEBUG: manual proceed to next round
  onPlayerClick?: (player: Player) => void; // Host clicks player to control them
  onLeaveGameNow?: () => void; // Observer leave game
  isWaitingPhase?: boolean; // Hide pot display during waiting phase
  realMoney?: boolean; // Real money indicator
  revealAtShowdown?: boolean; // 3-5-7 reveal at showdown (secret reveal to players who stayed in rounds 1-2)
  // 3-5-7 win animation props
  threeFiveSevenWinnerId?: string | null;
  threeFiveSevenWinnerCards?: CardType[];
  winner357ShowCards?: boolean;
  // Holm pre-fold/pre-stay props
  holmPreFold?: boolean;
  holmPreStay?: boolean;
  onHolmPreFoldChange?: (checked: boolean) => void;
  onHolmPreStayChange?: (checked: boolean) => void;
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
  gameStatus,
  handContextId,
  dealerSetupMessage,
  chatBubbles = [],
  onSendChat,
  isChatSending = false,
  getPositionForUserId,
  onStay,
  onFold,
  onSelectSeat,
  onRequestRefetch,
  onDebugProceed,
  onPlayerClick,
  onLeaveGameNow,
  isWaitingPhase = false,
  realMoney = false,
  revealAtShowdown = false,
  threeFiveSevenWinnerId,
  threeFiveSevenWinnerCards = [],
  winner357ShowCards = false,
  holmPreFold = false,
  holmPreStay = false,
  onHolmPreFoldChange,
  onHolmPreStayChange,
}: GameTableProps) => {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  
  // DEBUG: Log community cards prop to diagnose rendering issues
  if (gameType === 'holm-game') {
    console.log('[GAME_TABLE] Community cards prop received:', {
      hasCommunityCards: !!communityCards,
      communityCardsLength: communityCards?.length,
      communityCardsRevealed,
      roundStatus
    });
  }
  
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
  
  // Track showdown state and CACHE CARDS during showdown to prevent flickering
  const showdownRoundRef = useRef<string | null>(null);
  const showdownCardsCache = useRef<Map<string, CardType[]>>(new Map());
  
  // Cache Chucky cards to persist through announcement phase
  const [cachedChuckyCards, setCachedChuckyCards] = useState<CardType[] | null>(null);
  const [cachedChuckyActive, setCachedChuckyActive] = useState<boolean>(false);
  const [cachedChuckyCardsRevealed, setCachedChuckyCardsRevealed] = useState<number>(0);

  // CRITICAL: When game type switches, clear any locally-held cards before paint to prevent stale flash.
  const prevGameTypeForClearRef = useRef(gameType);
  useLayoutEffect(() => {
    if (prevGameTypeForClearRef.current !== gameType) {
      console.log('[GAMETABLE] Game type changed -> clearing local cards/caches before paint', {
        prevType: prevGameTypeForClearRef.current,
        nextType: gameType,
      });
      setLocalPlayerCards([]);
      showdownCardsCache.current = new Map();
      showdownRoundRef.current = null;
      prevGameTypeForClearRef.current = gameType;
    }
  }, [gameType]);

  // AGGRESSIVE: When your player-hand round changes, hard-reset Chucky/showdown caches.
  const prevHandContextIdRef = useRef<string | null>(handContextId ?? null);
  useEffect(() => {
    const prev = prevHandContextIdRef.current;
    const next = handContextId ?? null;

    if (prev !== next) {
      console.error('[HAND_RESET][DESKTOP] Hand context changed -> clearing cached Chucky/showdown/local cards', {
        prev,
        next,
      });
      setCachedChuckyCards(null);
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0);
      showdownRoundRef.current = null;
      showdownCardsCache.current = new Map();
      setLocalPlayerCards([]);
      lastFetchedRoundIdRef.current = null;
    }

    prevHandContextIdRef.current = next;
  }, [handContextId]);
  
  // Compute showdown state synchronously during render
  // Count players who stayed for multi-player showdown detection
  const stayedPlayersCount = players.filter(p => p.current_decision === 'stay').length;
  const is357Round3MultiPlayerShowdown = gameType !== 'holm-game' && currentRound === 3 && allDecisionsIn && stayedPlayersCount >= 2;
  
  // 3-5-7 "secret reveal" for rounds 1 and 2: only players who stayed can see each other's cards
  const currentPlayerForSecretReveal = players.find(p => p.user_id === currentUserId);
  const currentPlayerStayed = currentPlayerForSecretReveal?.current_decision === 'stay';
  const is357SecretRevealActive = gameType !== 'holm-game' && 
    (currentRound === 1 || currentRound === 2) && 
    allDecisionsIn && 
    stayedPlayersCount >= 2 && 
    revealAtShowdown && 
    currentPlayerStayed;
  
  const isShowdownActive = (gameType === 'holm-game' && 
    (roundStatus === 'showdown' || roundStatus === 'completed' || communityCardsRevealed === 4 || allDecisionsIn)) ||
    is357Round3MultiPlayerShowdown ||
    is357SecretRevealActive;
  
  // Get current round ID for tracking
  const currentRoundId = realtimeRound?.id || null;
  
  // Clear showdown cache when:
  // 1. A new round starts (round ID changes)
  // 2. Round status resets to early phases
  // 3. awaitingNextRound becomes true (hand ended, transitioning to next)
  if (currentRoundId && showdownRoundRef.current !== null && showdownRoundRef.current !== currentRoundId) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
  }
  
  if (showdownRoundRef.current !== null && (roundStatus === 'pending' || roundStatus === 'ante' || awaitingNextRound)) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
  }
  
  // If showdown is active, cache cards for players who stayed
  if (isShowdownActive && currentRoundId) {
    if (showdownRoundRef.current === null) {
      showdownRoundRef.current = currentRoundId;
    }
    // Cache cards for stayed players during this showdown
    if (showdownRoundRef.current === currentRoundId) {
      players
        .filter(p => p.current_decision === 'stay')
        .forEach(p => {
          // Only cache if we have cards and haven't cached yet
          if (!showdownCardsCache.current.has(p.id)) {
            const playerCardData = localPlayerCards.find(pc => pc.player_id === p.id);
            if (playerCardData && playerCardData.cards.length > 0) {
              showdownCardsCache.current.set(p.id, [...playerCardData.cards]);
            }
          }
        });
    }
  }
  
  // Function to get cards for a player (use cache during showdown)
  const getPlayerCards = (playerId: string): CardType[] => {
    const liveCards = localPlayerCards.find(pc => pc.player_id === playerId)?.cards || [];

    // CRITICAL: Once cards are cached for this round, ALWAYS use cache
    // This prevents flickering when isShowdownActive temporarily becomes false
    if (showdownRoundRef.current === currentRoundId) {
      const cachedCards = showdownCardsCache.current.get(playerId);
      if (cachedCards && cachedCards.length > 0) {
        return cachedCards;
      }
    }
    return liveCards;
  };
  
  // Function to check if a player's cards should be shown
  const isPlayerCardsExposed = (playerId: string): boolean => {
    if (!currentRoundId) return false;
    // Cards are exposed if: we're in showdown round AND player has cached cards
    return showdownRoundRef.current === currentRoundId && showdownCardsCache.current.has(playerId);
  };
  
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
  
  // Cache Chucky cards when available, clear only when buck passes or new game starts
  useEffect(() => {
    if (gameType !== 'holm-game') return;
    
    // CRITICAL: Clear cached Chucky cards when a new game starts (dealer config phases)
    // This prevents old cards from the previous game showing up
    if (gameStatus === 'ante_decision' || gameStatus === 'configuring' || gameStatus === 'game_selection' || gameStatus === 'dealer_selection') {
      if (cachedChuckyCards && cachedChuckyCards.length > 0) {
        console.log('[GAMETABLE_CHUCKY] New game starting - clearing cached Chucky cards');
        setCachedChuckyCards(null);
        setCachedChuckyActive(false);
        setCachedChuckyCardsRevealed(0);
      }
      return;
    }
    
    // When buck passes (awaitingNextRound AND no result), clear cached Chucky data
    if (awaitingNextRound && !lastRoundResult) {
      console.log('[GAMETABLE_CHUCKY] Buck passed - clearing cached Chucky cards');
      setCachedChuckyCards(null);
      setCachedChuckyActive(false);
      setCachedChuckyCardsRevealed(0);
      return;
    }
    
    // Cache Chucky data when it's available
    if (chuckyActive && chuckyCards && chuckyCards.length > 0) {
      console.log('[GAMETABLE_CHUCKY] Caching Chucky cards:', chuckyCards.length);
      setCachedChuckyCards([...chuckyCards]);
      setCachedChuckyActive(true);
      setCachedChuckyCardsRevealed(chuckyCardsRevealed || 0);
    }
  }, [gameType, gameStatus, chuckyActive, chuckyCards, chuckyCardsRevealed, awaitingNextRound, lastRoundResult, cachedChuckyCards]);

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
  
  // 357 Sweeps pot animation state
  const [showSweepsPot, setShowSweepsPot] = useState(false);
  const [sweepsPlayerName, setSweepsPlayerName] = useState('');
  const lastSweepsResultRef = useRef<string | null>(null);
  
  // Track winning leg player for 3-5-7 card exposure (keep their cards visible until next game popup)
  const [winningLegPlayerId, setWinningLegPlayerId] = useState<string | null>(null);
  const playerLegsRef = useRef<Record<string, number>>({});
  
  // Detect when a player wins the final leg in 3-5-7 games - expose their cards
  useEffect(() => {
    if (gameType === 'holm-game') return;
    
    players.forEach(player => {
      const prevLegs = playerLegsRef.current[player.id] ?? 0;
      const currentLegs = player.legs;
      
      // Player won the final leg
      if (currentLegs >= legsToWin && prevLegs < legsToWin) {
        console.log('[GAMETABLE] 🏆 FINAL LEG WON - exposing cards for:', player.id);
        setWinningLegPlayerId(player.id);
      }
      playerLegsRef.current[player.id] = currentLegs;
    });
  }, [players, gameType, legsToWin]);
  
  // Clear winning leg player when game status changes to game_selection or configuring (next game starting)
  useEffect(() => {
    if (roundStatus === undefined || roundStatus === 'pending' || !allDecisionsIn) {
      // Game is resetting - clear the winning leg exposure
      if (winningLegPlayerId) {
        console.log('[GAMETABLE] Game resetting - clearing winning leg player exposure');
        setWinningLegPlayerId(null);
      }
    }
  }, [roundStatus, allDecisionsIn, winningLegPlayerId]);

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
  
  // Detect 357 sweep animation (3-5-7 games only)
  useEffect(() => {
    if (
      gameType !== 'holm-game' && 
      lastRoundResult && 
      lastRoundResult.startsWith('357_SWEEP:') &&
      lastRoundResult !== lastSweepsResultRef.current
    ) {
      const playerName = lastRoundResult.replace('357_SWEEP:', '');
      lastSweepsResultRef.current = lastRoundResult;
      setSweepsPlayerName(playerName);
      setShowSweepsPot(true);
    }
  }, [lastRoundResult, gameType]);
  
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
      {/* Observer settings menu - top left */}
      {isObserver && onLeaveGameNow && (
        <div className="absolute top-2 left-2 z-50">
          <PlayerOptionsMenu
            isSittingOut={false}
            isObserver={true}
            waiting={false}
            autoAnte={false}
            sitOutNextHand={false}
            standUpNextHand={false}
            onAutoAnteChange={() => {}}
            onSitOutNextHandChange={() => {}}
            onStandUpNextHandChange={() => {}}
            onStandUpNow={() => {}}
            onLeaveGameNow={onLeaveGameNow}
            variant="desktop"
          />
        </div>
      )}
      {/* Chat input - bottom right of table */}
      {onSendChat && (
        <div className="absolute bottom-2 right-2 z-50">
          <ChatInput onSend={onSendChat} isSending={isChatSending} />
        </div>
      )}
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
        
        {/* Game name on felt */}
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center">
          <span className="text-white/30 font-bold text-sm sm:text-base md:text-lg uppercase tracking-wider">
            {gameType === 'holm-game' ? 'Holm' : '3-5-7'}
          </span>
        </div>
        
        <div className="relative h-full">
          {/* Chopped Animation - when Chucky beats you */}
          <ChoppedAnimation show={showChopped} onComplete={() => setShowChopped(false)} />
          
          {/* 357 Sweeps Pot Animation */}
          <SweepsPotAnimation 
            show={showSweepsPot} 
            playerName={sweepsPlayerName} 
            onComplete={() => setShowSweepsPot(false)} 
          />
          
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
                  
                  {/* Pot - hide during waiting phase */}
                  {!isWaitingPhase && (
                    <div className="relative">
                      <div className="bg-poker-felt-dark/90 rounded-lg p-1.5 sm:p-2 md:p-3 backdrop-blur-sm border-2 border-poker-gold/30 shadow-2xl">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-[10px] sm:text-xs md:text-sm text-poker-gold/80 font-semibold">POT:</span>
                          <span className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-poker-gold drop-shadow-lg">${formatChipValue(pot)}</span>
                        </div>
                        <p className="text-[8px] sm:text-[10px] md:text-xs text-white/90 mt-0.5 font-semibold">Lose: ${formatChipValue(loseAmount)}</p>
                        {gameType && gameType !== 'holm-game' && (
                          <p className="text-[8px] sm:text-[10px] md:text-xs text-white/90 mt-0.5 font-semibold">{legsToWin} legs to win</p>
                        )}
                      </div>
                    </div>
                  )}
                  
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

          {/* 3-5-7 Winner's Tabled Cards - shown above pot during win animation */}
          {/* Rounds 1-2: Only table cards if winner clicked "Show Cards" (always face-up, with spin animation) */}
          {/* Round 3: Always table cards (face-down unless "Show Cards" clicked) */}
          {gameType !== 'holm-game' && threeFiveSevenWinnerId && 
           threeFiveSevenWinnerCards.length > 0 && 
           (currentRound === 3 || winner357ShowCards) && (
            <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1">
              <div
                className="flex flex-col items-center"
                style={{
                  animation:
                    currentRound !== 3 && winner357ShowCards
                      ? 'winner357TableSpinIn 1.4s cubic-bezier(0.25, 0.1, 0.25, 1) forwards'
                      : undefined,
                  willChange: 'transform, opacity',
                }}
              >
                <div className="flex gap-1">
                  <PlayerHand 
                    cards={threeFiveSevenWinnerCards} 
                    isHidden={currentRound === 3 ? !winner357ShowCards : false}
                    gameType={gameType}
                    currentRound={currentRound}
                    showSeparated={currentRound === 3}
                  />
                </div>
              </div>
              <style>{`
                @keyframes winner357TableSpinIn {
                  0% {
                    opacity: 0;
                    transform: translateY(200px) scale(0.3) rotate(0deg);
                  }
                  40% {
                    opacity: 1;
                    transform: translateY(80px) scale(0.7) rotate(270deg);
                  }
                  70% {
                    transform: translateY(25px) scale(0.9) rotate(540deg);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(0) scale(1) rotate(720deg);
                  }
                }
              `}</style>
            </div>
          )}

          {/* Community Cards for Holm Game - persist through announcement, hide when buck passes */}
          {/* Cards hide when awaitingNextRound AND lastRoundResult is cleared (buck just passed) */}
          {gameType === 'holm-game' && communityCards && communityCards.length > 0 && 
           !(awaitingNextRound && !lastRoundResult) && (
            <CommunityCards 
              cards={communityCards} 
              revealed={communityCardsRevealed || 2} 
            />
          )}

          {/* Chucky's Hand for Holm Game - use cached values to persist through announcement */}
          {gameType === 'holm-game' && cachedChuckyActive && cachedChuckyCards && (
            <ChuckyHand 
              cards={cachedChuckyCards}
              show={true}
              revealed={cachedChuckyCardsRevealed}
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
            
            // Get cards for this player - use getPlayerCards which handles showdown caching
            const rawCards = player ? getPlayerCards(player.id) : [];
            
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
                  {/* Chat bubbles above player */}
                  {getPositionForUserId && chatBubbles.length > 0 && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1">
                      {chatBubbles
                        .filter(b => getPositionForUserId(b.user_id) === player.position)
                        .map((bubble) => (
                          <ChatBubble
                            key={bubble.id}
                            username={bubble.username || 'Unknown'}
                            message={bubble.message}
                            expiresAt={bubble.expiresAt}
                          />
                        ))}
                    </div>
                  )}
                  <BuckIndicator show={gameType === 'holm-game' && buckPosition === player.position} />
                  <LegIndicator 
                    legs={gameType !== 'holm-game' ? player.legs : 0} 
                    maxLegs={legsToWin} 
                  />
                  
                  <Card className={`
                    ${isCurrentUser ? "border-poker-gold border-3 shadow-xl shadow-poker-gold/50" : "border-amber-800 border-2"} 
                    ${hasPlayerDecided ? "ring-2 ring-green-500 ring-offset-1 ring-offset-poker-felt" : ""}
                    ${playerDecision === 'fold' ? "opacity-40 brightness-50" : ""}
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
                    {/* Green glow ring removed - now using chip balance background color for stayed status */}
                  <CardContent className="p-1 sm:p-1.5 md:p-2 lg:p-3 text-center min-w-[70px] sm:min-w-[90px] md:min-w-[110px] lg:min-w-[130px] xl:min-w-[140px] max-w-[110px] sm:max-w-[130px] md:max-w-none">
                    <div className="space-y-0.5 sm:space-y-1 md:space-y-1.5">
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1 md:gap-1.5 relative">
                        <ChipChangeIndicator currentChips={player.chips} playerId={player.id} />
                        {/* Player name - no longer clickable, moved to chip balance */}
                        <p className="font-bold text-[9px] sm:text-[10px] md:text-xs text-amber-100 truncate max-w-[50px] sm:max-w-[70px] md:max-w-[90px] lg:max-w-[100px]">
                          {player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || `P${player.position}`)}
                          {player.is_bot && player.profiles?.aggression_level && (
                            <span className="text-purple-300 ml-0.5">
                              ({getAggressionAbbreviation(player.profiles.aggression_level)})
                            </span>
                          )}
                          {player.sitting_out && (
                            <span className="text-red-400">
                              {' '}(Out{player.sitting_out_hands !== undefined && player.sitting_out_hands > 0 
                                ? ` - ${14 - player.sitting_out_hands} left` 
                                : ''})
                            </span>
                          )}
                        </p>
                        {/* Hide dealer button during 3-5-7 round 3 multi-player showdown */}
                        {player.position === dealerPosition && !is357Round3MultiPlayerShowdown && (
                          <div className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 rounded-full bg-red-600 flex items-center justify-center border-2 border-white shadow-lg">
                            <span className="text-white font-black text-[7px] sm:text-[8px] md:text-[10px]">D</span>
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
                              {formatHandRank(evaluateHand(cards, true, (currentRound === 1 ? '3' : currentRound === 2 ? '5' : '7') as any).rank)}
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
                      <div className="flex justify-center min-h-[35px] sm:min-h-[45px] md:min-h-[55px] lg:min-h-[60px] items-center gap-1">
                        {/* Pre-decision checkboxes for Holm games - only for current user when not their turn */}
                        {(() => {
                          const buckIsAssignedCheck = buckPosition !== null && buckPosition !== undefined;
                          const roundIsReadyCheck = currentTurnPosition !== null && currentTurnPosition !== undefined;
                          const roundIsActiveCheck = roundStatus === 'betting';
                          const isPlayerTurnCheck = gameType === 'holm-game' && buckIsAssignedCheck && roundIsReadyCheck && roundIsActiveCheck && currentTurnPosition === player.position && !awaitingNextRound;
                          
                          // Compute if stay/fold buttons would be visible (canDecide equivalent)
                          const canDecideCheck = isCurrentUser && 
                            isPlayerTurnCheck && 
                            !hasPlayerDecided && 
                            player?.status === 'active' &&
                            !isPaused;
                          
                          // Show pre-decision checkboxes when stay/fold buttons NOT visible but player hasn't decided
                          const showPreDecisionCheckboxes = isCurrentUser && 
                            gameType === 'holm-game' && 
                            !canDecideCheck &&  // stay/fold buttons NOT visible
                            !hasPlayerDecided && 
                            roundStatus === 'betting' && 
                            cards.length > 0;
                          
                          if (!showPreDecisionCheckboxes) return null;
                          
                          return (
                            <div className="flex flex-col gap-0.5 mr-1">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={holmPreFold}
                                  onChange={(e) => {
                                    onHolmPreFoldChange?.(e.target.checked);
                                    if (e.target.checked) onHolmPreStayChange?.(false);
                                  }}
                                  className="w-3 h-3 rounded border border-red-500 accent-red-500"
                                />
                                <span className="text-[8px] font-medium text-red-500">Fold</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={holmPreStay}
                                  onChange={(e) => {
                                    onHolmPreStayChange?.(e.target.checked);
                                    if (e.target.checked) onHolmPreFoldChange?.(false);
                                  }}
                                  className="w-3 h-3 rounded border border-green-500 accent-green-500"
                                />
                                <span className="text-[8px] font-medium text-green-500">Stay</span>
                              </label>
                            </div>
                          );
                        })()}
                        
                        {(cards.length > 0 || shouldShowCardBacks) ? (
                          <PlayerHand 
                            cards={cards} 
                            expectedCardCount={expectedCardCount}
                            isHidden={
                              // Show cards if: 
                              // 1. It's the current user, OR
                              // 2. In Holm game, this player's cards have been exposed (tracked by ID), OR
                              // 3. In 3-5-7 game, this player won the final leg (cards stay visible during animation), OR
                              // 4. In 3-5-7 round 3 multi-player showdown, all stayed players' cards are exposed, OR
                              // 5. In 3-5-7 rounds 1-2, secret reveal: this player stayed AND viewing player stayed
                              !isCurrentUser && !(
                                (gameType === 'holm-game' && isPlayerCardsExposed(player.id)) ||
                                (gameType !== 'holm-game' && winningLegPlayerId === player.id) ||
                                (is357Round3MultiPlayerShowdown && isPlayerCardsExposed(player.id)) ||
                                (is357SecretRevealActive && playerDecision === 'stay' && isPlayerCardsExposed(player.id))
                              )
                            }
                            gameType={gameType}
                            currentRound={currentRound}
                            showSeparated={gameType !== 'holm-game' && currentRound === 3 && cards.length === 7}
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
                                    ${formatChipValue(player.chips)}
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
                              
                              {/* Chip balance (center) with status indicator - clickable for host */}
                              {(() => {
                                const isClickable = isHost && onPlayerClick && player && player.user_id !== currentUserId;
                                // Status-based background: light red for sitting out, yellow for waiting, 
                                // green for stayed, white for active (not stayed)
                                const getChipBgClass = () => {
                                  if (player?.sitting_out) return 'bg-red-400/50 ring-1 ring-red-400/40';
                                  if (player?.waiting) return 'bg-yellow-500/20 ring-1 ring-yellow-500/40';
                                  if (playerDecision === 'stay') return 'bg-green-400/50 ring-1 ring-green-500/40';
                                  return 'bg-white/30 ring-1 ring-white/40'; // Active but not stayed
                                };
                                return (
                                  <div 
                                    className={`flex items-center justify-center px-1.5 py-0.5 rounded ${getChipBgClass()} ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-amber-400 active:scale-95' : ''}`}
                                    onClick={isClickable ? () => onPlayerClick(player) : undefined}
                                  >
                                    <p className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold ${player?.chips && player.chips < 0 ? 'text-red-500' : 'text-poker-gold'}`}>
                                      ${formatChipValue(player?.chips || 0)}
                                    </p>
                                  </div>
                                );
                              })()}
                              
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
      
      {/* Result Message - displayed below the felt (hide for 357 sweep - animation handles it) */}
      {lastRoundResult && !lastRoundResult.startsWith('357_SWEEP:') && (
        awaitingNextRound || 
        roundStatus === 'completed' || 
        roundStatus === 'showdown' || 
        allDecisionsIn || 
        chuckyActive ||
        (gameType === 'holm-game' && lastRoundResult.includes(' has '))
      ) && (() => {
        // Parse debug data from result message (strip everything from first ||| for display)
        const displayMessage = lastRoundResult.split('|||')[0];
        
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
      
      {/* Dealer Setup Message - shown as yellow announcement when another player is configuring */}
      {dealerSetupMessage && (
        <div className="mt-4 flex justify-center">
          <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 shadow-2xl border-4 border-amber-900 max-w-2xl">
            <p className="text-slate-900 font-black text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-center drop-shadow-lg animate-pulse">
              {dealerSetupMessage}
            </p>
          </div>
        </div>
      )}
      
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
