import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Trophy, Clock } from "lucide-react";
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
  game_type: string | null;
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

interface InProgressGame {
  hand_number: number;
  currentChipChange: number;
  rounds: Round[];
}

interface HandHistoryProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
  currentPlayerChips?: number;
  gameType?: string | null;
  currentRound?: number | null; // Used to trigger refresh when round changes
}

export const HandHistory = ({ 
  gameId, 
  currentUserId, 
  currentPlayerId,
  currentPlayerChips,
  gameType,
  currentRound
}: HandHistoryProps) => {
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [playerActions, setPlayerActions] = useState<PlayerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [inProgressGame, setInProgressGame] = useState<InProgressGame | null>(null);
  const [gameBuyIn, setGameBuyIn] = useState<number | null>(null);

  useEffect(() => {
    fetchHistoryData();
  }, [gameId]);

  // When the table advances to a new round/hand, refresh history so newly completed
  // hands show up immediately (without waiting for the full game to end).
  useEffect(() => {
    if (currentRound !== undefined && currentRound !== null) {
      fetchHistoryData({ showLoading: false });
    }
  }, [currentRound]);

  // Update in-progress game when chips/rounds/results change
  useEffect(() => {
    updateInProgressGame();
  }, [currentPlayerChips, rounds, gameResults, gameBuyIn, currentPlayerId]);

  const fetchHistoryData = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);

    try {
      // Fetch game buy_in once (needed for in-progress chip-change calc)
      if (gameBuyIn === null) {
        const { data: gameData, error: gameError } = await supabase
          .from('games')
          .select('buy_in')
          .eq('id', gameId)
          .maybeSingle();

        if (gameError) {
          console.error('[HandHistory] Error fetching game:', gameError);
        } else if (gameData) {
          setGameBuyIn(gameData.buy_in);
        }
      }

      // Fetch game results (completed hands) — should update as hands finish
      const { data: results, error: resultsError } = await supabase
        .from('game_results')
        .select('*')
        .eq('game_id', gameId)
        .order('hand_number', { ascending: false });

      if (resultsError) {
        console.error('[HandHistory] Error fetching game results:', resultsError);
      } else {
        setGameResults((results || []).map((r) => ({
          ...r,
          player_chip_changes: (r.player_chip_changes as Record<string, number>) || {},
          game_type: r.game_type || null,
        })));
      }

      await fetchRoundsAndActions();
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchRoundsAndActions = async () => {
    // Fetch all rounds for this game
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
  };

  const updateInProgressGame = () => {
    if (rounds.length === 0) {
      setInProgressGame(null);
      return;
    }

    // Find the highest hand_number in rounds
    const maxHandNumber = Math.max(...rounds.map(r => r.hand_number || 0));
    
    // Check if this hand already has a result (game is fully complete)
    const hasResult = gameResults.some(gr => gr.hand_number === maxHandNumber);
    
    if (hasResult || maxHandNumber === 0) {
      setInProgressGame(null);
      return;
    }

    // Get ALL rounds for the game session (not just current hand)
    // This shows the full progression of the game including all completed rounds
    const allSessionRounds = rounds.sort((a, b) => a.round_number - b.round_number);
    
    // Calculate chip change for current game:
    // Current chips - (buyIn + sum of all previous chip changes)
    let chipChange = 0;
    if (currentPlayerChips !== undefined && gameBuyIn !== null && currentPlayerId) {
      const totalPreviousChanges = gameResults.reduce((sum, result) => {
        const playerChange = result.player_chip_changes[currentPlayerId] ?? 0;
        return sum + playerChange;
      }, 0);
      const startingChipsThisHand = gameBuyIn + totalPreviousChanges;
      chipChange = currentPlayerChips - startingChipsThisHand;
    }

    setInProgressGame({
      hand_number: maxHandNumber,
      currentChipChange: chipChange,
      rounds: allSessionRounds
    });
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

  const hasNoHistory = gameResults.length === 0 && !inProgressGame;

  if (hasNoHistory) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <p>No games yet</p>
        <p className="text-xs mt-1">Game history will appear here</p>
      </div>
    );
  }

  // Format game type for display
  const formatGameType = (type: string | null | undefined): string => {
    if (!type) return '';
    switch (type) {
      case 'holm-game': return 'Holm';
      case '357': 
      case '3-5-7': return '3-5-7';
      default: return type;
    }
  };

  // Calculate display game number (Game 1 = first played, highest = most recent)
  // Since results are sorted by hand_number DESC, we need to reverse the numbering
  const totalGames = gameResults.length + (inProgressGame ? 1 : 0);
  const getDisplayGameNumber = (index: number, isInProgress: boolean): number => {
    // In-progress is always the highest number (most recent)
    if (isInProgress) return totalGames;
    // For completed games (already sorted DESC), index 0 is most recent completed
    // If there's an in-progress game, completed games are numbered totalGames-1, totalGames-2, etc.
    // If no in-progress game, they're numbered totalGames, totalGames-1, etc.
    return totalGames - (inProgressGame ? 1 : 0) - index;
  };

  return (
    <ScrollArea className="h-full max-h-[400px]">
      <div className="space-y-2 p-2">
        {/* Session Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Game History</span>
        </div>

        <Accordion 
          type="single" 
          collapsible 
          value={expandedGame ?? undefined}
          onValueChange={(value) => setExpandedGame(value)}
        >
          {/* In-Progress Game - always on top as it's the most recent */}
          {inProgressGame && (
            <AccordionItem 
              value="in-progress"
              className="border border-amber-500/50 rounded-lg mb-2 overflow-hidden bg-amber-500/10"
            >
              <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30">
                <div className="flex items-center justify-between w-full pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Game #{getDisplayGameNumber(0, true)}
                      {gameType && <span className="text-muted-foreground font-normal"> ({formatGameType(gameType)})</span>}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 h-5 border-amber-500/50 text-amber-500">
                      In Progress
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-bold min-w-[60px] text-right",
                      inProgressGame.currentChipChange > 0 ? "text-green-500" : 
                      inProgressGame.currentChipChange < 0 ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {inProgressGame.currentChipChange > 0 ? '+' : ''}{formatChipValue(inProgressGame.currentChipChange)}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="space-y-2 pt-2">
                  {(() => {
                    // Only show COMPLETED rounds (not active/betting ones)
                    const completedRounds = inProgressGame.rounds.filter(r => r.status === 'completed');
                    
                    if (completedRounds.length === 0) {
                      return (
                        <div className="text-xs text-muted-foreground">
                          No completed rounds yet
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-1">
                        {completedRounds.map((round) => {
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
                    );
                  })()}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Completed Games - sorted by hand_number DESC (most recent first) */}
          {gameResults.map((result, index) => {
            const userChipChange = getUserChipChange(result);
            const isWinner = currentPlayerId && result.winner_player_id === currentPlayerId;
            const displayGameNumber = getDisplayGameNumber(index, false);

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
                        Game #{displayGameNumber}
                        {result.game_type && <span className="text-muted-foreground font-normal"> ({formatGameType(result.game_type)})</span>}
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
