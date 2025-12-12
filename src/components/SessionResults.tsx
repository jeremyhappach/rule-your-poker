import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatChipValue } from "@/lib/utils";

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
  const duration = session.session_ended_at 
    ? Math.round((new Date(session.session_ended_at).getTime() - new Date(session.created_at).getTime()) / (1000 * 60))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Session Results</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Host</p>
              <p className="font-semibold">{session.host_username}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total Hands</p>
              <p className="font-semibold">{session.total_hands}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Started</p>
              <p className="font-semibold">{format(new Date(session.created_at), 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Ended</p>
              <p className="font-semibold">{format(new Date(session.session_ended_at), 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div className="space-y-2 col-span-2">
              <p className="text-sm text-muted-foreground">Duration</p>
              <p className="font-semibold">{duration} minutes</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Player Results</h3>
            <div className="space-y-2">
              {session.players
                .sort((a, b) => b.chips - a.chips)
                .map((player, index) => (
                  <div 
                    key={player.username}
                    className={`flex justify-between items-center p-3 rounded border ${
                      index === 0 ? 'bg-primary/10 border-primary' : 'bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {index === 0 && <span className="text-xl">🏆</span>}
                      <span className={index === 0 ? 'font-bold' : ''}>
                        {player.username}
                        {player.is_bot && ' 🤖'}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <Badge variant="outline">
                        {player.legs} {player.legs === 1 ? 'leg' : 'legs'}
                      </Badge>
                      <Badge variant={player.chips >= 0 ? 'default' : 'destructive'}>
                        ${formatChipValue(player.chips)}
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
