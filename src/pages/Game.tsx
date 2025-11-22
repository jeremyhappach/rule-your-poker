import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";
import { GameTable } from "@/components/GameTable";
import { startRound, placeBet, foldPlayer, endRound } from "@/lib/gameLogic";
import { Card as CardType } from "@/lib/cardUtils";

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  profiles?: {
    username: string;
  };
}

interface GameData {
  id: string;
  status: string;
  buy_in: number;
  pot: number | null;
  current_round: number | null;
  current_player_position: number | null;
  current_bet: number | null;
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

const Game = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [game, setGame] = useState<GameData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerCards, setPlayerCards] = useState<PlayerCards[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!gameId) return;

    fetchGameData();

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        () => {
          fetchGameData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`
        },
        () => {
          fetchGameData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const fetchGameData = async () => {
    if (!gameId) return;

    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError) {
      toast({
        title: "Error",
        description: "Failed to fetch game",
        variant: "destructive",
      });
      return;
    }

    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        profiles(username)
      `)
      .eq('game_id', gameId)
      .order('position');

    if (playersError) {
      toast({
        title: "Error",
        description: "Failed to fetch players",
        variant: "destructive",
      });
      return;
    }

    // Fetch player cards if game is in progress
    if (gameData.status === 'in_progress' && gameData.current_round) {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId)
        .eq('round_number', gameData.current_round)
        .single();

      if (roundData) {
        const { data: cardsData } = await supabase
          .from('player_cards')
          .select('player_id, cards')
          .eq('round_id', roundData.id);

        if (cardsData) {
          setPlayerCards(cardsData.map(cd => ({
            player_id: cd.player_id,
            cards: cd.cards as unknown as CardType[]
          })));
        }
      }
    }

    setGame(gameData);
    setPlayers(playersData || []);
    setLoading(false);
  };

  const startGame = async () => {
    if (!gameId) return;

    const { error } = await supabase
      .from('games')
      .update({ status: 'in_progress' })
      .eq('id', gameId);

    if (error) {
      console.error('Start game error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to start game",
        variant: "destructive",
      });
      return;
    }

    // Start first round
    try {
      await startRound(gameId, 1);
      toast({
        title: "Success",
        description: "Game started! Cards dealt.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const leaveGame = () => {
    navigate("/");
  };

  const addChips = async (amount: number = 100) => {
    if (!gameId || !user) return;

    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    const { error } = await supabase
      .from('players')
      .update({ chips: currentPlayer.chips + amount })
      .eq('id', currentPlayer.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add chips",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: `Added ${amount} chips!`,
    });
  };

  const handleBet = async (amount: number) => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    try {
      await placeBet(gameId, currentPlayer.id, amount);
      toast({
        title: "Bet placed",
        description: `You bet ${amount} chips`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFold = async () => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    try {
      await foldPlayer(gameId, currentPlayer.id);
      toast({
        title: "Folded",
        description: "You folded your hand",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCall = async () => {
    if (!gameId || !user || !game) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    const callAmount = game.current_bet || 0;

    try {
      await placeBet(gameId, currentPlayer.id, callAmount);
      toast({
        title: "Called",
        description: `You called ${callAmount} chips`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEndRound = async () => {
    if (!gameId) return;

    try {
      await endRound(gameId);
      toast({
        title: "Round ended",
        description: "Moving to next round",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading || !game) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const isCreator = players[0]?.user_id === user?.id;
  const canStart = game.status === 'waiting' && players.length >= 2 && isCreator;

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Three, Five, Seven</h1>
            <p className="text-muted-foreground">Game #{game.id.slice(0, 8)}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={game.status === 'in_progress' ? 'default' : 'secondary'}>
              {game.status === 'in_progress' ? 'In Progress' : game.status}
            </Badge>
            <Button variant="outline" onClick={leaveGame}>
              Leave Game
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Game Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Buy-in:</span>
                <span className="font-semibold">{game.buy_in} chips</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pot:</span>
                <span className="font-semibold">{game.pot || 0} chips</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round:</span>
                <span className="font-semibold">{game.current_round || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Players:</span>
                <span className="font-semibold">{players.length} / 4</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Players</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex justify-between items-center p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">P{index + 1}</Badge>
                      <span className="font-medium">
                        {player.profiles?.username || `Player ${index + 1}`}
                      </span>
                      {player.user_id === user?.id && (
                        <Badge variant="secondary">You</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm">
                        <span className="font-semibold">{player.chips}</span>
                        <span className="text-muted-foreground ml-1">chips</span>
                      </div>
                      {player.user_id === user?.id && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => addChips(100)}
                        >
                          Add 100
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {game.status === 'waiting' && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Waiting for players to join...
                </p>
                {canStart && (
                  <Button onClick={startGame} size="lg">
                    Start Game
                  </Button>
                )}
                {!canStart && players.length < 2 && (
                  <p className="text-sm text-muted-foreground">
                    Need at least 2 players to start
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {game.status === 'in_progress' && (
          <div className="space-y-4">
            <GameTable
              players={players}
              currentUserId={user?.id}
              pot={game.pot || 0}
              currentRound={game.current_round || 1}
              currentPlayerPosition={game.current_player_position || 1}
              currentBet={game.current_bet || 0}
              playerCards={playerCards}
              onBet={handleBet}
              onFold={handleFold}
              onCall={handleCall}
            />
            {user && players.find(p => p.user_id === user.id)?.position === 1 && (
              <div className="text-center">
                <Button onClick={handleEndRound} variant="outline">
                  End Round & Show Hands
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Game;
