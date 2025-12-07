import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { SessionResults } from "@/components/SessionResults";
import { GameDefaultsConfig } from "@/components/GameDefaultsConfig";
import { format } from "date-fns";
import { generateGameName } from "@/lib/gameNames";
import { Settings } from "lucide-react";
import peoriaSkyline from "@/assets/peoria-skyline.jpg";
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
  name?: string;
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
  game_type?: string;
  chucky_cards?: number;
  player_count?: number;
  is_creator?: boolean;
  is_player?: boolean;
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
  const [showDefaultsConfig, setShowDefaultsConfig] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchGames();
    checkSuperuser();

    // Polling fallback for realtime reliability - poll every 1 second for faster updates
    const pollingInterval = setInterval(() => {
      fetchGames();
    }, 1000);

    const gamesChannel = supabase
      .channel('games-lobby-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games'
        },
        (payload) => {
          console.log('[LOBBY REALTIME] Games table changed:', payload);
          fetchGames();
        }
      )
      .subscribe((status) => {
        console.log('[LOBBY REALTIME] Games channel status:', status);
      });

    // Also subscribe to players table to update player counts in real-time
    const playersChannel = supabase
      .channel('players-lobby-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players'
        },
        (payload) => {
          console.log('[LOBBY REALTIME] Players table changed:', payload);
          fetchGames();
        }
      )
      .subscribe((status) => {
        console.log('[LOBBY REALTIME] Players channel status:', status);
      });

    return () => {
      clearInterval(pollingInterval);
      supabase.removeChannel(gamesChannel);
      supabase.removeChannel(playersChannel);
    };
  }, [userId]);

  const checkSuperuser = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    console.log('[SUPERUSER CHECK]', { userId, data, error });
    setIsSuperuser((data as any)?.is_superuser || false);
  };

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
        const isPlayer = playersData?.some(p => p.user_id === userId) || false;
        
        // Calculate duration
        const durationMinutes = Math.floor((Date.now() - new Date(game.created_at).getTime()) / (1000 * 60));
        
        return {
          ...game,
          player_count: playersData?.length || 0,
          is_creator: isCreator,
          is_player: isPlayer,
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
        status: 'waiting',
        name: generateGameName()
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

    // Users join as observers for any session that's already started (not in waiting)
    const shouldJoinAsObserver = gameData?.status && gameData.status !== 'waiting';

    // For active sessions, join as observer
    if (shouldJoinAsObserver) {
      toast({
        title: "Joined as Observer",
        description: "Select an open seat to join the game!",
      });
      navigate(`/game/${gameId}`);
      return;
    }

    // For waiting games, check if there's room and add player
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

    // Fetch user's profile to get their deck_color_mode preference
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('deck_color_mode')
      .eq('id', userId)
      .maybeSingle();

    const { error } = await supabase
      .from('players')
      .insert({
        game_id: gameId,
        user_id: userId,
        chips: 0,
        position: nextPosition,
        sitting_out: false,
        deck_color_mode: userProfile?.deck_color_mode || null
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

  const activeGames = games.filter(g => 
    ['waiting', 'dealer_selection', 'game_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress', 'game_over'].includes(g.status)
  );
  
  const historicalGames = games.filter(g => g.status === 'session_ended');

  if (loading) {
    return <div className="text-center">Loading games...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Peoria Skyline Backdrop */}
      <div className="relative overflow-hidden rounded-xl border border-amber-700/30 min-h-[140px] sm:min-h-[200px] md:min-h-[240px]">
        {/* Skyline Background - Full visibility */}
        <img 
          src={peoriaSkyline} 
          alt="Peoria Illinois Skyline"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient Overlay - lighter at top to show skyline, darker at bottom for text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        {/* Content - positioned at bottom */}
        <div className="relative z-10 h-full flex flex-col justify-end p-3 sm:p-4 md:p-6">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:justify-between sm:items-end">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-amber-300/50 flex-shrink-0">
                <span className="text-black text-xl sm:text-3xl">♠</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] truncate">
                  Peoria Poker League
                </h1>
                <p className="text-amber-200/80 text-xs sm:text-sm mt-0.5">Game Lobby</p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {isSuperuser && (
                <Button 
                  onClick={() => setShowDefaultsConfig(true)} 
                  size="sm"
                  variant="outline"
                  className="flex-1 sm:flex-none border-amber-500/60 text-amber-400 hover:bg-amber-600/20 bg-black/50 backdrop-blur-sm text-xs sm:text-sm"
                >
                  <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Defaults
                </Button>
              )}
              <Button 
                onClick={() => setShowCreateDialog(true)} 
                size="sm"
                className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30 text-xs sm:text-sm"
              >
                Create New Game
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 border border-amber-700/30">
          <TabsTrigger 
            value="active" 
            className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-amber-600/20 data-[state=active]:text-amber-400 data-[state=active]:border-b-2 data-[state=active]:border-amber-500"
          >
            Active ({activeGames.length})
          </TabsTrigger>
          <TabsTrigger 
            value="historical"
            className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500/20 data-[state=active]:to-amber-600/20 data-[state=active]:text-amber-400 data-[state=active]:border-b-2 data-[state=active]:border-amber-500"
          >
            History ({historicalGames.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="space-y-3 mt-4">
          {activeGames.length === 0 ? (
            <Card className="bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 border-2 border-amber-600/30">
              <CardContent className="pt-8 pb-8">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber-900/30 flex items-center justify-center border border-amber-600/30">
                    <span className="text-3xl text-amber-400/50">♠</span>
                  </div>
                  <p className="text-amber-300/60">No active games. Create one to get started!</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            activeGames.map((game) => {
              const isInProgress = ['dealer_selection', 'configuring', 'dealer_announcement', 'ante_decision', 'in_progress'].includes(game.status);
              const activePlayers = game.players?.filter(p => !p.sitting_out) || [];
              
              return (
                <Card 
                  key={game.id} 
                  className="bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 border-2 border-amber-600/40 hover:border-amber-500/60 transition-all shadow-lg hover:shadow-amber-900/20"
                >
                  <CardContent className="pt-5 pb-4">
                    <div className="space-y-4">
                      {/* Game Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 pb-3 border-b border-amber-700/30">
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md flex-shrink-0">
                            <span className="text-black text-xs sm:text-sm font-bold">♦</span>
                          </div>
                          <h3 className="font-bold text-amber-100 text-sm sm:text-base truncate">{game.name || `Game #${game.id.slice(0, 8)}`}</h3>
                          <div className="flex gap-1 flex-shrink-0">
                            <Badge 
                              variant={isInProgress ? 'default' : 'secondary'}
                              className={`text-xs ${isInProgress 
                                ? 'bg-green-600/80 text-white border-0' 
                                : 'bg-amber-600/30 text-amber-300 border-amber-600/50'
                              }`}
                            >
                              {game.status === 'waiting' ? 'Waiting' : 'Active'}
                            </Badge>
                            {game.is_player && (
                              <Badge className="bg-blue-600/30 text-blue-300 border-blue-500/50 text-xs">
                                Yours
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                          <Button
                            size="sm"
                            onClick={() => joinGame(game.id)}
                            disabled={game.player_count >= 7 && !game.is_player}
                            className={`flex-1 sm:flex-none text-xs sm:text-sm ${game.is_player 
                              ? 'bg-blue-600 hover:bg-blue-500 text-white'
                              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold'
                            }`}
                          >
                            {game.is_player ? 'Re-Join' : 'Join'}
                          </Button>
                          {game.is_creator && game.status === 'waiting' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteGameId(game.id)}
                              className="bg-red-600/80 hover:bg-red-500 text-xs sm:text-sm"
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                        {/* Game Info */}
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:text-sm">
                            <div className="flex items-center gap-1 sm:gap-2">
                              <span className="text-amber-400/60">Host:</span> 
                              <span className="text-amber-100 truncate">{game.host_username}</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                              <span className="text-amber-400/60">Players:</span> 
                              <span className="text-amber-100">{activePlayers.length}/7</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                              <span className="text-amber-400/60">Started:</span> 
                              <span className="text-amber-100">{format(new Date(game.created_at), 'MMM d, h:mm a')}</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                              <span className="text-amber-400/60">Duration:</span> 
                              <span className="text-amber-100">{game.duration_minutes} min</span>
                            </div>
                          </div>

                          {isInProgress && game.ante_amount !== undefined && (
                            <div className="text-xs text-amber-300/70 pt-2 mt-2 border-t border-amber-700/30 space-y-1">
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                                <span className="px-1.5 sm:px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 font-medium">
                                  {game.game_type === 'holm-game' ? 'Holm' : '3-5-7'}
                                </span>
                                <span className="text-amber-400/50">•</span>
                                <span>${game.ante_amount} Ante</span>
                                {game.game_type === 'holm-game' ? (
                                  <>
                                    <span className="text-amber-400/50">•</span>
                                    <span>{game.chucky_cards || 4} Chucky</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-amber-400/50">•</span>
                                    <span>${game.leg_value} Legs ({game.legs_to_win} to win)</span>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                                <span>{game.pussy_tax_enabled ? `$${game.pussy_tax_value} P Tax` : 'No P Tax'}</span>
                                <span className="text-amber-400/50">•</span>
                                <span>{game.pot_max_enabled ? `$${game.pot_max_value} Max` : 'No Max'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Players Table */}
                        {isInProgress && activePlayers.length > 0 && (
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-amber-400/60 mb-2">Current Standings</div>
                            <div className="border border-amber-700/30 rounded-lg overflow-hidden bg-slate-900/50">
                              <table className="w-full text-xs sm:text-sm">
                                <thead>
                                  <tr className="bg-amber-900/20">
                                    <th className="text-left p-1.5 sm:p-2 font-medium text-amber-300">Player</th>
                                    <th className="text-right p-1.5 sm:p-2 font-medium text-amber-300">Chips</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activePlayers
                                    .sort((a, b) => b.chips - a.chips)
                                    .map((player, idx) => (
                                      <tr key={idx} className="border-t border-amber-700/20">
                                        <td className="p-1.5 sm:p-2 text-amber-100 truncate max-w-[100px] sm:max-w-none">{player.username}</td>
                                        <td className={`p-1.5 sm:p-2 text-right font-mono ${player.chips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                          ${player.chips}
                                        </td>
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
            <Card className="bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 border-2 border-amber-600/30">
              <CardContent className="pt-8 pb-8">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber-900/30 flex items-center justify-center border border-amber-600/30">
                    <span className="text-3xl text-amber-400/50">📜</span>
                  </div>
                  <p className="text-amber-300/60">No historical sessions yet.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            historicalGames.map((game) => (
              <Card 
                key={game.id} 
                className="bg-gradient-to-br from-slate-900/80 via-slate-800/80 to-slate-900/80 border border-amber-700/30 hover:border-amber-600/50 transition-all"
              >
                <CardContent className="py-3">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-amber-400/60">Host:</span>{' '}
                        <span className="font-medium text-amber-100">{game.host_username}</span>
                      </div>
                      <div>
                        <span className="text-amber-400/60">Started:</span>{' '}
                        <span className="text-amber-100">{format(new Date(game.created_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                      {game.session_ended_at && (
                        <div>
                          <span className="text-amber-400/60">Ended:</span>{' '}
                          <span className="text-amber-100">{format(new Date(game.session_ended_at), 'MMM d, yyyy h:mm a')}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-amber-400/60">Players:</span>{' '}
                        <span className="text-amber-100">{game.player_count}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSession(game);
                        setShowSessionResults(true);
                      }}
                      className="border-amber-600/50 text-amber-400 hover:bg-amber-600/10"
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
              Start a new game of Peoria Poker League
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Start a dealer call-it home game session. Players begin at $0 and can go into debt. The dealer will select the game type and configure rules once the game starts.
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

      <GameDefaultsConfig 
        open={showDefaultsConfig} 
        onOpenChange={setShowDefaultsConfig} 
      />
    </div>
  );
};
