import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

interface GameTableProps {
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  currentRound: number;
  onBet: () => void;
  onFold: () => void;
  onCall: () => void;
}

export const GameTable = ({
  players,
  currentUserId,
  pot,
  currentRound,
  onBet,
  onFold,
  onCall,
}: GameTableProps) => {
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const isCurrentPlayerTurn = currentPlayer?.position === 0; // Simplified turn logic

  return (
    <div className="relative">
      {/* Game Table */}
      <div className="bg-muted/50 rounded-full aspect-[2/1] max-w-4xl mx-auto p-8 border-4 border-primary/20">
        <div className="relative h-full">
          {/* Pot in center */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <p className="text-sm text-muted-foreground">Pot</p>
            <p className="text-3xl font-bold">{pot}</p>
            <Badge className="mt-2">Round {currentRound}</Badge>
          </div>

          {/* Players around table */}
          {players.map((player, index) => {
            const isCurrentUser = player.user_id === currentUserId;
            const angle = (index / players.length) * 2 * Math.PI - Math.PI / 2;
            const radius = 45;
            const x = 50 + radius * Math.cos(angle);
            const y = 50 + radius * Math.sin(angle);

            return (
              <div
                key={player.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <Card className={isCurrentUser ? "border-primary" : ""}>
                  <CardContent className="p-4 text-center min-w-[120px]">
                    <p className="font-semibold text-sm">
                      {player.profiles?.username || `P${index + 1}`}
                    </p>
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-xs mt-1">You</Badge>
                    )}
                    <p className="text-lg font-bold mt-2">{player.chips}</p>
                    <p className="text-xs text-muted-foreground">chips</p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      {isCurrentPlayerTurn && (
        <div className="flex gap-4 justify-center mt-8">
          <Button variant="destructive" onClick={onFold}>
            Fold
          </Button>
          <Button variant="outline" onClick={onCall}>
            Call
          </Button>
          <Button onClick={onBet}>
            Bet
          </Button>
        </div>
      )}

      {!isCurrentPlayerTurn && (
        <div className="text-center mt-8">
          <p className="text-muted-foreground">Waiting for other players...</p>
        </div>
      )}
    </div>
  );
};
