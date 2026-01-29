import { useState, useEffect } from "react";
import { useMemo } from "react";
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
  gameType?: string | null; // Game type (horses, ship-captain-crew, etc.) - from result or dealerGame
  playerDiceResults?: PlayerDiceResult[]; // Dice results for all players (horses/SCC)
  allRounds?: Round[]; // ALL rounds for this game (for showing rollovers)
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
  dealer_game_id?: string | null; // Direct link to dealer_games table
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
  const [userIdToName, setUserIdToName] = useState<Map<string, string>>(new Map()); // userId -> username (for resolving UUIDs in winner_username)
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
        const enrichedResults = (results || []).map((r) => ({
          ...r,
          player_chip_changes: (r.player_chip_changes as Record<string, number>) || {},
        }));
        setGameResults(enrichedResults);
        
        // CRITICAL: Pass both dealerGamesMap AND freshGameResults to avoid stale state
        const dealerGamesMap = dealerGamesData ? new Map(dealerGamesData.map((dg: any) => [dg.id, {
          id: dg.id,
          game_type: dg.game_type,
          dealer_user_id: dg.dealer_user_id,
          started_at: dg.started_at,
          config: dg.config || {},
          dealer_username: dg.profiles?.username || 'Unknown',
        }])) : new Map();
        
        await fetchRoundsData(dealerGamesMap, enrichedResults);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchRoundsData = async (
    dealerGamesMap: Map<string, DealerGame>,
    freshGameResults: GameResult[]
  ) => {
    // Fetch all rounds for this game (including horses_state for dice games)
    const { data: roundsData, error: roundsError } = await supabase
      .from('rounds')
      .select('id, game_id, round_number, hand_number, pot, status, created_at, horses_state, dealer_game_id')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    
    if (roundsError) {
      console.error('[HandHistory] Error fetching rounds:', roundsError);
    } else {
      setRounds(roundsData as any);
    }

    // Fetch player names for displaying dice results
    // Use session_player_snapshots for historical accuracy (includes players who left)
    const { data: snapshotsData } = await supabase
      .from('session_player_snapshots')
      .select('player_id, username')
      .eq('game_id', gameId);

    const namesMap = new Map<string, string>();
    
    // First, populate from snapshots (historical data)
    if (snapshotsData) {
      snapshotsData.forEach(snap => {
        namesMap.set(snap.player_id, snap.username);
      });
    }

    // Also fetch current players as fallback (including created_at for bot alias ordering)
    const { data: playersData } = await supabase
      .from('players')
      .select('id, user_id, is_bot, created_at')
      .eq('game_id', gameId);

    // Map from user_id -> name (for resolving UUIDs stored in winner_username)
    const userIdMap = new Map<string, string>();

    if (playersData && playersData.length > 0) {
      const userIds = playersData.filter(p => p.user_id && !p.is_bot).map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      // Sort bots by creation order once for consistency
      const bots = playersData
        .filter(p => p.is_bot)
        .sort((a, b) => {
          if (!a.created_at || !b.created_at) return 0;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

      playersData.forEach(player => {
        if (player.is_bot) {
          // Use bot alias (Bot 1, Bot 2, etc.) based on creation order
          const botIndex = bots.findIndex(b => b.user_id === player.user_id);
          const botAlias = botIndex >= 0 ? `Bot ${botIndex + 1}` : 'Bot';
          if (!namesMap.has(player.id)) {
            namesMap.set(player.id, botAlias);
          }
          // Also map user_id to alias so we can resolve UUIDs in winner_username
          userIdMap.set(player.user_id, botAlias);
        } else {
          const profile = profiles?.find(p => p.id === player.user_id);
          const username = profile?.username || 'Unknown';
          if (!namesMap.has(player.id)) {
            namesMap.set(player.id, username);
          }
          userIdMap.set(player.user_id, username);
        }
      });
    }
    
    setPlayerNames(namesMap);
    setUserIdToName(userIdMap);
  };

  // Helper to check if a string looks like a UUID
  const isUUID = (str: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  // Resolve winner name - handles UUIDs stored in winner_username (for bots)
  const resolveWinnerName = (winnerUsername: string | null, winnerPlayerId: string | null): string | null => {
    if (!winnerUsername) return null;
    
    // If it's a system event name, return as-is
    const systemWinners = ['Ante', 'Leg Purchase', 'Pussy Tax'];
    if (systemWinners.includes(winnerUsername)) return winnerUsername;
    
    // If it looks like a UUID, try to resolve it
    if (isUUID(winnerUsername)) {
      // Try user_id map first (most common for bots)
      if (userIdToName.has(winnerUsername)) {
        return userIdToName.get(winnerUsername) || winnerUsername;
      }
      // Try player_id map as fallback
      if (playerNames.has(winnerUsername)) {
        return playerNames.get(winnerUsername) || winnerUsername;
      }
    }
    
    // Also try to resolve via winner_player_id if the username still looks like a UUID
    if (winnerPlayerId && playerNames.has(winnerPlayerId)) {
      return playerNames.get(winnerPlayerId) || winnerUsername;
    }
    
    return winnerUsername;
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

  // Group game results strictly by dealer_game_id
  // Each dealer_game_id represents a complete "dealer game" (e.g., a full 357 game until someone wins with legs)
  const groupResultsByDealerGame = (): HandGroup[] => {
    // Group all results by their dealer_game_id
    const gamesByDealerId = new Map<string, GameResult[]>();
    const orphanedResults: GameResult[] = []; // Results without dealer_game_id (legacy data)
    
    gameResults.forEach(result => {
      const dealerGameId = result.dealer_game_id;
      if (dealerGameId) {
        if (!gamesByDealerId.has(dealerGameId)) {
          gamesByDealerId.set(dealerGameId, []);
        }
        gamesByDealerId.get(dealerGameId)!.push(result);
      } else {
        orphanedResults.push(result);
      }
    });
    
    // Convert to array and sort each group's events chronologically
    const dealerGameGroups: { dealerGameId: string; events: GameResult[]; startedAt: string }[] = [];
    
    gamesByDealerId.forEach((events, dealerGameId) => {
      // Sort events within this game by hand_number then by created_at
      const sortedEvents = [...events].sort((a, b) => {
        if (a.hand_number !== b.hand_number) {
          return a.hand_number - b.hand_number;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      
      const dealerGame = dealerGames.get(dealerGameId);
      dealerGameGroups.push({
        dealerGameId,
        events: sortedEvents,
        startedAt: dealerGame?.started_at || events[0]?.created_at || '',
      });
    });
    
    // Sort dealer games by started_at (oldest first for numbering)
    dealerGameGroups.sort((a, b) => 
      new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
    
    // Handle orphaned results (legacy data without dealer_game_id)
    // Group them by completion boundaries as before
    if (orphanedResults.length > 0) {
      const sortedOrphans = [...orphanedResults].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      let currentOrphanGame: GameResult[] = [];
      sortedOrphans.forEach(result => {
        currentOrphanGame.push(result);
        if (isGameCompletion(result)) {
          dealerGameGroups.push({
            dealerGameId: `orphan-${dealerGameGroups.length}`,
            events: currentOrphanGame,
            startedAt: currentOrphanGame[0]?.created_at || '',
          });
          currentOrphanGame = [];
        }
      });
      if (currentOrphanGame.length > 0) {
        dealerGameGroups.push({
          dealerGameId: `orphan-${dealerGameGroups.length}`,
          events: currentOrphanGame,
          startedAt: currentOrphanGame[0]?.created_at || '',
        });
      }
    }

    // Convert to HandGroup array with proper display numbers
    const groups: HandGroup[] = dealerGameGroups.map((group, index) => {
      const events = group.events;
      
      // Find the showdown result that completed the game (the legs winner)
      const gameWinner = events.find(e => isGameCompletion(e));
      // Find any showdown results (non-system events)
      const showdownEvents = events.filter(e => !isSystemEvent(e));
      const lastShowdown = showdownEvents[showdownEvents.length - 1];
      
      // Get dealer_game from the map
      const dealerGame = group.dealerGameId.startsWith('orphan-') 
        ? undefined 
        : dealerGames.get(group.dealerGameId);
      
      // Get game type from dealer_games table OR fallback to game_results.game_type
      const gameTypeFromResult = (events[0] as any)?.game_type || null;
      const resolvedGameType = dealerGame?.game_type || gameTypeFromResult;
      
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
      let allGameRounds: Round[] | undefined;
      const isDiceGame = resolvedGameType === 'horses' || resolvedGameType === 'ship-captain-crew';
      
      if (isDiceGame && !group.dealerGameId.startsWith('orphan-')) {
        // DIRECT MATCH: Get ALL rounds for this dealer_game_id
        const candidateRounds = rounds.filter(r => 
          r.dealer_game_id === group.dealerGameId && 
          r.horses_state?.playerStates
        );
        
        // Sort chronologically to show progression
        allGameRounds = candidateRounds.sort((a, b) => a.round_number - b.round_number);
        
        // For the summary, use the FINAL round
        const finalRound = allGameRounds.length > 0 
          ? allGameRounds[allGameRounds.length - 1] 
          : undefined;
        
        if (finalRound?.horses_state?.playerStates) {
          const playerStates = finalRound.horses_state.playerStates as Record<string, any>;
          const winnerPlayerId = lastShowdown?.winner_player_id;
          
          playerDiceResults = Object.entries(playerStates)
            .filter(([, state]) => state.isComplete && state.dice)
            .map(([playerId, state]) => {
              const dice = (state.dice as Array<{ value: number }>).map(d => d.value);
              return {
                playerId,
                username: playerNames.get(playerId) || 'Unknown',
                dice,
                isWinner: playerId === winnerPlayerId,
                handDescription: state.result?.description || state.result?.handName || undefined,
              };
            })
            .sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0)); // Winner first
        }
      }

      // Resolve the winner name (handles UUIDs for bots)
      const rawWinner = gameWinner?.winner_username || lastShowdown?.winner_username || null;
      const winnerPlayerId = gameWinner?.winner_player_id || lastShowdown?.winner_player_id || null;
      const resolvedWinner = resolveWinnerName(rawWinner, winnerPlayerId);
      
      // For 357 games: if there's no showdown winner (everyone folded), it's a Pussy Tax round
      const isPussyTaxOnly = !resolvedWinner && events.some(e => e.winner_username === 'Pussy Tax');
      const displayWinner = isPussyTaxOnly ? 'Pussy Tax' : resolvedWinner;

      return {
        hand_number: index + 1, // Display number (1 = first dealer game)
        events,
        totalChipChange,
        showdownWinner: displayWinner,
        showdownDescription: gameWinner?.winning_hand_description || lastShowdown?.winning_hand_description || null,
        isWinner: gameWinner?.winner_player_id === currentPlayerId,
        totalPot,
        latestTimestamp: events[events.length - 1]?.created_at || '',
        dealerGame,
        gameType: resolvedGameType,
        playerDiceResults,
        allRounds: allGameRounds,
      };
    });

    // Sort by display number DESC (most recent first)
    return groups.sort((a, b) => b.hand_number - a.hand_number);
  };

  // Use useMemo to compute hand groups only when data changes (ensures enrichment is complete)
  const handGroups = useMemo(() => {
    if (gameResults.length === 0) return [];
    return groupResultsByDealerGame();
  }, [gameResults, rounds, dealerGames, playerNames, userIdToName, currentPlayerId]);

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

  // Format event for display in expanded section - resolves UUIDs to usernames
  const formatEventDescription = (event: GameResult): { label: string; description: string; chipChange: number | null; handNumber?: number } => {
    const chipChange = currentPlayerId ? (event.player_chip_changes[currentPlayerId] ?? null) : null;
    const handNum = event.hand_number;
    
    if (event.winner_username === 'Ante') {
      return { label: 'Ante', description: event.winning_hand_description || 'Ante collected', chipChange, handNumber: handNum };
    }
    if (event.winner_username === 'Leg Purchase') {
      return { label: 'Leg', description: event.winning_hand_description || 'Leg purchased', chipChange, handNumber: handNum };
    }
    if (event.winner_username === 'Pussy Tax') {
      return { label: 'Tax', description: event.winning_hand_description || 'Pussy tax collected', chipChange, handNumber: handNum };
    }
    
    // Showdown result - resolve the winner name (may be a UUID for bots)
    const resolvedWinner = resolveWinnerName(event.winner_username, event.winner_player_id);
    const desc = event.is_chopped 
      ? `Chopped: ${event.winning_hand_description || 'Split pot'}`
      : `${resolvedWinner || 'Unknown'} won with ${event.winning_hand_description || 'best hand'}`;
    return { label: 'Showdown', description: desc, chipChange, handNumber: handNum };
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
                <div className="flex items-center justify-between w-full pr-2 gap-2">
                  {/* Game number + type - compact left */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-sm font-medium whitespace-nowrap">
                      #{totalGames}
                    </span>
                    {inProgressGame.dealerGame && (
                      <span className="text-xs text-muted-foreground font-normal whitespace-nowrap">
                        {formatGameType(inProgressGame.dealerGame.game_type)}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] py-0 h-5 border-amber-500/50 text-amber-500">
                      In Progress
                    </Badge>
                  </div>
                  
                  {/* Chip change - compact right */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                    <span className={cn(
                      "text-sm font-bold w-[48px] text-right tabular-nums",
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
                  <div className="flex items-center justify-between w-full pr-2 gap-2">
                    {/* Game number + type - compact left */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-medium whitespace-nowrap">
                        #{displayGameNumber}
                      </span>
                      {hand.gameType && (
                        <span className="text-xs text-muted-foreground font-normal whitespace-nowrap">
                          {formatGameType(hand.gameType)}
                        </span>
                      )}
                    </div>
                    
                    {/* Winner name - fixed width, truncated */}
                    <div className="flex-1 min-w-0 max-w-[120px]">
                      <span className={cn(
                        "text-xs truncate block",
                        hand.showdownWinner === 'Pussy Tax' 
                          ? "text-amber-500 font-medium" 
                          : "text-muted-foreground"
                      )}>
                        {hand.showdownWinner || 'No winner'}
                      </span>
                    </div>
                    
                    {/* Hand description + chip change - compact right */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {hand.showdownDescription && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 whitespace-nowrap max-w-[80px] truncate">
                          {hand.showdownDescription}
                        </Badge>
                      )}
                      <span className={cn(
                        "text-sm font-bold w-[48px] text-right tabular-nums",
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
                    {hand.allRounds && hand.allRounds.length > 0 ? (
                      <div className="space-y-3">
                        {hand.allRounds.map((round, roundIndex) => {
                          const isLastRound = roundIndex === hand.allRounds!.length - 1;
                          const isTieRound = !isLastRound;
                          const playerStates = round.horses_state?.playerStates as Record<string, any>;
                          const winnerPlayerId = hand.events.find(e => !isSystemEvent(e))?.winner_player_id;
                          
                          if (!playerStates) return null;
                          
                          const playerResults = Object.entries(playerStates)
                            .filter(([, state]) => state.isComplete && state.dice)
                            .map(([playerId, state]) => ({
                              playerId,
                              username: playerNames.get(playerId) || 'Unknown',
                              dice: (state.dice as Array<{ value: number }>).map(d => d.value),
                              isWinner: !isTieRound && playerId === winnerPlayerId,
                              rollCount: state.rollsRemaining !== undefined ? 3 - state.rollsRemaining : undefined,
                            }))
                            .sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0));
                          
                          return (
                            <div key={round.id}>
                              {roundIndex > 0 && (
                                <div className="flex items-center gap-2 my-2 text-[10px] text-yellow-500 font-semibold">
                                  <div className="h-px bg-yellow-500/30 flex-1" />
                                  <span>🔄 ROLLOVER - ONE TIE ALL TIE</span>
                                  <div className="h-px bg-yellow-500/30 flex-1" />
                                </div>
                              )}
                              
                              <div className="space-y-1">
                                {playerResults.map((result) => (
                                  <div 
                                    key={`${round.id}-${result.playerId}`}
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
                                      {result.rollCount !== undefined && (
                                        <span className="text-[10px] text-muted-foreground ml-1">
                                          {result.rollCount} {result.rollCount === 1 ? 'roll' : 'rolls'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : hand.playerDiceResults && hand.playerDiceResults.length > 0 ? (
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
                      // For non-dice games, show regular events grouped by hand_number
                      (() => {
                        // Group events by hand_number
                        const eventsByHand = new Map<number, GameResult[]>();
                        hand.events.forEach(event => {
                          const handNum = event.hand_number;
                          if (!eventsByHand.has(handNum)) {
                            eventsByHand.set(handNum, []);
                          }
                          eventsByHand.get(handNum)!.push(event);
                        });
                        
                        // Sort hands and get array
                        const sortedHands = Array.from(eventsByHand.entries())
                          .sort(([a], [b]) => a - b);
                        
                        // Check if we have multiple hands (for showing separators)
                        const hasMultipleHands = sortedHands.length > 1;
                        
                        return (
                          <div className="space-y-2">
                            {sortedHands.map(([handNum, handEvents], handIdx) => (
                              <div key={handNum}>
                                {/* Hand separator for multi-hand games */}
                                {hasMultipleHands && handIdx > 0 && (
                                  <div className="flex items-center gap-2 my-2 text-[10px] text-muted-foreground font-medium">
                                    <div className="h-px bg-border flex-1" />
                                    <span>Hand {handNum}</span>
                                    <div className="h-px bg-border flex-1" />
                                  </div>
                                )}
                                {hasMultipleHands && handIdx === 0 && (
                                  <div className="text-[10px] text-muted-foreground font-medium mb-1">
                                    Hand {handNum}
                                  </div>
                                )}
                                
                                {/* Events within this hand */}
                                <div className="space-y-1">
                                  {handEvents.map((event) => {
                                    const { label, description, chipChange } = formatEventDescription(event);
                                    return (
                                      <div key={event.id} className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="secondary" className="text-[10px] py-0 h-5 min-w-[50px] justify-center">
                                            {label}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground truncate max-w-[180px]">{description}</span>
                                        </div>
                                        {chipChange !== null && chipChange !== 0 && (
                                          <span className={cn(
                                            "text-xs font-medium flex-shrink-0",
                                            chipChange > 0 ? "text-green-500" : "text-red-500"
                                          )}>
                                            {chipChange > 0 ? '+' : ''}{formatChipValue(chipChange)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
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
