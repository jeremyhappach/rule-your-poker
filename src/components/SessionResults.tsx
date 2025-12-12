import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

// Format number with thousands separators
const formatWithCommas = (num: number): string => {
  return Math.abs(num).toLocaleString();
};

interface SessionResultsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: string;
    created_at: string;
    session_ended_at: string;
    total_hands: number;
    host_username: string;
    players: Array<{
      username: string;
      chips: number;
      legs: number;
      is_bot: boolean;
    }>;
  };
}

export const SessionResults = ({ open, onOpenChange, session }: SessionResultsProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Session Results</DialogTitle>
        </DialogHeader>
        
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
                      {player.chips >= 0 ? '+' : '-'}${formatWithCommas(player.chips)}
                    </Badge>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
