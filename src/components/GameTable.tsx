import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { Card as CardType } from "@/lib/cardUtils";
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
  onStay,
  onFold,
}: GameTableProps) => {
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const hasDecided = currentPlayer?.decision_locked;

  return (
    <div className="relative p-8">
      {/* Green Felt Poker Table */}
      <div className="relative bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded-[50%] aspect-[2/1] max-w-5xl mx-auto p-12 shadow-2xl border-8 border-amber-900">
        {/* Table edge wood effect */}
        <div className="absolute inset-0 rounded-[50%] shadow-inner" style={{
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.3), inset 0 0 20px rgba(0,0,0,0.5)'
        }} />
        <div className="relative h-full">
          {/* Pot in center with chips */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="bg-poker-felt-dark/50 rounded-lg p-6 backdrop-blur-sm border-2 border-poker-gold/30 shadow-xl">
              <p className="text-sm text-poker-gold/80 font-semibold mb-2">POT</p>
              <div className="flex items-center justify-center gap-2 mb-2">
                <ChipStack amount={pot > 0 ? Math.min(pot, 100) : 0} size="lg" />
                <p className="text-4xl font-bold text-poker-gold drop-shadow-lg">{pot}</p>
              </div>
              <Badge className="mt-2 bg-poker-gold text-black border-0 shadow-lg">
                Round {currentRound} - {currentRound === 1 ? '3 Cards' : currentRound === 2 ? '5 Cards' : '7 Cards'}
              </Badge>
              <p className="text-sm text-white/90 mt-3 font-semibold">If you lose: pay 10 chips</p>
              {timeLeft !== null && timeLeft >= 0 && (
                <Badge className={`mt-2 ${timeLeft <= 3 ? 'bg-red-500 animate-pulse' : timeLeft === 0 ? 'bg-gray-500' : 'bg-blue-500'} text-white border-0 shadow-lg`}>
                  {allDecisionsIn ? 'Time\'s up!' : `Time: ${timeLeft}s`}
                </Badge>
              )}
            </div>
          </div>

          {/* Players around table */}
          {players.map((player, index) => {
            const isCurrentUser = player.user_id === currentUserId;
            const hasPlayerDecided = player.decision_locked;
            const playerDecision = allDecisionsIn ? player.current_decision : null;
            const angle = (index / players.length) * 2 * Math.PI - Math.PI / 2;
            const radius = 45;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);
            const cards = playerCards.find(pc => pc.player_id === player.id)?.cards || [];

            return (
              <div
                key={player.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-fade-in"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <Card className={`
                  ${isCurrentUser ? "border-poker-gold border-4 shadow-2xl shadow-poker-gold/50" : "border-amber-800 border-2"} 
                  ${hasPlayerDecided ? "ring-4 ring-green-500 ring-offset-2 ring-offset-poker-felt" : ""}
                  ${playerDecision === 'fold' ? "opacity-50" : ""}
                  bg-gradient-to-br from-amber-900 to-amber-950 backdrop-blur-sm
                `}>
                  <CardContent className="p-4 text-center min-w-[160px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2">
                        <p className="font-bold text-sm text-amber-100">
                          {player.profiles?.username || (player.is_bot ? `Bot ${index + 1}` : `P${index + 1}`)}
                        </p>
                        {player.is_bot && (
                          <Badge className="text-xs bg-purple-500 text-white border-0">🤖</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        {/* Legs indicator - show one chip per leg */}
                        <div className="flex items-center gap-1 bg-amber-900/30 px-2 py-1 rounded border border-amber-700">
                          {player.legs === 0 ? (
                            <span className="text-amber-500/50 text-xs">No legs</span>
                          ) : (
                            Array.from({ length: player.legs }).map((_, i) => (
                              <ChipStack key={i} amount={10} size="sm" />
                            ))
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 justify-center flex-wrap">
                        {isCurrentUser && !player.is_bot && (
                          <Badge variant="secondary" className="text-xs bg-poker-gold text-black border-0">You</Badge>
                        )}
                        {hasPlayerDecided && !allDecisionsIn && (
                          <Badge className="text-xs bg-green-500 text-white border-0">Decided ✓</Badge>
                        )}
                        {playerDecision === 'stay' && allDecisionsIn && (
                          <Badge className="text-xs bg-green-500 text-white border-0">Stayed</Badge>
                        )}
                        {playerDecision === 'fold' && allDecisionsIn && (
                          <Badge variant="destructive" className="text-xs">Folded</Badge>
                        )}
                        {player.status === 'folded' && (
                          <Badge variant="destructive" className="text-xs opacity-75">Out</Badge>
                        )}
                      </div>
                      <div className="flex justify-center min-h-[70px] items-center">
                        {cards.length > 0 ? (
                          <PlayerHand cards={cards} isHidden={!isCurrentUser && player.status !== 'folded'} />
                        ) : (
                          <div className="text-xs text-amber-300/50">Waiting...</div>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-2 border-t border-amber-700">
                        <ChipStack amount={Math.min(player.chips, 100)} />
                        <div>
                          <p className="text-xl font-bold text-poker-gold">{player.chips}</p>
                          <p className="text-xs text-amber-300/70">chips</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decision buttons */}
      {!hasDecided && currentPlayer?.status === 'active' && !allDecisionsIn && (
        <div className="mt-8 bg-gradient-to-br from-amber-900/50 to-amber-950/50 p-6 rounded-xl border-2 border-poker-gold/30 backdrop-blur-sm">
          <div className="text-center mb-4">
            <p className="text-amber-100 text-lg font-bold">Make your decision!</p>
            <p className="text-amber-300/70 text-sm">All players decide simultaneously</p>
            <p className="text-poker-gold text-sm mt-2">If you stay and lose, you'll pay 10 chips to the winner</p>
          </div>
          <div className="flex gap-4 justify-center">
            <Button 
              variant="destructive" 
              onClick={onFold} 
              className="font-bold shadow-lg text-lg px-8 py-6"
            >
              Fold
            </Button>
            <Button 
              onClick={onStay}
              disabled={(currentPlayer?.chips || 0) < 10}
              className="bg-poker-chip-green hover:bg-poker-chip-green/80 text-white font-bold shadow-lg text-lg px-8 py-6"
            >
              Stay
            </Button>
          </div>
        </div>
      )}

      {hasDecided && !allDecisionsIn && (
        <div className="text-center mt-8 bg-green-900/30 p-4 rounded-lg border border-green-500/40">
          <p className="text-green-200 font-semibold flex items-center justify-center gap-2">
            <span className="text-2xl">✓</span> Decision locked! Waiting for other players...
          </p>
        </div>
      )}

      {lastRoundResult && (
        <div className="text-center mt-8">
          <div className="bg-poker-gold/20 p-4 rounded-lg border-2 border-poker-gold/60">
            <p className="text-poker-gold font-bold text-xl">
              {lastRoundResult}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
