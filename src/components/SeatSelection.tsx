import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

interface Player {
  id: string;
  user_id: string;
  position: number;
  profiles?: {
    username: string;
  };
}

interface SeatSelectionProps {
  players: Player[];
  currentUserId: string;
  onSelectSeat: (position: number) => void;
}

export const SeatSelection = ({ players, currentUserId, onSelectSeat }: SeatSelectionProps) => {
  const maxSeats = 7;
  const occupiedPositions = new Set(players.filter(p => !p.profiles?.username?.startsWith('Bot')).map(p => p.position));
  const currentPlayer = players.find(p => p.user_id === currentUserId);

  // If player already has a seat, don't show selection
  if (currentPlayer && !currentPlayer.profiles?.username?.startsWith('Bot')) {
    return null;
  }

  const availableSeats = Array.from({ length: maxSeats }, (_, i) => i + 1).filter(
    pos => !occupiedPositions.has(pos)
  );

  if (availableSeats.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            All seats are taken. Waiting for an open seat...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Select Your Seat
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Choose an open seat to join the game. You'll start playing in the next round.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {Array.from({ length: maxSeats }, (_, i) => {
            const position = i + 1;
            const isOccupied = occupiedPositions.has(position);
            const occupyingPlayer = players.find(p => p.position === position);
            
            return (
              <Button
                key={position}
                variant={isOccupied ? "secondary" : "outline"}
                className="h-20 flex flex-col gap-1"
                disabled={isOccupied}
                onClick={() => !isOccupied && onSelectSeat(position)}
              >
                <span className="text-2xl font-bold">#{position}</span>
                {isOccupied ? (
                  <span className="text-xs truncate w-full text-center">
                    {occupyingPlayer?.profiles?.username || 'Taken'}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Open</span>
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};