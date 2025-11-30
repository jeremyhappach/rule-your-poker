import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { ChipChangeIndicator } from "./ChipChangeIndicator";
import { Card as CardType, evaluateHand, formatHandRank } from "@/lib/cardUtils";
import { useState, useMemo, useLayoutEffect } from "react";

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
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  currentRound: number;
  allDecisionsIn: boolean;
  playerCards: PlayerCards[];
  timeLeft: number | null;
  lastRoundResult: string | null;
  dealerPosition: number | null;
  legValue: number;
  legsToWin: number;
  potMaxEnabled: boolean;
  potMaxValue: number;
  pendingSessionEnd: boolean;
  awaitingNextRound: boolean;
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
}

export const GameTable = ({
  players,
  currentUserId,
  pot,
  currentRound,
  allDecisionsIn,
  playerCards,
  timeLeft,
  lastRoundResult,
  dealerPosition,
  legValue,
  legsToWin,
  potMaxEnabled,
  potMaxValue,
  pendingSessionEnd,
  awaitingNextRound,
  onStay,
  onFold,
  onSelectSeat,
}: GameTableProps) => {
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const hasDecided = currentPlayer?.decision_locked;
  
  // Stabilize radius calculation to prevent flickering during rapid re-renders
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  useLayoutEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth(); // Set initial value
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);
  
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

  // Hide pot and timer when showing result message
  const showPotAndTimer = !lastRoundResult;

  return (
    <div className="relative p-0.5 sm:p-1 md:p-2 lg:p-4 xl:p-8">
      {/* Green Felt Poker Table - scale down on very small screens */}
      <div className="relative bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-[50%] aspect-[2/1] w-full max-w-5xl mx-auto p-1 sm:p-2 md:p-4 lg:p-8 xl:p-12 shadow-2xl border-2 sm:border-3 md:border-4 lg:border-6 xl:border-8 border-amber-900 scale-90 sm:scale-95 md:scale-100">
        {/* Table edge wood effect */}
        <div className="absolute inset-0 rounded-[50%] shadow-inner" style={{
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.3), inset 0 0 20px rgba(0,0,0,0.5)'
        }} />
        <div className="relative h-full">
          {/* Result Message Flash - replaces pot and timer */}
          {lastRoundResult && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center z-30 w-[90%] max-w-md">
              <div className="bg-poker-gold/30 backdrop-blur-lg p-3 sm:p-4 md:p-6 rounded-xl border-2 sm:border-3 md:border-4 border-poker-gold shadow-2xl">
                <p className="text-poker-gold font-black text-sm sm:text-lg md:text-2xl drop-shadow-lg">
                  {lastRoundResult}
                </p>
              </div>
            </div>
          )}
          
          {/* Pot and Timer - shown when no result message */}
          {showPotAndTimer && (
            <>
              {/* Pot and Timer Container - stack on small screens, side-by-side on larger */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 md:gap-4 lg:gap-6">
                  {/* Pot */}
                  <div className="relative">
                    {/* Last Hand Warning - shown when session ending */}
                    {pendingSessionEnd && (
                      <div className="absolute -top-5 sm:-top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                        <p className="text-red-500 font-bold text-[10px] sm:text-xs drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                          ⚠️ LAST HAND
                        </p>
                      </div>
                    )}
                    <div className="bg-poker-felt-dark/90 rounded-lg p-1.5 sm:p-2 md:p-3 backdrop-blur-sm border-2 border-poker-gold/30 shadow-2xl">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-[10px] sm:text-xs md:text-sm text-poker-gold/80 font-semibold">POT:</span>
                        <span className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-poker-gold drop-shadow-lg">${pot}</span>
                      </div>
                      <p className="text-[8px] sm:text-[10px] md:text-xs text-white/90 mt-0.5 sm:mt-1 font-semibold">{legsToWin} legs to win</p>
                      <p className="text-[8px] sm:text-[10px] md:text-xs text-white/90 mt-0.5 font-semibold">Stay and Lose: ${loseAmount}</p>
                    </div>
                  </div>
                  
                  {/* Timer - hide during transitions, results, and when all decisions in */}
                  {timeLeft !== null && timeLeft > 0 && !awaitingNextRound && !lastRoundResult && !allDecisionsIn && (
                    <div className="relative">
                      <div className={`bg-poker-felt-dark/90 rounded-lg p-1.5 sm:p-2 md:p-3 lg:p-4 backdrop-blur-sm border-2 ${timeLeft <= 3 ? 'border-red-500 animate-pulse' : 'border-blue-500'} shadow-2xl`}>
                        <p className={`text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-black ${timeLeft <= 3 ? 'text-red-500' : 'text-white'} drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]`}>
                          {timeLeft}
                        </p>
                        <p className="text-[8px] sm:text-[10px] md:text-xs text-white/70 mt-0.5 sm:mt-1">
                          sec
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Players and open seats around table */}
          {seatsToRender.map((seat) => {
            const isEmptySeat = 'isEmpty' in seat && seat.isEmpty;
            const player = !isEmptySeat ? seat as Player : null;
            const isCurrentUser = player?.user_id === currentUserId;
            const hasPlayerDecided = player?.decision_locked;
            const playerDecision = allDecisionsIn ? player?.current_decision : null;
            
            // Use seat position (1-7) for stable angle calculation
            const seatPosition = seat.position;
            const totalSeats = 7; // Max seats around table
            const angle = ((seatPosition - 1) / totalSeats) * 2 * Math.PI - Math.PI / 2;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);
            
            // Get cards for this player
            const actualCards = player ? playerCards.find(pc => pc.player_id === player.id)?.cards || [] : [];
            // Show card backs for all players during active round, regardless of fold status
            // Only hide cards completely if sitting out or game is not in active decision phase
            const shouldShowCards = player && !player.sitting_out && currentRound > 0;
            
            // Show actual cards or card backs based on shouldShowCards
            const cards = shouldShowCards ? actualCards : [];
            
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
                <Card className={`
                  ${isCurrentUser ? "border-poker-gold border-3 shadow-xl shadow-poker-gold/50" : "border-amber-800 border-2"} 
                  ${hasPlayerDecided ? "ring-2 ring-green-500 ring-offset-1 ring-offset-poker-felt" : ""}
                  ${playerDecision === 'fold' ? "opacity-40 brightness-50" : ""}
                  ${playerDecision === 'stay' ? "ring-[6px] ring-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)] brightness-110" : ""}
                  ${player.sitting_out ? "opacity-50 grayscale" : ""}
                  bg-gradient-to-br from-amber-900 to-amber-950 backdrop-blur-sm
                  transition-all duration-500
                `}>
                  <div className="relative">
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
                        {/* Legs indicator - show chip per leg with configured value */}
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
                        
                        {/* Hand evaluation hint - only for current user */}
                        {isCurrentUser && cards.length > 0 && (
                          <div className="bg-poker-gold/20 px-0.5 sm:px-1 md:px-2 py-0.5 rounded border border-poker-gold/40">
                            <span className="text-poker-gold text-[7px] sm:text-[8px] md:text-[10px] font-bold">
                              {formatHandRank(evaluateHand(cards).rank)}
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
                        {cards.length > 0 ? (
                          <PlayerHand cards={cards} isHidden={!isCurrentUser} />
                        ) : (
                          <div className="text-[7px] sm:text-[8px] md:text-[10px] text-amber-300/50">Wait...</div>
                        )}
                      </div>
                      
                      {/* Action buttons and chip stack row */}
                      <div className="flex items-center justify-between gap-0.5 sm:gap-1 md:gap-2 pt-0.5 sm:pt-1 md:pt-1.5 border-t border-amber-700">
                        {/* Fold button (left) */}
                        {isCurrentUser && !hasPlayerDecided && player.status === 'active' && !allDecisionsIn ? (
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={onFold}
                            className="text-[7px] sm:text-[8px] md:text-[10px] px-1 sm:px-1.5 md:px-2 py-0.5 h-auto"
                          >
                            Drop
                          </Button>
                        ) : (
                          <div className="w-6 sm:w-8 md:w-10 lg:w-12"></div>
                        )}
                        
                        {/* Chip balance (center) */}
                        <div className="flex items-center justify-center">
                          <p className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold ${player.chips < 0 ? 'text-red-500' : 'text-poker-gold'}`}>
                            ${player.chips}
                          </p>
                        </div>
                        
                        {/* Stay button (right) */}
                        {isCurrentUser && !hasPlayerDecided && player.status === 'active' && !allDecisionsIn ? (
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
                      </div>
                    </div>
                  </CardContent>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>


    </div>
  );
};
