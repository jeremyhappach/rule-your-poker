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
  currentPlayerPosition: number;
  currentBet: number;
  playerCards: PlayerCards[];
  onBet: (amount: number) => void;
  onFold: () => void;
  onCall: () => void;
}

export const GameTable = ({
  players,
  currentUserId,
  pot,
  currentRound,
  currentPlayerPosition,
  currentBet,
  playerCards,
  onBet,
  onFold,
  onCall,
}: GameTableProps) => {
  const [betAmount, setBetAmount] = useState(currentBet || 10);
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const isCurrentPlayerTurn = currentPlayer?.position === currentPlayerPosition;

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
              {currentBet > 0 && (
                <p className="text-sm text-white/90 mt-3 font-semibold">Current Bet: {currentBet}</p>
              )}
            </div>
          </div>

          {/* Players around table */}
          {players.map((player, index) => {
            const isCurrentUser = player.user_id === currentUserId;
            const isActivePlayer = player.position === currentPlayerPosition;
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
                  ${isActivePlayer ? "ring-4 ring-poker-gold ring-offset-2 ring-offset-poker-felt animate-pulse" : ""}
                  bg-gradient-to-br from-amber-900 to-amber-950 backdrop-blur-sm
                `}>
                  <CardContent className="p-4 text-center min-w-[160px]">
                    <div className="space-y-2">
                      <p className="font-bold text-sm text-amber-100">
                        {player.profiles?.username || `P${index + 1}`}
                      </p>
                      <div className="flex gap-1 justify-center flex-wrap">
                        {isCurrentUser && (
                          <Badge variant="secondary" className="text-xs bg-poker-gold text-black border-0">You</Badge>
                        )}
                        {isActivePlayer && (
                          <Badge className="text-xs bg-green-500 text-white border-0 animate-pulse">Turn</Badge>
                        )}
                        {player.status === 'folded' && (
                          <Badge variant="destructive" className="text-xs opacity-75">Folded</Badge>
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

      {/* Action buttons */}
      {isCurrentPlayerTurn && currentPlayer?.status === 'active' && (
        <div className="space-y-4 mt-8 bg-gradient-to-br from-amber-900/50 to-amber-950/50 p-6 rounded-xl border-2 border-poker-gold/30 backdrop-blur-sm">
          <div className="flex gap-4 justify-center items-center">
            <div className="flex items-center gap-2">
              <ChipStack amount={Math.min(betAmount, 100)} />
              <Input
                type="number"
                min={currentBet || 10}
                value={betAmount}
                onChange={(e) => setBetAmount(parseInt(e.target.value) || 0)}
                className="w-32 bg-amber-950/50 border-poker-gold/30 text-white"
              />
            </div>
            <Button 
              onClick={() => onBet(betAmount)} 
              disabled={betAmount < (currentBet || 10) || betAmount > (currentPlayer?.chips || 0)}
              className="bg-poker-chip-green hover:bg-poker-chip-green/80 text-white font-bold shadow-lg"
            >
              {currentBet > 0 ? `Raise to ${betAmount}` : `Bet ${betAmount}`}
            </Button>
          </div>
          <div className="flex gap-4 justify-center">
            <Button variant="destructive" onClick={onFold} className="font-bold shadow-lg">
              Fold
            </Button>
            {currentBet > 0 && (
              <Button 
                variant="outline" 
                onClick={onCall} 
                disabled={(currentPlayer?.chips || 0) < currentBet}
                className="bg-poker-chip-blue hover:bg-poker-chip-blue/80 text-white border-0 font-bold shadow-lg"
              >
                Call {currentBet}
              </Button>
            )}
          </div>
        </div>
      )}

      {!isCurrentPlayerTurn && (
        <div className="text-center mt-8 bg-amber-900/30 p-4 rounded-lg border border-poker-gold/20">
          <p className="text-amber-200 font-semibold">
            Waiting for {players.find(p => p.position === currentPlayerPosition)?.profiles?.username || 'player'}...
          </p>
        </div>
      )}
    </div>
  );
};
