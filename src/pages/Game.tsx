import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";
import { GameTable } from "@/components/GameTable";
import { startRound, makeDecision, autoFoldUndecided } from "@/lib/gameLogic";
import { addBotPlayer, makeBotDecisions } from "@/lib/botPlayer";
import { Card as CardType } from "@/lib/cardUtils";
import { Share2, Bot } from "lucide-react";

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  current_decision: string | null;
  decision_locked: boolean | null;
  legs: number;
  is_bot: boolean;
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
  all_decisions_in: boolean | null;
  dealer_position: number | null;
  rounds?: Round[];
}

interface Round {
  id: string;
  game_id: string;
  round_number: number;
  cards_dealt: number;
  pot: number;
  status: string;
  decision_deadline: string | null;
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
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Store the game URL to redirect back after auth
        const currentPath = window.location.pathname;
        sessionStorage.setItem('redirectAfterAuth', currentPath);
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // Store the game URL to redirect back after auth
        const currentPath = window.location.pathname;
        sessionStorage.setItem('redirectAfterAuth', currentPath);
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!gameId || !user) return;

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
  }, [gameId, user]);

  // Timer countdown effect
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || isPaused) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isPaused]);

  // Trigger bot decisions when round starts
  useEffect(() => {
    if (game?.status === 'in_progress' && !game.all_decisions_in && timeLeft !== null) {
      // Give bots a random delay before making decisions
      const botDecisionTimer = setTimeout(() => {
        makeBotDecisions(gameId!);
      }, 2000 + Math.random() * 3000);

      return () => clearTimeout(botDecisionTimer);
    }
  }, [game?.current_round, gameId]);

  // Auto-fold when timer reaches 0
  useEffect(() => {
    if (timeLeft === 0 && game && !game.all_decisions_in && !isPaused) {
      autoFoldUndecided(gameId!);
    }
  }, [timeLeft, game, gameId, isPaused]);

  const fetchGameData = async () => {
    if (!gameId || !user) return;

    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('*, rounds(*)')
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

    // Auto-join if user is not in the game and game is waiting
    const isPlayerInGame = playersData?.some(p => p.user_id === user.id);
    if (!isPlayerInGame && gameData.status === 'waiting' && playersData && playersData.length < 4) {
      const nextPosition = Math.max(...playersData.map(p => p.position), 0) + 1;
      
      const { error: joinError } = await supabase
        .from('players')
        .insert({
          game_id: gameId,
          user_id: user.id,
          chips: gameData.buy_in,
          position: nextPosition
        });

      if (joinError) {
        toast({
          title: "Could not join game",
          description: joinError.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Joined game!",
          description: "You've been added to the game",
        });
        // Refetch to get updated player list
        setTimeout(() => fetchGameData(), 500);
        return;
      }
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
    
    // Calculate time left if there's a deadline
    if (gameData.rounds && gameData.rounds.length > 0) {
      const currentRound = gameData.rounds.find((r: Round) => r.round_number === gameData.current_round);
      if (currentRound?.decision_deadline) {
        const deadline = new Date(currentRound.decision_deadline).getTime();
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
        setTimeLeft(remaining);
      }
    }
    
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

  const handleStay = async () => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    const betAmount = 10; // Fixed bet per round

    try {
      await makeDecision(gameId, currentPlayer.id, 'stay', betAmount);
      toast({
        title: "Decision locked",
        description: "You chose to stay in!",
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
      await makeDecision(gameId, currentPlayer.id, 'fold');
      toast({
        title: "Decision locked",
        description: "You folded",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };


  const handleAddBot = async () => {
    if (!gameId) return;

    try {
      await addBotPlayer(gameId);
      toast({
        title: "Bot added",
        description: "A computer player has joined the game",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleInvite = () => {
    const gameUrl = window.location.href;
    navigator.clipboard.writeText(gameUrl).then(() => {
      toast({
        title: "Link copied!",
        description: "Share this link with other players to invite them",
      });
    }).catch(() => {
      toast({
        title: "Failed to copy",
        description: "Please copy the URL manually from your browser",
        variant: "destructive",
      });
    });
  };

  if (loading || !game) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const isCreator = players[0]?.user_id === user?.id;
  const canStart = game.status === 'waiting' && players.length >= 2 && isCreator;

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Three, Five, Seven</h1>
            <p className="text-muted-foreground">Game #{game.id.slice(0, 8)}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant={game.status === 'in_progress' ? 'default' : 'secondary'}>
              {game.status === 'in_progress' ? 'In Progress' : game.status}
            </Badge>
            {game.status === 'in_progress' && (
              <Button 
                variant={isPaused ? "default" : "outline"} 
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? '▶️ Resume' : '⏸️ Pause'}
              </Button>
            )}
            {game.status === 'waiting' && (
              <Button variant="default" onClick={handleInvite}>
                <Share2 className="w-4 h-4 mr-2" />
                Invite Players
              </Button>
            )}
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
                        {player.is_bot ? `🤖 Bot ${index + 1}` : (player.profiles?.username || `Player ${index + 1}`)}
                      </span>
                      {player.user_id === user?.id && !player.is_bot && (
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
                <div className="flex gap-3 justify-center flex-wrap">
                  {canStart && (
                    <Button onClick={startGame} size="lg">
                      Start Game
                    </Button>
                  )}
                  {isCreator && players.length < 4 && (
                    <Button onClick={handleAddBot} size="lg" variant="outline">
                      <Bot className="w-4 h-4 mr-2" />
                      Add Bot Player
                    </Button>
                  )}
                </div>
                {!canStart && players.length < 2 && (
                  <p className="text-sm text-muted-foreground">
                    Need at least 2 players to start (add bots or invite friends!)
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
              allDecisionsIn={game.all_decisions_in || false}
              playerCards={playerCards}
              timeLeft={timeLeft}
              lastRoundResult={(game as any).last_round_result || null}
              onStay={handleStay}
              onFold={handleFold}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Game;
