import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

interface Game {
  id: string;
  status: string;
  buy_in: number;
  pot: number | null;
  created_at: string;
  player_count?: number;
  is_creator?: boolean;
  host_username?: string;
  duration_minutes?: number;
}

interface GameLobbyProps {
  userId: string;
}

export const GameLobby = ({ userId }: GameLobbyProps) => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
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
      .select(`
        *,
        players(user_id, position, profiles(username))
      `)
      .in('status', ['waiting', 'dealer_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress'])
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch games",
        variant: "destructive",
      });
      return;
    }

    const gamesWithCount = gamesData?.map(game => {
      const players = game.players as any[] || [];
      const playerCount = players.length;
      
      // Find creator - the player with position 1
      const creatorPlayer = players.find((p: any) => p.position === 1);
      const isCreator = creatorPlayer?.user_id === userId;
      const hostUsername = creatorPlayer?.profiles?.username || 'Unknown';
      
      // Calculate duration
      const createdTime = new Date(game.created_at).getTime();
      const now = Date.now();
      const durationMinutes = Math.floor((now - createdTime) / (1000 * 60));
      
      return {
        ...game,
        player_count: playerCount,
        // Show delete button if user is the creator (position 1) OR if there are no players
        is_creator: isCreator || playerCount === 0,
        host_username: hostUsername,
        duration_minutes: durationMinutes
      };
    }) || [];

    setGames(gamesWithCount);
    setLoading(false);
  };

  const createGame = async () => {
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        buy_in: 100, // Default value, not used anymore
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
    // First check if user is already in the game
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingPlayer) {
      // User is already in the game, just navigate to it
      navigate(`/game/${gameId}`);
      return;
    }

    // Check game status to see if it's active
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
        sitting_out: isActiveSession // Sit out if joining mid-game
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

      {games.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No games available. Create one to get started!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {games.map((game) => (
            <Card key={game.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Game #{game.id.slice(0, 8)}</CardTitle>
                    <CardDescription className="mt-1">
                      Host: {game.host_username} • {game.duration_minutes < 1 ? 'Just started' : `${game.duration_minutes}m ago`}
                    </CardDescription>
                  </div>
                  <Badge variant={game.status === 'waiting' ? 'default' : 'secondary'}>
                    {game.status === 'waiting' ? 'Waiting' : 'Active'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div className="text-sm text-muted-foreground">
                    Players: {game.player_count} / 7
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => joinGame(game.id)} className="flex-1 sm:flex-none">
                      {game.status === 'waiting' ? 'Join Game' : 'Join Session'}
                    </Button>
                    {game.is_creator && game.status === 'waiting' && (
                      <Button 
                        variant="destructive" 
                        size="icon"
                        onClick={() => setDeleteGameId(game.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
    </div>
  );
};
