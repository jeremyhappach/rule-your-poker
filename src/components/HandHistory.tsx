import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
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
  dealer_game_id?: string | null;
}

// DealerGame info from the dealer_games table
interface DealerGame {
  id: string;
  game_type: string;
  dealer_user_id: string;
  started_at: string;
  config: Record<string, any>;
  dealer_username?: string; // Joined from profiles
}

// A hand groups all game_results with the same dealer_game_id
interface HandGroup {
  hand_number: number;
  events: GameResult[]; // All events in this hand (ante, legs, tax, showdown)
  totalChipChange: number; // Sum of chip changes for current player
  showdownWinner: string | null; // The actual hand winner (not Ante/Leg Purchase/Pussy Tax)
  showdownDescription: string | null;
  isWinner: boolean; // Did current player win the showdown?
  totalPot: number; // Total pot won in this hand
  latestTimestamp: string;
  dealerGame?: DealerGame; // Info from dealer_games table
  playerDiceResults?: PlayerDiceResult[]; // Dice results for all players (horses/SCC)
}

interface Round {
  id: string;
  game_id: string;
  round_number: number;
  hand_number: number | null;
  pot: number | null;
  status: string;
  created_at: string;
  horses_state?: any; // Contains playerStates with dice values for dice games
}

// Player dice result for display
interface PlayerDiceResult {
  playerId: string;
  username: string;
  dice: number[];
  isWinner: boolean;
  handDescription?: string;
}

interface InProgressGame {
  hand_number: number;
  currentChipChange: number;
  events: GameResult[]; // Events so far in this hand
  dealerGame?: DealerGame; // Info from dealer_games table
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
  const [dealerGames, setDealerGames] = useState<Map<string, DealerGame>>(new Map());
  const [rounds, setRounds] = useState<Round[]>([]);
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map()); // playerId -> username
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [inProgressGame, setInProgressGame] = useState<InProgressGame | null>(null);
  const [gameBuyIn, setGameBuyIn] = useState<number | null>(null);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [currentDealerGame, setCurrentDealerGame] = useState<DealerGame | null>(null);

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
  }, [currentPlayerChips, rounds, gameResults, gameBuyIn, currentPlayerId, isSessionEnded, currentDealerGame]);

  const fetchHistoryData = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);

    try {
      // Fetch game buy_in, session status, and current_game_uuid
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('buy_in, session_ended_at, current_game_uuid')
        .eq('id', gameId)
        .maybeSingle();

      if (gameError) {
        console.error('[HandHistory] Error fetching game:', gameError);
      } else if (gameData) {
        setGameBuyIn(gameData.buy_in);
        setIsSessionEnded(!!gameData.session_ended_at);
      }

      // Fetch all dealer_games for this session with dealer profile info
      const { data: dealerGamesData, error: dealerGamesError } = await supabase
        .from('dealer_games')
        .select(`
          id,
          game_type,
          dealer_user_id,
          started_at,
          config,
          profiles:dealer_user_id (username)
        `)
        .eq('session_id', gameId)
        .order('started_at', { ascending: true });

      if (dealerGamesError) {
        console.error('[HandHistory] Error fetching dealer_games:', dealerGamesError);
      } else if (dealerGamesData) {
        const dealerGamesMap = new Map<string, DealerGame>();
        dealerGamesData.forEach((dg: any) => {
          dealerGamesMap.set(dg.id, {
            id: dg.id,
            game_type: dg.game_type,
            dealer_user_id: dg.dealer_user_id,
            started_at: dg.started_at,
            config: dg.config || {},
            dealer_username: dg.profiles?.username || 'Unknown',
          });
        });
        setDealerGames(dealerGamesMap);
        
        // Find the current dealer game (most recent or matching current_game_uuid)
        if (gameData?.current_game_uuid && dealerGamesMap.has(gameData.current_game_uuid)) {
          setCurrentDealerGame(dealerGamesMap.get(gameData.current_game_uuid) || null);
        } else if (dealerGamesData.length > 0) {
          const lastDealerGame = dealerGamesData[dealerGamesData.length - 1];
          setCurrentDealerGame(dealerGamesMap.get(lastDealerGame.id) || null);
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
        })));
      }

      await fetchRoundsData();
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchRoundsData = async () => {
    // Fetch all rounds for this game (including horses_state for dice games)
    const { data: roundsData, error: roundsError } = await supabase
      .from('rounds')
      .select('id, game_id, round_number, hand_number, pot, status, created_at, horses_state')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    
    if (roundsError) {
      console.error('[HandHistory] Error fetching rounds:', roundsError);
    } else {
      setRounds(roundsData || []);
    }

    // Fetch player names for displaying dice results
    const { data: playersData } = await supabase
      .from('players')
      .select('id, user_id, is_bot')
      .eq('game_id', gameId);

    if (playersData && playersData.length > 0) {
      const userIds = playersData.filter(p => p.user_id).map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      const namesMap = new Map<string, string>();
      playersData.forEach(player => {
        const profile = profiles?.find(p => p.id === player.user_id);
        namesMap.set(player.id, profile?.username || 'Unknown');
      });
      setPlayerNames(namesMap);
    }
  };

  // Helper to check if a result is a "system" event vs actual showdown
  const isSystemEvent = (result: GameResult): boolean => {
    const systemWinners = ['Ante', 'Leg Purchase', 'Pussy Tax'];
    return systemWinners.includes(result.winner_username || '');
  };

  // Check if this result represents a game completion (someone won the full game)
  // Different game types have different completion markers:
  // - 357: game ends when someone wins with "X legs"
  // - Horses/SCC: every non-system result with a winner IS a complete game (no legs, just winner-take-all with rollovers for ties)
  // - Holm: game ends when player "beats Chucky" (not when they just win a round or pussy tax happens)
  const isGameCompletion = (result: GameResult): boolean => {
    if (isSystemEvent(result)) return false;
    
    const resultGameType = (result as any).game_type || null;
    const desc = result.winning_hand_description || '';
    
    // Horses and Ship-Captain-Crew: every non-system result with a winner is a complete game
    // (ties cause rollovers with NO game_result entry, so any result here means a winner was determined)
    if (resultGameType === 'horses' || resultGameType === 'ship-captain-crew') {
      // Must have a winner (not null/pussy tax)
      return result.winner_player_id !== null;
    }
    
    // Holm: game ends ONLY when someone "beats Chucky"
    // Pussy tax and player-vs-player rounds continue the game (buck passes)
    if (resultGameType === 'holm-game') {
      return desc.toLowerCase().includes('beat chucky');
    }
    
    // 357 (or unknown): completion is when someone wins with X legs
    const legsPattern = /\d+\s*legs?$/i;
    return legsPattern.test(desc);
  };

  // Group game results into logical games (bounded by dealer_game_id or fallback to game completion detection)
  const groupResultsByHand = (): HandGroup[] => {
    // Sort all results chronologically (oldest first) to process in order
    const sortedResults = [...gameResults].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const games: GameResult[][] = [];
    let currentGame: GameResult[] = [];
    let currentDealerGameId: string | null = null;

    sortedResults.forEach(result => {
      const resultDealerGameId = result.dealer_game_id || null;
      
      // If dealer_game_id changes and we have events, close out the previous game
      if (currentGame.length > 0 && resultDealerGameId !== currentDealerGameId && currentDealerGameId !== null) {
        games.push(currentGame);
        currentGame = [];
      }
      
      currentGame.push(result);
      currentDealerGameId = resultDealerGameId;
      
      // Fallback: If no dealer_game_id, use completion detection
      if (!resultDealerGameId && isGameCompletion(result)) {
        games.push(currentGame);
        currentGame = [];
        currentDealerGameId = null;
      }
    });

    // Add any remaining events as an in-progress game
    if (currentGame.length > 0) {
      games.push(currentGame);
    }

    // Convert to HandGroup array
    const groups: HandGroup[] = games.map((events, index) => {
      // Find the showdown result that completed the game (the legs winner)
      const gameWinner = events.find(e => isGameCompletion(e));
      // Find any showdown results (non-system events)
      const showdownEvents = events.filter(e => !isSystemEvent(e));
      const lastShowdown = showdownEvents[showdownEvents.length - 1];
      
      // Get dealer_game_id from first event (all events in a group share the same dealer_game_id)
      const dealerGameId = events[0]?.dealer_game_id;
      const dealerGame = dealerGameId ? dealerGames.get(dealerGameId) : undefined;
      
      // Calculate total chip change for current player
      let totalChipChange = 0;
      if (currentPlayerId) {
        totalChipChange = events.reduce((sum, event) => {
          return sum + (event.player_chip_changes[currentPlayerId] ?? 0);
        }, 0);
      }

      // Sum total pot (only from non-system events)
      const totalPot = events
        .filter(e => !isSystemEvent(e))
        .reduce((sum, e) => sum + (e.pot_won || 0), 0);

      // Extract player dice results for dice games (horses, ship-captain-crew)
      let playerDiceResults: PlayerDiceResult[] | undefined;
      const isDiceGame = dealerGame?.game_type === 'horses' || dealerGame?.game_type === 'ship-captain-crew';
      
      if (isDiceGame && lastShowdown) {
        // Find the round that matches this game by looking at creation time
        // The last round before the showdown result
        const gameStartTime = events[0]?.created_at;
        const gameEndTime = lastShowdown.created_at;
        
        const relevantRound = rounds.find(r => {
          const roundTime = new Date(r.created_at).getTime();
          const startTime = new Date(gameStartTime).getTime();
          const endTime = new Date(gameEndTime).getTime();
          return roundTime >= startTime - 60000 && roundTime <= endTime + 60000; // 1 minute buffer
        });
        
        if (relevantRound?.horses_state?.playerStates) {
          const playerStates = relevantRound.horses_state.playerStates as Record<string, any>;
          const winnerPlayerId = lastShowdown.winner_player_id;
          
          playerDiceResults = Object.entries(playerStates)
            .filter(([, state]) => state.isComplete && state.dice)
            .map(([playerId, state]) => {
              const dice = (state.dice as Array<{ value: number }>).map(d => d.value);
              return {
                playerId,
                username: playerNames.get(playerId) || 'Unknown',
                dice,
                isWinner: playerId === winnerPlayerId,
                handDescription: state.result?.handName || undefined,
              };
            })
            .sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0)); // Winner first
        }
      }

      return {
        hand_number: index + 1, // Display number (1 = first game played)
        events,
        totalChipChange,
        showdownWinner: gameWinner?.winner_username || lastShowdown?.winner_username || null,
        showdownDescription: gameWinner?.winning_hand_description || lastShowdown?.winning_hand_description || null,
        isWinner: gameWinner?.winner_player_id === currentPlayerId,
        totalPot,
        latestTimestamp: events[events.length - 1]?.created_at || '',
        dealerGame,
        playerDiceResults,
      };
    });

    // Sort by display number DESC (most recent first)
    return groups.sort((a, b) => b.hand_number - a.hand_number);
  };

  const handGroups = groupResultsByHand();

  const updateInProgressGame = () => {
    // Don't show in-progress if session has ended
    if (isSessionEnded || rounds.length === 0) {
      setInProgressGame(null);
      return;
    }

    // Find the highest hand_number in rounds (the current game)
    const maxHandNumber = Math.max(...rounds.map(r => r.hand_number || 0));
    
    // Check if the last recorded game_result is a game completion
    // If so, we're either between games or starting a new one
    const sortedResults = [...gameResults].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    const latestResult = sortedResults[0];
    const lastGameCompleted = latestResult && isGameCompletion(latestResult);
    
    // Find events that happened AFTER the last game completion (if any)
    let inProgressEvents: GameResult[] = [];
    if (lastGameCompleted) {
      // No in-progress events - last event was a game completion
      inProgressEvents = [];
    } else {
      // Find all events after the most recent game completion
      const lastCompletionTime = sortedResults.find(r => isGameCompletion(r))?.created_at;
      if (lastCompletionTime) {
        inProgressEvents = gameResults.filter(r => 
          new Date(r.created_at).getTime() > new Date(lastCompletionTime).getTime()
        );
      } else {
        // No game completions yet - all events are in-progress
        inProgressEvents = gameResults;
      }
    }
    
    // If no in-progress events, check if we have rounds but no results yet
    if (inProgressEvents.length === 0 && maxHandNumber > 0) {
      // We have active rounds but no results yet for current game
      setInProgressGame({
        hand_number: maxHandNumber,
        currentChipChange: 0,
        events: [],
        dealerGame: currentDealerGame || undefined,
      });
      return;
    }
    
    if (inProgressEvents.length === 0) {
      setInProgressGame(null);
      return;
    }

    // Calculate chip change for in-progress game
    let chipChange = 0;
    if (currentPlayerChips !== undefined && gameBuyIn !== null && currentPlayerId) {
      // Sum up all changes from completed games
      const completedGamesChanges = gameResults
        .filter(r => !inProgressEvents.includes(r))
        .reduce((sum, result) => {
          return sum + (result.player_chip_changes[currentPlayerId] ?? 0);
        }, 0);
      
      const startingChipsThisGame = gameBuyIn + completedGamesChanges;
      chipChange = currentPlayerChips - startingChipsThisGame;
    }

    setInProgressGame({
      hand_number: maxHandNumber,
      currentChipChange: chipChange,
      events: inProgressEvents.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
      dealerGame: currentDealerGame || undefined,
    });
  };

  // Format event for display in expanded section
  const formatEventDescription = (event: GameResult): { label: string; description: string; chipChange: number | null } => {
    const chipChange = currentPlayerId ? (event.player_chip_changes[currentPlayerId] ?? null) : null;
    
    if (event.winner_username === 'Ante') {
      return { label: 'Ante', description: event.winning_hand_description || 'Ante collected', chipChange };
    }
    if (event.winner_username === 'Leg Purchase') {
      return { label: 'Leg', description: event.winning_hand_description || 'Leg purchased', chipChange };
    }
    if (event.winner_username === 'Pussy Tax') {
      return { label: 'Tax', description: event.winning_hand_description || 'Pussy tax collected', chipChange };
    }
    // Showdown result
    const desc = event.is_chopped 
      ? `Chopped: ${event.winning_hand_description || 'Split pot'}`
      : `${event.winner_username} won with ${event.winning_hand_description || 'best hand'}`;
    return { label: 'Showdown', description: desc, chipChange };
  };

  // Calculate display game number
  // handGroups are already numbered 1, 2, 3... with highest being most recent
  const totalGames = handGroups.length + (inProgressGame ? 1 : 0);
  const getDisplayGameNumber = (handGroup: HandGroup, isInProgress: boolean): number => {
    if (isInProgress) return totalGames;
    return handGroup.hand_number;
  };

  // Format game type for display
  const formatGameType = (type: string | null | undefined): string => {
    if (!type) return '';
    switch (type) {
      case 'holm-game': return 'Holm';
      case '357': return '3-5-7';
      case 'horses': return 'Horses';
      case 'ship-captain-crew': return 'SCC';
      default: return type;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-4 h-4 mr-2 animate-spin" />
        Loading history...
      </div>
    );
  }

  // Empty state
  const hasNoHistory = handGroups.length === 0 && !inProgressGame;
  if (hasNoHistory) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <p>No hands yet</p>
        <p className="text-xs mt-1">Hand history will appear here</p>
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
                      Game #{totalGames}
                      {inProgressGame.dealerGame && (
                        <span className="text-muted-foreground font-normal"> ({formatGameType(inProgressGame.dealerGame.game_type)})</span>
                      )}
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
                <div className="space-y-1.5 pt-2">
                  {inProgressGame.events.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Hand in progress...
                    </div>
                  ) : (
                    inProgressGame.events.map((event) => {
                      const { label, description, chipChange } = formatEventDescription(event);
                      return (
                        <div key={event.id} className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] py-0 h-5 min-w-[50px] justify-center">
                              {label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{description}</span>
                          </div>
                          {chipChange !== null && chipChange !== 0 && (
                            <span className={cn(
                              "text-xs font-medium",
                              chipChange > 0 ? "text-green-500" : "text-red-500"
                            )}>
                              {chipChange > 0 ? '+' : ''}{formatChipValue(chipChange)}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Completed Hands - grouped by hand_number, sorted DESC (most recent first) */}
          {handGroups.map((hand) => {
            const displayGameNumber = hand.hand_number;

            return (
              <AccordionItem 
                key={hand.hand_number} 
                value={`hand-${hand.hand_number}`}
                className="border border-border/50 rounded-lg mb-2 overflow-hidden bg-card/50"
              >
                <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        Game #{displayGameNumber}
                        {hand.dealerGame && (
                          <span className="text-muted-foreground font-normal"> ({formatGameType(hand.dealerGame.game_type)})</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {hand.showdownWinner || 'No winner'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hand.showdownDescription && (
                        <Badge variant="outline" className="text-[10px] py-0 h-5">
                          {hand.showdownDescription}
                        </Badge>
                      )}
                      <span className={cn(
                        "text-sm font-bold min-w-[60px] text-right",
                        hand.totalChipChange > 0 ? "text-green-500" : 
                        hand.totalChipChange < 0 ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {hand.totalChipChange > 0 ? '+' : ''}{formatChipValue(hand.totalChipChange)}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  <div className="space-y-1.5 pt-2">
                    <div className="text-xs text-muted-foreground mb-2">
                      {hand.totalPot > 0 && `Pot: $${formatChipValue(hand.totalPot)} • `}
                      {new Date(hand.latestTimestamp).toLocaleTimeString()}
                    </div>
                    
                    {/* For dice games, show all player dice results */}
                    {hand.playerDiceResults && hand.playerDiceResults.length > 0 ? (
                      <div className="space-y-1">
                        {hand.playerDiceResults.map((result) => (
                          <div 
                            key={result.playerId} 
                            className={cn(
                              "flex items-center justify-between rounded px-2 py-1.5",
                              result.isWinner ? "bg-primary/20" : "bg-muted/20"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {result.isWinner && <span className="text-xs">🏆</span>}
                              <span className={cn(
                                "text-xs",
                                result.isWinner ? "font-medium text-foreground" : "text-muted-foreground"
                              )}>
                                {result.username}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-0.5">
                                {result.dice.map((value, i) => (
                                  <span 
                                    key={i} 
                                    className="w-5 h-5 text-xs font-mono flex items-center justify-center bg-background border border-border rounded"
                                  >
                                    {value}
                                  </span>
                                ))}
                              </div>
                              {result.handDescription && (
                                <span className="text-[10px] text-muted-foreground">
                                  {result.handDescription}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // For non-dice games, show regular events
                      hand.events.map((event) => {
                        const { label, description, chipChange } = formatEventDescription(event);
                        return (
                          <div key={event.id} className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px] py-0 h-5 min-w-[50px] justify-center">
                                {label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{description}</span>
                            </div>
                            {chipChange !== null && chipChange !== 0 && (
                              <span className={cn(
                                "text-xs font-medium",
                                chipChange > 0 ? "text-green-500" : "text-red-500"
                              )}>
                                {chipChange > 0 ? '+' : ''}{formatChipValue(chipChange)}
                              </span>
                            )}
                          </div>
                        );
                      })
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
