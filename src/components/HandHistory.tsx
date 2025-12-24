import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Trophy, Clock } from "lucide-react";
import { cn, formatChipValue } from "@/lib/utils";
import { HandHistoryCards } from "./HandHistoryCards";
import { Card as CardType } from "@/lib/cardUtils";

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
  community_cards: CardType[] | null;
  chucky_cards: CardType[] | null;
  chucky_active: boolean | null;
}

interface PlayerAction {
  id: string;
  round_id: string;
  player_id: string;
  action_type: string;
  created_at: string;
}

interface PlayerCards {
  id: string;
  round_id: string;
  player_id: string;
  cards: CardType[];
}

interface PlayerInfo {
  id: string;
  username: string;
  user_id: string;
}

interface HandHistoryProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
  currentPlayerChips?: number;
  gameType?: string | null;
  currentRound?: number | null;
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
  const [playerCards, setPlayerCards] = useState<PlayerCards[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [expandedHand, setExpandedHand] = useState<string | null>(null);
  const [gameBuyIn, setGameBuyIn] = useState<number | null>(null);

  useEffect(() => {
    fetchHistoryData();
  }, [gameId]);

  useEffect(() => {
    if (currentRound !== undefined && currentRound !== null) {
      fetchHistoryData({ showLoading: false });
    }
  }, [currentRound]);

  const fetchHistoryData = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);

    try {
      // Fetch game buy_in
      if (gameBuyIn === null) {
        const { data: gameData } = await supabase
          .from('games')
          .select('buy_in')
          .eq('id', gameId)
          .maybeSingle();
        if (gameData) setGameBuyIn(gameData.buy_in);
      }

      // Fetch players with usernames
      const { data: playersData } = await supabase
        .from('players')
        .select('id, user_id, profiles!inner(username)')
        .eq('game_id', gameId);
      
      if (playersData) {
        setPlayers(playersData.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          username: p.profiles?.username || 'Unknown'
        })));
      }

      // Fetch game results
      const { data: results } = await supabase
        .from('game_results')
        .select('*')
        .eq('game_id', gameId)
        .order('hand_number', { ascending: false });

      if (results) {
        setGameResults(results.map((r) => ({
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
    // Fetch all rounds
    const { data: roundsData } = await supabase
      .from('rounds')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    
    if (roundsData) {
      setRounds(roundsData.map(r => ({
        ...r,
        community_cards: (r.community_cards as unknown as CardType[]) || [],
        chucky_cards: (r.chucky_cards as unknown as CardType[]) || [],
      })));

      // Fetch player actions
      if (roundsData.length > 0) {
        const roundIds = roundsData.map(r => r.id);
        
        const { data: actions } = await supabase
          .from('player_actions')
          .select('*')
          .in('round_id', roundIds);
        
        if (actions) setPlayerActions(actions);

        // Fetch player cards for completed rounds
        const completedRoundIds = roundsData.filter(r => r.status === 'completed').map(r => r.id);
        if (completedRoundIds.length > 0) {
          const { data: cards } = await supabase
            .from('player_cards')
            .select('*')
            .in('round_id', completedRoundIds);
          
          if (cards) {
            setPlayerCards(cards.map(c => ({
              ...c,
              cards: (c.cards as unknown as CardType[]) || []
            })));
          }
        }
      }
    }
  };

  const getPlayerUsername = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player?.username || 'Unknown';
  };

  const getRoundsForHand = (handNumber: number): Round[] => {
    return rounds.filter(r => r.hand_number === handNumber && r.status === 'completed')
      .sort((a, b) => a.round_number - b.round_number);
  };

  const getActionsForRound = (roundId: string): PlayerAction[] => {
    return playerActions.filter(a => a.round_id === roundId);
  };

  const getCardsForRound = (roundId: string, playerId: string): CardType[] | null => {
    const pc = playerCards.find(c => c.round_id === roundId && c.player_id === playerId);
    return pc?.cards || null;
  };

  const formatGameType = (type: string | null | undefined): string => {
    if (!type) return '';
    switch (type) {
      case 'holm-game': return 'Holm';
      case '357': 
      case '3-5-7': return '3-5-7';
      default: return type;
    }
  };

  const isHolmGame = (type: string | null | undefined): boolean => {
    return type === 'holm-game';
  };

  // Get user's chip change for a game result
  const getUserChipChange = (result: GameResult): number | null => {
    if (!currentPlayerId) return null;
    return result.player_chip_changes[currentPlayerId] ?? null;
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
        <p>No games yet</p>
        <p className="text-xs mt-1">Game history will appear here</p>
      </div>
    );
  }

  // Render Holm game hand details
  const renderHolmHandDetails = (result: GameResult) => {
    const handRounds = getRoundsForHand(result.hand_number);
    // For Holm, there's typically one round per hand
    const round = handRounds[0];
    
    if (!round) {
      return <div className="text-xs text-muted-foreground">No round data</div>;
    }

    const actions = getActionsForRound(round.id);
    const stayedPlayers = actions.filter(a => a.action_type === 'stay');
    const foldedPlayers = actions.filter(a => a.action_type === 'fold');

    // If no one stayed
    if (stayedPlayers.length === 0) {
      return (
        <div className="text-sm text-muted-foreground py-2">
          No players stayed.
        </div>
      );
    }

    // Show community cards
    const communityCards = round.community_cards || [];
    const chuckyCards = round.chucky_cards || [];
    const showChucky = round.chucky_active && stayedPlayers.length === 1;

    return (
      <div className="space-y-3 py-2">
        {/* Community Cards */}
        {communityCards.length > 0 && (
          <HandHistoryCards cards={communityCards} label="Community cards:" />
        )}

        {/* Players who stayed */}
        <div className="space-y-2">
          {stayedPlayers.map((action) => {
            const playerCards = getCardsForRound(round.id, action.player_id);
            const username = getPlayerUsername(action.player_id);
            const chipChange = result.player_chip_changes[action.player_id] ?? 0;
            
            // Determine result text
            let resultText = '';
            if (result.winner_player_id === action.player_id) {
              resultText = `Won game (+$${formatChipValue(Math.abs(chipChange))})`;
            } else if (chipChange < 0) {
              resultText = `Matched pot (-$${formatChipValue(Math.abs(chipChange))})`;
            } else if (chipChange > 0) {
              resultText = `Took pot (+$${formatChipValue(chipChange)})`;
            } else {
              resultText = 'Stayed';
            }

            return (
              <div key={action.id} className="bg-muted/30 rounded-lg p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{username}</span>
                  <span className={cn(
                    "text-xs font-medium",
                    chipChange > 0 ? "text-green-500" : chipChange < 0 ? "text-red-500" : "text-muted-foreground"
                  )}>
                    {resultText}
                  </span>
                </div>
                {playerCards && playerCards.length > 0 && (
                  <HandHistoryCards cards={playerCards} />
                )}
                {result.winner_player_id === action.player_id && result.winning_hand_description && (
                  <div className="text-xs text-muted-foreground">
                    {result.winning_hand_description}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Chuck's cards (only if one player stayed) */}
        {showChucky && chuckyCards.length > 0 && (
          <div className="bg-muted/30 rounded-lg p-2 space-y-1">
            <div className="font-medium text-sm">Chuck</div>
            <HandHistoryCards cards={chuckyCards} />
          </div>
        )}
      </div>
    );
  };

  // Render 357 game hand details
  const render357HandDetails = (result: GameResult) => {
    const handRounds = getRoundsForHand(result.hand_number);
    
    if (handRounds.length === 0) {
      return <div className="text-xs text-muted-foreground">No round data</div>;
    }

    return (
      <div className="space-y-2 py-2">
        {handRounds.map((round) => {
          const actions = getActionsForRound(round.id);
          const stayedPlayers = actions.filter(a => a.action_type === 'stay');
          
          // Round label (3, 5, or 7 cards)
          const cardCount = round.round_number === 1 ? 3 : round.round_number === 2 ? 5 : 7;

          return (
            <div key={round.id} className="bg-muted/20 rounded p-2">
              <div className="text-xs font-medium mb-1">
                Round {round.round_number} ({cardCount} cards)
              </div>
              
              {stayedPlayers.length === 0 ? (
                <div className="text-xs text-muted-foreground">No one stayed</div>
              ) : (
                <div className="space-y-1">
                  {stayedPlayers.map((action) => {
                    const playerCards = getCardsForRound(round.id, action.player_id);
                    const username = getPlayerUsername(action.player_id);
                    
                    return (
                      <div key={action.id} className="flex items-center gap-2">
                        <span className="text-xs">{username}</span>
                        {playerCards && playerCards.length > 0 ? (
                          <HandHistoryCards cards={playerCards} size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">(cards unknown)</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Final result */}
        {result.winner_username && (
          <div className="text-sm mt-2">
            <span className="font-medium">{result.winner_username}</span>
            <span className="text-muted-foreground"> won </span>
            {result.winning_hand_description && (
              <span className="text-muted-foreground">with {result.winning_hand_description}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // Get ending pot for a hand (for Holm, this is 0 if won, otherwise pot value)
  const getEndingPot = (result: GameResult): number => {
    // If someone won the game (took the pot), ending pot is 0
    if (result.pot_won > 0) return 0;
    // Otherwise find the round pot
    const handRounds = getRoundsForHand(result.hand_number);
    if (handRounds.length > 0) {
      return handRounds[handRounds.length - 1].pot || 0;
    }
    return 0;
  };

  return (
    <ScrollArea className="h-full max-h-[400px]">
      <div className="space-y-2 p-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Game History</span>
        </div>

        <Accordion 
          type="single" 
          collapsible 
          value={expandedGame ?? undefined}
          onValueChange={setExpandedGame}
        >
          {gameResults.map((result, index) => {
            const userChipChange = getUserChipChange(result);
            const isWinner = currentPlayerId && result.winner_player_id === currentPlayerId;
            const displayGameNumber = gameResults.length - index;
            const isHolm = isHolmGame(result.game_type);

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
                        {result.game_type && (
                          <span className="text-muted-foreground font-normal"> ({formatGameType(result.game_type)})</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {result.is_chopped ? 'Chopped' : result.winner_username || 'Unknown'}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 h-5">
                        ${formatChipValue(result.pot_won)}
                      </Badge>
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
                  {/* Nested accordion for hands within this game */}
                  <Accordion
                    type="single"
                    collapsible
                    value={expandedHand ?? undefined}
                    onValueChange={setExpandedHand}
                  >
                    {/* For now, each game_result IS a hand, so we show just this one */}
                    {/* In the future if multiple hands per game, loop here */}
                    <AccordionItem 
                      value={`hand-${result.id}`}
                      className="border border-border/30 rounded-lg overflow-hidden bg-muted/10"
                    >
                      <AccordionTrigger className="px-2 py-1.5 hover:no-underline hover:bg-muted/20 text-sm">
                        <div className="flex items-center justify-between w-full pr-2">
                          <span>Hand #{result.hand_number}</span>
                          <span className="text-muted-foreground">
                            Ending pot: ${formatChipValue(getEndingPot(result))}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-2">
                        {isHolm ? renderHolmHandDetails(result) : render357HandDetails(result)}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </ScrollArea>
  );
};
