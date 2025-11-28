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
}

interface GameLobbyProps {
  userId: string;
}

export const GameLobby = ({ userId }: GameLobbyProps) => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [buyIn, setBuyIn] = useState(100);
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
        players(user_id, position)
      `)
      .eq('status', 'waiting')
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
      const creator = players.find((p: any) => p.position === 1);
      const playerCount = players.length;
      
      return {
        ...game,
        player_count: playerCount,
        // Can delete if creator OR if no players
        is_creator: creator?.user_id === userId || playerCount === 0
      };
    }) || [];

    setGames(gamesWithCount);
    setLoading(false);
  };

  const createGame = async () => {
    if (buyIn < 10 || buyIn > 10000) {
      toast({
        title: "Invalid buy-in",
        description: "Buy-in must be between 10 and 10,000 chips",
        variant: "destructive",
      });
      return;
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        buy_in: buyIn,
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
        chips: buyIn,
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
    setBuyIn(100); // Reset to default
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

    const { error } = await supabase
      .from('players')
      .insert({
        game_id: gameId,
        user_id: userId,
        chips: 100,
        position: nextPosition
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to join game",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Success",
      description: "Joined game!",
    });

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
                    <CardDescription>
                      Buy-in: {game.buy_in} chips
                    </CardDescription>
                  </div>
                  <Badge variant={game.status === 'waiting' ? 'default' : 'secondary'}>
                    {game.status}
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
                      Join Game
                    </Button>
                    {game.is_creator && (
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
              Configure your game settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="buyIn">Buy-in Amount (chips)</Label>
              <Input
                id="buyIn"
                type="number"
                min="10"
                max="10000"
                value={buyIn}
                onChange={(e) => setBuyIn(parseInt(e.target.value) || 100)}
                placeholder="100"
              />
              <p className="text-sm text-muted-foreground">
                Each player starts with this many chips (10-10,000)
              </p>
            </div>
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
