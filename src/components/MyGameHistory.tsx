import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface GameSession {
  id: string;
  name: string | null;
  status: string;
  created_at: string;
  chips: number;
  handsPlayed: number;
}

interface MyGameHistoryProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MyGameHistory = ({ userId, open, onOpenChange }: MyGameHistoryProps) => {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open, userId]);

  const fetchHistory = async () => {
    setLoading(true);
    
    // Get all games where this player participated
    const { data: playerData, error } = await supabase
      .from('players')
      .select(`
        id,
        chips,
        game_id,
        games (
          id,
          name,
          status,
          created_at
        )
      `)
      .eq('user_id', userId)
      .eq('is_bot', false);

    if (error) {
      console.error('Error fetching game history:', error);
      setLoading(false);
      return;
    }

    // Get player action counts for hands played
    const playerIds = playerData?.map(p => p.id) || [];
    const { data: actionCounts } = await supabase
      .from('player_actions')
      .select('player_id')
      .in('player_id', playerIds);

    // Count actions per player
    const actionCountMap = new Map<string, number>();
    actionCounts?.forEach((action: any) => {
      actionCountMap.set(action.player_id, (actionCountMap.get(action.player_id) || 0) + 1);
    });

    // Transform and dedupe by game_id, sort by date descending
    const sessionsMap = new Map<string, GameSession>();
    
    playerData?.forEach((p: any) => {
      if (p.games) {
        sessionsMap.set(p.games.id, {
          id: p.games.id,
          name: p.games.name,
          status: p.games.status,
          created_at: p.games.created_at,
          chips: p.chips,
          handsPlayed: actionCountMap.get(p.id) || 0,
        });
      }
    });

    const sortedSessions = Array.from(sessionsMap.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    setSessions(sortedSessions);
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const isActive = ['waiting', 'dealer_selection', 'game_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress', 'game_over'].includes(status);
    return (
      <Badge 
        variant={isActive ? 'default' : 'secondary'}
        className={`text-[10px] px-1.5 py-0 ${isActive 
          ? 'bg-green-600/80 text-white' 
          : 'bg-slate-600/50 text-slate-300'
        }`}
      >
        {status === 'session_ended' ? 'End' : status === 'waiting' ? 'Wait' : 'Live'}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>My Game History</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No games played yet</div>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-1.5">
              {sessions.map((session) => (
                <div 
                  key={session.id}
                  className="p-2 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate flex-1">
                      {session.name || `Game #${session.id.slice(0, 8)}`}
                    </div>
                    <div className={`text-sm font-bold whitespace-nowrap ${session.chips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {session.chips >= 0 ? '+' : ''}{session.chips}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(session.created_at), 'MMM d h:mma')}
                      </span>
                      {getStatusBadge(session.status)}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {session.handsPlayed} hand{session.handsPlayed !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};