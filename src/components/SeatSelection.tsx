import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Armchair } from "lucide-react";

interface Player {
  id: string;
  user_id: string;
  position: number;
  sitting_out?: boolean;
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
  const occupiedPositions = new Set(players.map(p => p.position));
  const currentPlayer = players.find(p => p.user_id === currentUserId);

  // Show seat selection for observers or sitting out players
  const shouldShowSelection = !currentPlayer || currentPlayer.sitting_out;

  if (!shouldShowSelection) {
    return null;
  }

  const availableSeats = Array.from({ length: maxSeats }, (_, i) => i + 1).filter(
    pos => !occupiedPositions.has(pos)
  );

  if (availableSeats.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Game Full - Observing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            All seats are taken. You're watching as an observer. A seat will open when someone leaves.
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
          {currentPlayer ? 
            "Choose an open seat to join the next round." : 
            "You're observing. Select a seat to join the game!"
          }
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {Array.from({ length: maxSeats }, (_, i) => {
            const position = i + 1;
            const isOccupied = occupiedPositions.has(position);
            const occupyingPlayer = players.find(p => p.position === position);
            
            return (
              <Button
                key={position}
                variant={isOccupied ? "secondary" : "default"}
                className="h-20 flex flex-col gap-1 relative"
                disabled={isOccupied}
                onClick={() => !isOccupied && onSelectSeat(position)}
              >
                {!isOccupied && (
                  <Armchair className="h-6 w-6 mb-1" />
                )}
                <span className="text-lg font-bold">#{position}</span>
                {isOccupied ? (
                  <span className="text-xs truncate w-full text-center">
                    {occupyingPlayer?.profiles?.username || 'Taken'}
                  </span>
                ) : (
                  <span className="text-xs">Open</span>
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};