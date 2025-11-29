import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { SessionResults } from "@/components/SessionResults";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Game {
  id: string;
  status: string;
  buy_in: number;
  pot: number | null;
  created_at: string;
  session_ended_at?: string;
  total_hands?: number;
  current_round?: number;
  dealer_position?: number;
  ante_amount?: number;
  leg_value?: number;
  pussy_tax_enabled?: boolean;
  pussy_tax_value?: number;
  legs_to_win?: number;
  pot_max_enabled?: boolean;
  pot_max_value?: number;
  player_count?: number;
  is_creator?: boolean;
  host_username?: string;
  duration_minutes?: number;
  players?: Array<{
    username: string;
    chips: number;
    legs: number;
    is_bot: boolean;
    sitting_out: boolean;
  }>;
}

interface GameLobbyProps {
  userId: string;
}

export const GameLobby = ({ userId }: GameLobbyProps) => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Game | null>(null);
  const [showSessionResults, setShowSessionResults] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchGames();

    const channel = supabase
      .channel('games-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games'
        },
        () => {
          fetchGames();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchGames = async () => {
    const { data: gamesData, error } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch games",
        variant: "destructive",
      });
      return;
    }

    // Fetch player info for each game
    const gamesWithPlayers = await Promise.all(
      (gamesData || []).map(async (game) => {
        const { data: playersData } = await supabase
          .from('players')
          .select(`
            user_id,
            position,
            chips,
            legs,
            is_bot,
            sitting_out,
            profiles(username)
          `)
          .eq('game_id', game.id)
          .order('position');

        const hostPlayer = playersData?.find(p => p.position === 1);
        const host_username = hostPlayer?.profiles?.username || 'Unknown';
        
        const isCreator = playersData?.some(p => p.user_id === userId && p.position === 1) || false;
        
        // Calculate duration
        const durationMinutes = Math.floor((Date.now() - new Date(game.created_at).getTime()) / (1000 * 60));
        
        return {
          ...game,
          player_count: playersData?.length || 0,
          is_creator: isCreator,
          host_username,
          duration_minutes: durationMinutes,
          players: playersData?.map(p => ({
            username: p.profiles?.username || 'Unknown',
            chips: p.chips,
            legs: p.legs,
            is_bot: p.is_bot,
            sitting_out: p.sitting_out,
          })) || [],
        };
      })
    );

    setGames(gamesWithPlayers);
    setLoading(false);
  };

  const createGame = async () => {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        buy_in: 100,
        status: 'waiting'
      })
      .select()
      .single();

    if (gameError) {
      toast({
        title: "Error",
        description: "Failed to create game",
        variant: "destructive",
      });
      return;
    }

    const { error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        user_id: userId,
        chips: 0,
        position: 1
      });

    if (playerError) {
      toast({
        title: "Error",
        description: "Failed to join game",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Game created!",
    });

    setShowCreateDialog(false);
    navigate(`/game/${game.id}`);
  };

  const joinGame = async (gameId: string) => {
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingPlayer) {
      navigate(`/game/${gameId}`);
      return;
    }

    const { data: gameData } = await supabase
      .from('games')
      .select('status')
      .eq('id', gameId)
      .single();

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('position')
      .eq('game_id', gameId);

    if (playersError) {
      toast({
        title: "Error",
        description: "Failed to check game",
        variant: "destructive",
      });
      return;
    }

    if (players.length >= 7) {
      toast({
        title: "Game Full",
        description: "This game already has 7 players",
        variant: "destructive",
      });
      return;
    }

    const nextPosition = players.length + 1;
    const isActiveSession = gameData?.status && gameData.status !== 'waiting';

    const { error } = await supabase
      .from('players')
      .insert({
        game_id: gameId,
        user_id: userId,
        chips: 0,
        position: nextPosition,
        sitting_out: isActiveSession
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to join game",
        variant: "destructive",
      });
      return;
    }

    if (isActiveSession) {
      toast({
        title: "Joined Active Game",
        description: "You'll be dealt in starting next round. Select an open seat.",
      });
    } else {
      toast({
        title: "Success",
        description: "Joined game!",
      });
    }

    navigate(`/game/${gameId}`);
  };

  const deleteGame = async (gameId: string) => {
    const { error } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete game",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Game deleted",
    });

    setDeleteGameId(null);
    fetchGames();
  };

  const activeGames = games.filter(g => 
    ['waiting', 'dealer_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress'].includes(g.status)
  );
  
  const historicalGames = games.filter(g => g.status === 'session_ended');

  if (loading) {
    return <div className="text-center">Loading games...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold">Game Lobby</h2>
        <Button onClick={() => setShowCreateDialog(true)} size="lg" className="w-full sm:w-auto">
          Create New Game
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Active Sessions ({activeGames.length})</TabsTrigger>
          <TabsTrigger value="historical">Historical ({historicalGames.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="space-y-3 mt-4">
          {activeGames.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No active games. Create one to get started!</p>
              </CardContent>
            </Card>
          ) : (
            activeGames.map((game) => {
              const isInProgress = ['dealer_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress'].includes(game.status);
              const activePlayers = game.players?.filter(p => !p.sitting_out) || [];
              
              return (
                <Card key={game.id} className="hover:border-primary transition-colors">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-semibold">Game #{game.id.slice(0, 8)}</h3>
                        <Badge variant={isInProgress ? 'default' : 'secondary'}>
                          {game.status === 'waiting' ? 'Waiting' : 'Active'}
                        </Badge>
                        <div className="flex gap-2 ml-auto">
                          <Button
                            size="sm"
                            onClick={() => joinGame(game.id)}
                            disabled={game.player_count >= 7}
                          >
                            Join
                          </Button>
                          {game.is_creator && game.status === 'waiting' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteGameId(game.id)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-6">
                        <div className="flex-1 space-y-2">
                          <div className="space-y-1 text-sm">
                            <div><span className="text-muted-foreground">Host:</span> {game.host_username}</div>
                            <div><span className="text-muted-foreground">Started:</span> {format(new Date(game.created_at), 'MMM d, h:mm a')}</div>
                            <div><span className="text-muted-foreground">Duration:</span> {game.duration_minutes} min</div>
                            <div><span className="text-muted-foreground">Active Players:</span> {activePlayers.length}</div>
                          </div>

                          {isInProgress && game.ante_amount !== undefined && (
                            <div className="text-xs text-muted-foreground pt-2 border-t">
                              <span className="font-medium">Last Used Config:</span> ${game.ante_amount} Ante • 
                              ${game.leg_value} Legs ({game.legs_to_win} to win) • 
                              {game.pussy_tax_enabled ? `$${game.pussy_tax_value} P Tax` : '$0 P Tax'} • 
                              {game.pot_max_enabled ? `$${game.pot_max_value} Max Match` : 'No Max Match'}
                            </div>
                          )}
                        </div>
                        
                        {isInProgress && activePlayers.length > 0 && (
                          <div className="flex-1">
                            <div className="text-xs font-medium text-muted-foreground mb-2">Active Players w/ Current Chip Stack</div>
                            <div className="border rounded-md">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="text-left p-2 font-medium">Player</th>
                                    <th className="text-right p-2 font-medium">Chips</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activePlayers
                                    .sort((a, b) => b.chips - a.chips)
                                    .map((player, idx) => (
                                      <tr key={idx} className="border-b last:border-0">
                                        <td className="p-2">{player.username}</td>
                                        <td className="p-2 text-right font-mono">${player.chips}</td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
        
        <TabsContent value="historical" className="space-y-2 mt-4">
          {historicalGames.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No historical sessions yet.</p>
              </CardContent>
            </Card>
          ) : (
            historicalGames.map((game) => (
              <Card key={game.id} className="hover:border-primary transition-colors">
                <CardContent className="py-3">
                  <div className="flex justify-between items-center">
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Host:</span> <span className="font-medium">{game.host_username}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Started:</span> {format(new Date(game.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                      {game.session_ended_at && (
                        <div>
                          <span className="text-muted-foreground">Ended:</span> {format(new Date(game.session_ended_at), 'MMM d, yyyy h:mm a')}
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Players:</span> {game.player_count}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSession(game);
                        setShowSessionResults(true);
                      }}
                    >
                      See Results
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Game</DialogTitle>
            <DialogDescription>
              Start a new game of Three, Five, Seven
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Players start at $0 and can go into debt. Get 3 legs to win!
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createGame}>
              Create Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteGameId} onOpenChange={() => setDeleteGameId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Game?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this game? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteGameId && deleteGame(deleteGameId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedSession && (
        <SessionResults
          open={showSessionResults}
          onOpenChange={setShowSessionResults}
          session={{
            id: selectedSession.id,
            created_at: selectedSession.created_at,
            session_ended_at: selectedSession.session_ended_at || selectedSession.created_at,
            total_hands: selectedSession.total_hands || 0,
            host_username: selectedSession.host_username || 'Unknown',
            players: selectedSession.players || [],
          }}
        />
      )}
    </div>
  );
};
