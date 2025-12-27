import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, ChevronLeft } from "lucide-react";
import { HandHistory } from "./HandHistory";
import { supabase } from "@/integrations/supabase/client";
import { getBotAlias } from "@/lib/botAlias";

// Format number with thousands separators
const formatWithCommas = (num: number): string => {
  return Math.abs(num).toLocaleString();
};

interface PlayerResult {
  id?: string;
  username: string;
  chips: number;
  legs: number;
  is_bot: boolean;
}

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
  const [allPlayers, setAllPlayers] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Find current user's player ID from the session players
  const currentPlayer = session.players.find(p => !p.is_bot);
  const currentPlayerId = currentPlayer?.id;

  // Fetch all players who participated, including those who left
  useEffect(() => {
    if (open) {
      fetchAllParticipants();
    }
  }, [open, session.id]);

  const fetchAllParticipants = async () => {
    setLoading(true);
    
    // Fetch game_results to get all player chip changes
    const { data: gameResults, error: resultsError } = await supabase
      .from('game_results')
      .select('player_chip_changes')
      .eq('game_id', session.id);

    if (resultsError) {
      console.error('Error fetching game results:', resultsError);
      setAllPlayers(session.players);
      setLoading(false);
      return;
    }

    // Aggregate chip changes by player ID
    const chipChanges = new Map<string, number>();
    gameResults?.forEach((result: any) => {
      const changes = result.player_chip_changes as Record<string, number>;
      if (changes) {
        Object.entries(changes).forEach(([playerId, change]) => {
          chipChanges.set(playerId, (chipChanges.get(playerId) || 0) + change);
        });
      }
    });

    // Get all unique player IDs that participated
    const allPlayerIds = Array.from(chipChanges.keys());
    
    if (allPlayerIds.length === 0) {
      // No game results, fall back to current players
      setAllPlayers(session.players);
      setLoading(false);
      return;
    }

    // Fetch player info for all participants
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('id, user_id, is_bot, legs, created_at')
      .in('id', allPlayerIds);

    // Also try to find players by game_id in case some were re-added
    const { data: currentGamePlayers } = await supabase
      .from('players')
      .select('id, user_id, is_bot, legs, created_at')
      .eq('game_id', session.id);

    // Merge players data
    const playerMap = new Map<string, any>();
    playersData?.forEach(p => playerMap.set(p.id, p));
    currentGamePlayers?.forEach(p => playerMap.set(p.id, p));

    // Get all unique user_ids to fetch profiles
    const userIds = new Set<string>();
    playerMap.forEach(p => {
      if (p.user_id) userIds.add(p.user_id);
    });

    // Fetch profiles for usernames
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', Array.from(userIds));

    const profileMap = new Map<string, string>();
    profiles?.forEach(p => profileMap.set(p.id, p.username));

    // Build player results
    const results: PlayerResult[] = [];
    const allPlayersForBotAlias = Array.from(playerMap.values()).map(p => ({
      user_id: p.user_id,
      is_bot: p.is_bot,
      created_at: p.created_at
    }));

    chipChanges.forEach((chips, playerId) => {
      const player = playerMap.get(playerId);
      if (player) {
        const username = player.is_bot 
          ? getBotAlias(allPlayersForBotAlias, player.user_id)
          : (profileMap.get(player.user_id) || 'Unknown');
        
        results.push({
          id: playerId,
          username,
          chips,
          legs: player.legs || 0,
          is_bot: player.is_bot
        });
      } else {
        // Player record no longer exists, try to look them up by checking if the ID exists as a user_id
        // This is a fallback - the player left the game completely
        results.push({
          id: playerId,
          username: 'Former Player',
          chips,
          legs: 0,
          is_bot: false
        });
      }
    });

    // If we found participants from game_results, use those
    // Otherwise fall back to the current session players
    if (results.length > 0) {
      setAllPlayers(results);
    } else {
      setAllPlayers(session.players);
    }
    
    setLoading(false);
  };

  const displayPlayers = allPlayers.length > 0 ? allPlayers : session.players;

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
              {loading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
              ) : (
                <div className="space-y-1">
                  {displayPlayers
                    .sort((a, b) => b.chips - a.chips)
                    .map((player, index) => (
                      <div 
                        key={player.id || player.username}
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
              )}
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