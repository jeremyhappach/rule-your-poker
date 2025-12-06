import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { ChipChangeIndicator } from "./ChipChangeIndicator";
import { CommunityCards } from "./CommunityCards";
import { BuckIndicator } from "./BuckIndicator";
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
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
  onRequestRefetch?: () => void; // NEW: callback to request parent to refetch
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
  onStay,
  onFold,
  onSelectSeat,
  onRequestRefetch,
}: GameTableProps) => {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  
  // REALTIME ROUND SYNC: Subscribe directly to round changes for accurate state
  const [realtimeRound, setRealtimeRound] = useState<{
    round_number: number;
    cards_dealt: number;
    status: string;
  } | null>(null);
  
  // SELF-HEALING: Local card state that can be fetched directly if prop cards are missing
  const [localPlayerCards, setLocalPlayerCards] = useState<PlayerCards[]>([]);
  const lastFetchedRoundRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  
  // REALTIME ROUND SUBSCRIPTION: Get round updates directly
  useEffect(() => {
    if (!gameId) return;
    
    console.log('[GAMETABLE RT] Setting up round subscription for game:', gameId);
    
    // Initial fetch of current round
    const fetchCurrentRound = async () => {
      const { data } = await supabase
        .from('rounds')
        .select('round_number, cards_dealt, status')
        .eq('game_id', gameId)
        .order('round_number', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        console.log('[GAMETABLE RT] Initial round:', data);
        setRealtimeRound(data);
      }
    };
    
    fetchCurrentRound();
    
    // Subscribe to round changes for this game
    const channel = supabase
      .channel(`gametable-rounds-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('[GAMETABLE RT] Round change:', payload.eventType, payload.new);
          const newRound = payload.new as any;
          if (newRound && newRound.round_number) {
            setRealtimeRound({
              round_number: newRound.round_number,
              cards_dealt: newRound.cards_dealt,
              status: newRound.status
            });
            
            // Clear local cards when round changes to prevent stale rendering
            if (lastFetchedRoundRef.current !== newRound.round_number) {
              console.log('[GAMETABLE RT] Round changed, clearing local cards');
              setLocalPlayerCards([]);
              lastFetchedRoundRef.current = null;
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      console.log('[GAMETABLE RT] Cleaning up round subscription');
      supabase.removeChannel(channel);
    };
  }, [gameId]);
  
  // CRITICAL: Derive effective round from realtime data, falling back to props
  const effectiveRoundNumber = realtimeRound?.round_number ?? currentRound;
  const effectiveCardsDealt = realtimeRound?.cards_dealt ?? authoritativeCardCount;
  
  // Use prop cards if available, otherwise use locally fetched cards
  const playerCards = propPlayerCards.length > 0 ? propPlayerCards : localPlayerCards;
  
  // Self-healing: fetch cards directly if props are empty but should have cards
  const fetchCardsDirectly = useCallback(async () => {
    const roundToFetch = effectiveRoundNumber;
    if (!gameId || !roundToFetch || roundToFetch <= 0 || isFetchingRef.current) return;
    if (lastFetchedRoundRef.current === roundToFetch && localPlayerCards.length > 0) return;
    
    isFetchingRef.current = true;
    console.log('[GAMETABLE SELF-HEAL] Fetching cards directly for round:', roundToFetch);
    
    try {
      // Get the round ID for current round
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId)
        .eq('round_number', roundToFetch)
        .single();
      
      if (roundData) {
        const { data: cardsData } = await supabase
          .from('player_cards')
          .select('player_id, cards')
          .eq('round_id', roundData.id);
        
        if (cardsData && cardsData.length > 0) {
          console.log('[GAMETABLE SELF-HEAL] Got cards:', cardsData.length, 'players');
          setLocalPlayerCards(cardsData.map(cd => ({
            player_id: cd.player_id,
            cards: cd.cards as unknown as CardType[]
          })));
          lastFetchedRoundRef.current = roundToFetch;
        }
      }
    } catch (e) {
      console.error('[GAMETABLE SELF-HEAL] Error fetching cards:', e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [gameId, effectiveRoundNumber, localPlayerCards.length]);
  
  // Self-healing effect: if we have no cards but should, fetch them
  useEffect(() => {
    const currentPlayerForCheck = players.find(p => p.user_id === currentUserId);
    const shouldHaveCards = currentPlayerForCheck && 
                           !currentPlayerForCheck.sitting_out && 
                           effectiveRoundNumber > 0 && 
                           gameType;
    
    const hasCards = propPlayerCards.length > 0 || localPlayerCards.length > 0;
    
    if (shouldHaveCards && !hasCards && gameId) {
      console.log('[GAMETABLE SELF-HEAL] Missing cards, triggering fetch');
      fetchCardsDirectly();
      
      // Also request parent to refetch
      if (onRequestRefetch) {
        onRequestRefetch();
      }
    }
  }, [effectiveRoundNumber, propPlayerCards.length, localPlayerCards.length, players, currentUserId, gameId, gameType, fetchCardsDirectly, onRequestRefetch]);
  
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
  useEffect(() => {
    if (
      gameType === 'holm-game' && 
      lastRoundResult && 
      lastRoundResult.includes('Chucky beat') &&
      lastRoundResult !== lastChoppedResultRef.current &&
      currentUserId
    ) {
      // Check if current user was the one who lost by checking if their username is in the result
      const currentPlayer = players.find(p => p.user_id === currentUserId);
      const currentUsername = currentPlayer?.profiles?.username || '';
      
      // Show chopped animation if the current player's name is in the "Chucky beat X" message
      if (currentUsername && lastRoundResult.includes(`Chucky beat ${currentUsername}`)) {
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
  
  // Show seat selection for observers or sitting out players
  const canSelectSeat = onSelectSeat && (!currentPlayer || currentPlayer.sitting_out);
  
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
          
          {/* Result Message - displayed in center of table when available */}
          {/* Show during: awaiting next round, completed rounds, showdowns, all decisions in, 
              chucky active, or Holm hand description ("X has Y") */}
          {lastRoundResult && (
            awaitingNextRound || 
            roundStatus === 'completed' || 
            roundStatus === 'showdown' || 
            allDecisionsIn || 
            chuckyActive ||
            (gameType === 'holm-game' && lastRoundResult.includes(' has '))
          ) && (
            <div className={`absolute ${gameType === 'holm-game' ? 'bottom-4' : 'top-1/2 -translate-y-1/2'} left-1/2 transform -translate-x-1/2 z-30`}>
              <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 shadow-2xl border-4 border-amber-900 animate-pulse">
                <p className="text-slate-900 font-black text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl text-center whitespace-nowrap drop-shadow-lg">
                  {lastRoundResult}
                </p>
              </div>
            </div>
          )}

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
                  {timeLeft !== null && timeLeft >= 1 && !awaitingNextRound && !lastRoundResult && 
                   roundStatus !== 'completed' && (gameType === 'holm-game' ? true : !allDecisionsIn) && (
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
            const seatPosition = seat.position;
            const totalSeats = 7; // Max seats around table
            const angle = ((seatPosition - 1) / totalSeats) * 2 * Math.PI - Math.PI / 2;
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
            
            // For Holm, just check for 4 cards
            const isValidCardCountForHolm = rawCards.length === 4;
            
            // Determine if cards are valid based on game type
            let cardsAreValidForCurrentRound: boolean;
            if (gameType === 'holm-game') {
              cardsAreValidForCurrentRound = isValidCardCountForHolm;
            } else {
              // 3-5-7: STRICT match - only show cards if they match the realtime round's expected count
              cardsAreValidForCurrentRound = cardsMatchExpectedCount && effectiveRoundNumber > 0;
            }
            
            // Show cards ONLY when they match the current realtime round
            const shouldShowCards = player && !player.sitting_out && cardsAreValidForCurrentRound && rawCards.length > 0;
            
            // Final cards to display
            const cards: CardType[] = shouldShowCards ? rawCards : [];
            
            // Debug logging for card sync issues
            if (rawCards.length > 0 && !shouldShowCards) {
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
                        <p className="font-bold text-[9px] sm:text-[10px] md:text-xs text-amber-100 truncate max-w-[50px] sm:max-w-[70px] md:max-w-[90px] lg:max-w-[100px]">
                          {player.profiles?.username || (player.is_bot ? `Bot ${player.position}` : `P${player.position}`)}
                          {player.sitting_out && ' (Out)'}
                        </p>
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
                        {/* Legs indicator - only show for non-Holm games */}
                        {gameType && gameType !== 'holm-game' && (
                          <div className="flex items-center gap-0.5 bg-amber-900/30 px-0.5 sm:px-1 md:px-1.5 py-0.5 rounded border border-amber-700">
                            {player.legs === 0 ? (
                              <span className="text-amber-500/50 text-[7px] sm:text-[8px] md:text-[10px]">No legs</span>
                            ) : (
                              Array.from({ length: player.legs }).map((_, i) => (
                                <div key={i} className={player.legs === legsToWin - 1 ? "animate-pulse" : ""}>
                                  <ChipStack amount={legValue} size="sm" variant="leg" />
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        
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
                        {(cards.length > 0 || (shouldShowCards && expectedCardCount > 0)) ? (
                          <PlayerHand 
                            cards={cards} 
                            expectedCardCount={expectedCardCount}
                            isHidden={
                              // Show cards if: 
                              // 1. It's the current user, OR
                              // 2. In Holm game, round is in showdown/completed phase AND player stayed
                              !isCurrentUser && !(
                                gameType === 'holm-game' && 
                                (roundStatus === 'showdown' || roundStatus === 'completed' || communityCardsRevealed === 4) && 
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
                          const roundIsActive = roundStatus === 'betting' || roundStatus === 'active';
                          
                          const isPlayerTurn = gameType === 'holm-game' 
                            ? (buckIsAssigned && roundIsReady && roundIsActive && currentTurnPosition === player.position && !awaitingNextRound)
                            : true;
                          
                          const canDecide = isCurrentUser && !hasPlayerDecided && player.status === 'active' && !allDecisionsIn && isPlayerTurn && !isPaused;
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
                          
                          return (
                            <>
                              {/* Fold button (left) - shown when no decision or when fold is chosen */}
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
                              
                              {/* Chip balance (center) */}
                              <div className="flex items-center justify-center">
                                <p className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold ${player.chips < 0 ? 'text-red-500' : 'text-poker-gold'}`}>
                                  ${player.chips.toLocaleString()}
                                </p>
                              </div>
                              
                              {/* Stay button (right) - shown when no decision or when stay is chosen */}
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
    </div>
  );
};
