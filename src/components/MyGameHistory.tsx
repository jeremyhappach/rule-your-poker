import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

// Format number with thousands separators
const formatWithCommas = (num: number): string => {
  return Math.abs(num).toLocaleString();
};

interface GameSession {
  id: string;
  name: string | null;
  status: string;
  created_at: string;
  chips: number;
  handsPlayed: number;
  real_money: boolean;
}

interface ChatMsg {
  id: string;
  message: string;
  created_at: string;
  username: string;
}

interface MyGameHistoryProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MyGameHistory = ({ userId, open, onOpenChange }: MyGameHistoryProps) => {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeFake, setIncludeFake] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchHistory();
    } else {
      setExpandedSessionId(null);
      setChatMessages([]);
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
          created_at,
          real_money
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
          real_money: p.games.real_money ?? false,
        });
      }
    });

    const sortedSessions = Array.from(sessionsMap.values())
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    setSessions(sortedSessions);
    setLoading(false);
  };

  const toggleChat = useCallback(async (sessionId: string) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      setChatMessages([]);
      return;
    }

    setExpandedSessionId(sessionId);
    setChatLoading(true);
    setChatMessages([]);

    // Fetch chat messages with profile usernames
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, message, created_at, user_id')
      .eq('game_id', sessionId)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      setChatMessages([]);
      setChatLoading(false);
      return;
    }

    // Batch-fetch usernames
    const userIds = [...new Set(data.map(m => m.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    const usernameMap = new Map<string, string>();
    profiles?.forEach(p => usernameMap.set(p.id, p.username));

    setChatMessages(data.map(m => ({
      id: m.id,
      message: m.message,
      created_at: m.created_at,
      username: usernameMap.get(m.user_id) || 'Unknown',
    })));
    setChatLoading(false);
  }, [expandedSessionId]);

  const filteredSessions = includeFake 
    ? sessions 
    : sessions.filter(s => s.real_money);

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

        <div className="flex items-center space-x-2 pb-2 border-b border-border/50">
          <Checkbox 
            id="include-fake" 
            checked={includeFake} 
            onCheckedChange={(checked) => setIncludeFake(checked === true)}
          />
          <Label htmlFor="include-fake" className="text-sm text-muted-foreground cursor-pointer">
            Include fake money games
          </Label>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {sessions.length === 0 ? 'No games played yet' : 'No real money games played yet'}
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-1.5">
              {filteredSessions.map((session) => {
                const isExpanded = expandedSessionId === session.id;
                return (
                  <div 
                    key={session.id}
                    className="rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate flex-1">
                          {session.name || `Game #${session.id.slice(0, 8)}`}
                          {session.real_money && <span className="text-green-400 ml-1">$</span>}
                        </div>
                        <div className={`text-sm font-bold whitespace-nowrap ${session.chips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {session.chips >= 0 ? '+' : '-'}{session.real_money ? '$' : ''}{formatWithCommas(session.chips)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(session.created_at), 'MMM d h:mma')}
                          </span>
                          {getStatusBadge(session.status)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {session.handsPlayed} hand{session.handsPlayed !== 1 ? 's' : ''}
                          </span>
                          <button
                            onClick={() => toggleChat(session.id)}
                            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <MessageCircle className="w-3 h-3" />
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border/50 px-2 py-1.5 max-h-[200px] overflow-y-auto">
                        {chatLoading ? (
                          <div className="text-[10px] text-muted-foreground text-center py-2">Loading chat...</div>
                        ) : chatMessages.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground text-center py-2">No chat messages</div>
                        ) : (
                          <div className="space-y-0.5">
                            {chatMessages.map((msg) => (
                              <div key={msg.id} className="text-[11px]">
                                <span className="font-semibold text-primary">{msg.username}</span>
                                <span className="text-muted-foreground mx-1">
                                  {format(new Date(msg.created_at), 'h:mm a')}
                                </span>
                                <span className="text-foreground">{msg.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
