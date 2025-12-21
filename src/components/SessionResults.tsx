import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, ChevronLeft } from "lucide-react";
import { HandHistory } from "./HandHistory";

// Format number with thousands separators
const formatWithCommas = (num: number): string => {
  return Math.abs(num).toLocaleString();
};

interface SessionResultsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: string;
    name?: string;
    created_at: string;
    session_ended_at: string;
    total_hands: number;
    host_username: string;
    real_money?: boolean;
    game_type?: string | null;
    players: Array<{
      id?: string;
      username: string;
      chips: number;
      legs: number;
      is_bot: boolean;
    }>;
  };
  currentUserId?: string;
}

export const SessionResults = ({ open, onOpenChange, session, currentUserId }: SessionResultsProps) => {
  const [showHistory, setShowHistory] = useState(false);
  
  // Find current user's player ID from the session players
  const currentPlayer = session.players.find(p => !p.is_bot);
  const currentPlayerId = currentPlayer?.id;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setShowHistory(false);
      }
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            {showHistory && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={() => setShowHistory(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {showHistory ? 'Hand History' : 'Session Results'}
            {session.real_money && <span className="text-green-400 ml-1">$</span>}
          </DialogTitle>
        </DialogHeader>
        
        {showHistory ? (
          <div className="min-h-[300px]">
            <HandHistory 
              gameId={session.id}
              currentUserId={currentUserId}
              currentPlayerId={currentPlayerId}
              gameType={session.game_type}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Host</p>
                <p className="font-medium truncate">{session.host_username}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hands</p>
                <p className="font-medium">{session.total_hands}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium">{format(new Date(session.created_at), 'MMM d')}</p>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-sm">Player Results</h3>
              <div className="space-y-1">
                {session.players
                  .sort((a, b) => b.chips - a.chips)
                  .map((player, index) => (
                    <div 
                      key={player.username}
                      className={`flex justify-between items-center px-2 py-1.5 rounded border text-sm ${
                        index === 0 ? 'bg-primary/10 border-primary' : 'bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {index === 0 && <span>🏆</span>}
                        <span className={index === 0 ? 'font-bold' : ''}>
                          {player.username}
                          {player.is_bot && ' 🤖'}
                        </span>
                      </div>
                      <Badge variant={player.chips >= 0 ? 'default' : 'destructive'} className="text-xs">
                        {player.chips >= 0 ? '+' : '-'}{session.real_money ? '$' : ''}{formatWithCommas(player.chips)}
                      </Badge>
                    </div>
                  ))}
              </div>
            </div>
            
            {/* View History Button */}
            {session.total_hands > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => setShowHistory(true)}
              >
                <Clock className="w-4 h-4 mr-2" />
                View Hand History
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
