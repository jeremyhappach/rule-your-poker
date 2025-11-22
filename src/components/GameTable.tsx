import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayerHand } from "./PlayerHand";
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
    <div className="relative">
      {/* Game Table */}
      <div className="bg-muted/50 rounded-full aspect-[2/1] max-w-4xl mx-auto p-8 border-4 border-primary/20">
        <div className="relative h-full">
          {/* Pot in center */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <p className="text-sm text-muted-foreground">Pot</p>
            <p className="text-3xl font-bold">{pot}</p>
            <Badge className="mt-2">Round {currentRound} - {currentRound === 1 ? '3 Cards' : currentRound === 2 ? '5 Cards' : '7 Cards'}</Badge>
            {currentBet > 0 && (
              <p className="text-sm text-muted-foreground mt-2">Current Bet: {currentBet}</p>
            )}
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
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <Card className={`${isCurrentUser ? "border-primary border-2" : ""} ${isActivePlayer ? "ring-2 ring-primary" : ""}`}>
                  <CardContent className="p-4 text-center min-w-[140px]">
                    <div className="space-y-2">
                      <p className="font-semibold text-sm">
                        {player.profiles?.username || `P${index + 1}`}
                      </p>
                      <div className="flex gap-1 justify-center">
                        {isCurrentUser && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                        {isActivePlayer && (
                          <Badge variant="default" className="text-xs">Turn</Badge>
                        )}
                        {player.status === 'folded' && (
                          <Badge variant="destructive" className="text-xs">Folded</Badge>
                        )}
                      </div>
                      <div className="flex justify-center">
                        <PlayerHand cards={cards} isHidden={!isCurrentUser && player.status !== 'folded'} />
                      </div>
                      <p className="text-lg font-bold">{player.chips}</p>
                      <p className="text-xs text-muted-foreground">chips</p>
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
        <div className="space-y-4 mt-8">
          <div className="flex gap-4 justify-center items-center">
            <Input
              type="number"
              min={currentBet || 10}
              value={betAmount}
              onChange={(e) => setBetAmount(parseInt(e.target.value) || 0)}
              className="w-32"
            />
            <Button onClick={() => onBet(betAmount)} disabled={betAmount < (currentBet || 10) || betAmount > (currentPlayer?.chips || 0)}>
              {currentBet > 0 ? `Raise to ${betAmount}` : `Bet ${betAmount}`}
            </Button>
          </div>
          <div className="flex gap-4 justify-center">
            <Button variant="destructive" onClick={onFold}>
              Fold
            </Button>
            {currentBet > 0 && (
              <Button variant="outline" onClick={onCall} disabled={(currentPlayer?.chips || 0) < currentBet}>
                Call {currentBet}
              </Button>
            )}
          </div>
        </div>
      )}

      {!isCurrentPlayerTurn && (
        <div className="text-center mt-8">
          <p className="text-muted-foreground">
            Waiting for {players.find(p => p.position === currentPlayerPosition)?.profiles?.username || 'player'}...
          </p>
        </div>
      )}
    </div>
  );
};
