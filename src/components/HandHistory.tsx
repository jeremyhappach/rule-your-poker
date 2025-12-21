import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Trophy, ChevronDown, Clock } from "lucide-react";
import { cn, formatChipValue } from "@/lib/utils";

interface GameResult {
  id: string;
  game_id: string;
  hand_number: number;
  winner_player_id: string | null;
  winner_username: string | null;
  winning_hand_description: string | null;
  pot_won: number;
  player_chip_changes: Record<string, number>;
  is_chopped: boolean;
  created_at: string;
}

interface Round {
  id: string;
  game_id: string;
  round_number: number;
  hand_number: number | null;
  pot: number | null;
  status: string;
  created_at: string;
}

interface PlayerAction {
  id: string;
  round_id: string;
  player_id: string;
  action_type: string;
  created_at: string;
}

interface HandHistoryProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
}

export const HandHistory = ({ gameId, currentUserId, currentPlayerId }: HandHistoryProps) => {
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [playerActions, setPlayerActions] = useState<PlayerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  useEffect(() => {
    fetchHistoryData();

    // Subscribe to realtime updates for game_results
    const channel = supabase
      .channel(`hand-history-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_results',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('[HandHistory] New game result:', payload);
          const newResult = {
            ...payload.new,
            player_chip_changes: (payload.new as any).player_chip_changes || {}
          } as GameResult;
          setGameResults(prev => [newResult, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const fetchHistoryData = async () => {
    setLoading(true);
    
    // Fetch game results
    const { data: results, error: resultsError } = await supabase
      .from('game_results')
      .select('*')
      .eq('game_id', gameId)
      .order('hand_number', { ascending: false });
    
    if (resultsError) {
      console.error('[HandHistory] Error fetching game results:', resultsError);
    } else {
      // Cast to handle JSONB type from Supabase
      setGameResults((results || []).map(r => ({
        ...r,
        player_chip_changes: (r.player_chip_changes as Record<string, number>) || {}
      })));
    }

    // Fetch all rounds for this game (for detailed view)
    const { data: roundsData, error: roundsError } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    
    if (roundsError) {
      console.error('[HandHistory] Error fetching rounds:', roundsError);
    } else {
      setRounds(roundsData || []);
    }

    // Fetch player actions
    if (roundsData && roundsData.length > 0) {
      const roundIds = roundsData.map(r => r.id);
      const { data: actions, error: actionsError } = await supabase
        .from('player_actions')
        .select('*')
        .in('round_id', roundIds)
        .order('created_at', { ascending: true });
      
      if (actionsError) {
        console.error('[HandHistory] Error fetching player actions:', actionsError);
      } else {
        setPlayerActions(actions || []);
      }
    }

    setLoading(false);
  };

  // Get user's chip change for a game result
  const getUserChipChange = (result: GameResult): number | null => {
    if (!currentPlayerId) return null;
    return result.player_chip_changes[currentPlayerId] ?? null;
  };

  // Get rounds for a specific hand_number
  const getRoundsForHand = (handNumber: number): Round[] => {
    return rounds.filter(r => r.hand_number === handNumber).sort((a, b) => a.round_number - b.round_number);
  };

  // Get actions for a specific round
  const getActionsForRound = (roundId: string): PlayerAction[] => {
    return playerActions.filter(a => a.round_id === roundId);
  };

  // Format action type for display
  const formatAction = (action: string): string => {
    switch (action) {
      case 'stay': return 'Stayed';
      case 'fold': return 'Folded';
      default: return action;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-4 h-4 mr-2 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (gameResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <p>No games completed yet</p>
        <p className="text-xs mt-1">Game history will appear here after games end</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[400px]">
      <div className="space-y-2 p-2">
        <Accordion 
          type="single" 
          collapsible 
          value={expandedGame ?? undefined}
          onValueChange={(value) => setExpandedGame(value)}
        >
          {gameResults.map((result) => {
            const userChipChange = getUserChipChange(result);
            const isWinner = currentPlayerId && result.winner_player_id === currentPlayerId;
            const handRounds = getRoundsForHand(result.hand_number);

            return (
              <AccordionItem 
                key={result.id} 
                value={result.id}
                className="border border-border/50 rounded-lg mb-2 overflow-hidden bg-card/50"
              >
                <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      {isWinner && <Trophy className="w-4 h-4 text-poker-gold" />}
                      <span className="text-sm font-medium">
                        Game #{result.hand_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {result.is_chopped ? 'Chopped' : result.winner_username || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.winning_hand_description && (
                        <Badge variant="outline" className="text-[10px] py-0 h-5">
                          {result.winning_hand_description}
                        </Badge>
                      )}
                      {userChipChange !== null && (
                        <span className={cn(
                          "text-sm font-bold min-w-[60px] text-right",
                          userChipChange > 0 ? "text-green-500" : 
                          userChipChange < 0 ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {userChipChange > 0 ? '+' : ''}{formatChipValue(userChipChange)}
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <div className="space-y-2 pt-2">
                    <div className="text-xs text-muted-foreground">
                      Pot: ${formatChipValue(result.pot_won)} • {new Date(result.created_at).toLocaleTimeString()}
                    </div>
                    
                    {handRounds.length > 0 ? (
                      <div className="space-y-1">
                        {handRounds.map((round) => {
                          const roundActions = getActionsForRound(round.id);
                          
                          return (
                            <div key={round.id} className="bg-muted/20 rounded p-2">
                              <div className="text-xs font-medium mb-1">
                                Round {round.round_number}
                              </div>
                              {roundActions.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {roundActions.map((action) => (
                                    <Badge 
                                      key={action.id}
                                      variant="secondary"
                                      className={cn(
                                        "text-[10px] py-0",
                                        action.action_type === 'fold' && "bg-red-500/20 text-red-400",
                                        action.action_type === 'stay' && "bg-green-500/20 text-green-400"
                                      )}
                                    >
                                      {formatAction(action.action_type)}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No actions recorded</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Round details not available
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </ScrollArea>
  );
};
