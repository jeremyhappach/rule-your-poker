import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { Card as CardType, evaluateHand, formatHandRank } from "@/lib/cardUtils";
import { useState } from "react";

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
  potMaxEnabled: boolean;
  potMaxValue: number;
  onStay: () => void;
  onFold: () => void;
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
  potMaxEnabled,
  potMaxValue,
  onStay,
  onFold,
}: GameTableProps) => {
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const hasDecided = currentPlayer?.decision_locked;
  
  // Calculate the amount loser will pay: min of pot and pot max (if enabled)
  const loseAmount = potMaxEnabled ? Math.min(pot, potMaxValue) : pot;
  
  // Reorder players so current user is always first (bottom position)
  const reorderedPlayers = currentPlayer 
    ? [currentPlayer, ...players.filter(p => p.user_id !== currentUserId)]
    : players;

  // Hide pot and timer when showing result message
  const showPotAndTimer = !lastRoundResult;

  return (
    <div className="relative p-8">
      {/* Green Felt Poker Table */}
      <div className="relative bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-[50%] aspect-[2/1] max-w-5xl mx-auto p-12 shadow-2xl border-8 border-amber-900">
        {/* Table edge wood effect */}
        <div className="absolute inset-0 rounded-[50%] shadow-inner" style={{
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.3), inset 0 0 20px rgba(0,0,0,0.5)'
        }} />
        <div className="relative h-full">
          {/* Result Message Flash - replaces pot and timer */}
          {lastRoundResult && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center z-30 animate-scale-in">
              <div className="bg-poker-gold/30 backdrop-blur-lg p-6 rounded-xl border-4 border-poker-gold shadow-2xl">
                <p className="text-poker-gold font-black text-2xl drop-shadow-lg">
                  {lastRoundResult}
                </p>
              </div>
            </div>
          )}
          
          {/* Pot and Timer - shown when no result message */}
          {showPotAndTimer && (
            <>
              {/* Pot in center */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -translate-x-20 text-center z-20">
                <div className="bg-poker-felt-dark/90 rounded-lg p-3 backdrop-blur-sm border-2 border-poker-gold/30 shadow-2xl">
                  <p className="text-xs text-poker-gold/80 font-semibold mb-1">POT</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-3xl font-bold text-poker-gold drop-shadow-lg">${pot}</p>
                  </div>
                  <Badge className="mt-1 bg-poker-gold text-black border-0 shadow-lg text-xs">
                    Round {currentRound} - {currentRound === 1 ? '3 Cards' : currentRound === 2 ? '5 Cards' : '7 Cards'}
                  </Badge>
                  <p className="text-xs text-white/90 mt-1 font-semibold">Lose: pay ${loseAmount}</p>
                </div>
              </div>
              
              {/* Timer beside pot */}
              {timeLeft !== null && timeLeft >= 0 && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 translate-x-20 text-center z-20">
                  <div className={`bg-poker-felt-dark/90 rounded-lg p-4 backdrop-blur-sm border-2 ${timeLeft <= 3 ? 'border-red-500 animate-pulse' : 'border-blue-500'} shadow-2xl`}>
                    <p className={`text-6xl font-black ${timeLeft <= 3 ? 'text-red-500' : 'text-white'} drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]`}>
                      {allDecisionsIn ? '⏰' : timeLeft}
                    </p>
                    <p className="text-xs text-white/70 mt-1">
                      {allDecisionsIn ? 'Time\'s up!' : 'seconds'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Players around table */}
          {reorderedPlayers.map((player, index) => {
            const isCurrentUser = player.user_id === currentUserId;
            const hasPlayerDecided = player.decision_locked;
            const playerDecision = allDecisionsIn ? player.current_decision : null;
            const angle = (index / reorderedPlayers.length) * 2 * Math.PI - Math.PI / 2;
            const radius = 48;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);
            
            // Get cards for this player
            const actualCards = playerCards.find(pc => pc.player_id === player.id)?.cards || [];
            const shouldShowCards = player.status !== 'folded' && !player.sitting_out;
            
            // Always get the cards to show card backs, visibility controlled by isHidden prop
            const cards = shouldShowCards ? actualCards : [];

            return (
              <div
                key={player.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-fade-in z-10"
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
                      <div className="absolute inset-0 rounded-lg border-[6px] border-green-500 animate-[pulse_3s_ease-in-out_infinite] pointer-events-none" />
                    )}
                  <CardContent className="p-3 text-center min-w-[140px]">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <p className="font-bold text-xs text-amber-100 truncate max-w-[100px]">
                          {player.profiles?.username || (player.is_bot ? `Bot ${index + 1}` : `P${index + 1}`)}
                          {player.sitting_out && ' (Sitting Out)'}
                        </p>
                        {player.position === dealerPosition && (
                          <div className="w-5 h-5 rounded-full bg-poker-gold flex items-center justify-center border-2 border-black shadow-lg">
                            <span className="text-black font-black text-[10px]">D</span>
                          </div>
                        )}
                        {isCurrentUser && !player.is_bot && (
                          <Badge variant="secondary" className="text-[10px] bg-poker-gold text-black border-0 px-1 py-0">You</Badge>
                        )}
                        {player.is_bot && (
                          <Badge className="text-[10px] bg-purple-500 text-white border-0 px-1 py-0">🤖</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        {/* Legs indicator - show chip per leg with configured value */}
                        <div className="flex items-center gap-0.5 bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-700">
                          {player.legs === 0 ? (
                            <span className="text-amber-500/50 text-[10px]">No legs</span>
                          ) : (
                            Array.from({ length: player.legs }).map((_, i) => (
                              <ChipStack key={i} amount={legValue} size="sm" variant="leg" />
                            ))
                          )}
                        </div>
                        
                        {/* Hand evaluation hint - only for current user */}
                        {isCurrentUser && cards.length > 0 && (
                          <div className="bg-poker-gold/20 px-2 py-0.5 rounded border border-poker-gold/40">
                            <span className="text-poker-gold text-[10px] font-bold">
                              {formatHandRank(evaluateHand(cards).rank)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 justify-center flex-wrap">
                        {/* Only show current user's decision status before all decisions lock */}
                        {isCurrentUser && hasPlayerDecided && !allDecisionsIn && (
                          <Badge className="text-[10px] bg-green-500 text-white border-0 px-1 py-0">✓</Badge>
                        )}
                        {/* Show all decisions only after all decisions are locked */}
                        {playerDecision === 'stay' && allDecisionsIn && (
                          <Badge className="text-[10px] bg-green-500 text-white border-0 px-1 py-0">In</Badge>
                        )}
                        {playerDecision === 'fold' && allDecisionsIn && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">Out</Badge>
                        )}
                      </div>
                      <div className="flex justify-center min-h-[60px] items-center">
                        {cards.length > 0 ? (
                          <PlayerHand cards={cards} isHidden={!isCurrentUser} />
                        ) : (
                          <div className="text-[10px] text-amber-300/50">Waiting...</div>
                        )}
                      </div>
                      
                      {/* Action buttons and chip stack row */}
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-amber-700">
                        {/* Fold button (left) */}
                        {isCurrentUser && !hasPlayerDecided && player.status === 'active' && !allDecisionsIn ? (
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={onFold}
                            className="text-[10px] px-2 py-1 h-auto"
                          >
                            Fold
                          </Button>
                        ) : (
                          <div className="w-12"></div>
                        )}
                        
                        {/* Chip balance (center) */}
                        <div className="flex items-center justify-center">
                          <p className={`text-lg font-bold ${player.chips < 0 ? 'text-red-500' : 'text-poker-gold'}`}>
                            ${player.chips}
                          </p>
                        </div>
                        
                        {/* Stay button (right) */}
                        {isCurrentUser && !hasPlayerDecided && player.status === 'active' && !allDecisionsIn ? (
                          <Button 
                            size="sm"
                            onClick={onStay}
                            className="bg-poker-chip-green hover:bg-poker-chip-green/80 text-white text-[10px] px-2 py-1 h-auto"
                          >
                            Stay
                          </Button>
                        ) : (
                          <div className="w-12"></div>
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

      {/* Status message */}
      {hasDecided && !allDecisionsIn && (
        <div className="text-center mt-8 bg-green-900/30 p-4 rounded-lg border border-green-500/40">
          <p className="text-green-200 font-semibold flex items-center justify-center gap-2">
            <span className="text-2xl">✓</span> Decision locked! Waiting for other players...
          </p>
        </div>
      )}

    </div>
  );
};
