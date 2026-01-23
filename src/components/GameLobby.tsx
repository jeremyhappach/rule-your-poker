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
import { logSessionCreated } from "@/lib/sessionEventLog";
import { formatChipValue } from "@/lib/utils";
import { getBotAlias } from "@/lib/botAlias";
import { PerfSession } from "@/lib/perf";
import { Settings, Info, Wrench } from "lucide-react";
import { GameRules } from "@/components/GameRules";
import peoriaSkyline from "@/assets/peoria-skyline.jpg";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";
import { RealMoneyWarningDialog } from "@/components/RealMoneyWarningDialog";
import { useDeviceSize } from "@/hooks/useDeviceSize";
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
  real_money?: boolean;
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

// Timestamp when this component was first mounted - used to detect stale BFCache restores
const LOBBY_MOUNT_TIME = Date.now();

export const GameLobby = ({ userId }: GameLobbyProps) => {
  // Initialize with empty array - never use any cached/restored state
  const [games, setGames] = useState<Game[]>(() => {
    // If this component is mounting from a BFCache restore that's more than 5 minutes old,
    // the entire page is stale and we should reload
    const timeSinceMount = Date.now() - LOBBY_MOUNT_TIME;
    if (timeSinceMount > 5 * 60 * 1000) {
      // This is a stale BFCache restore - force reload
      window.location.reload();
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Game | null>(null);
  const [showSessionResults, setShowSessionResults] = useState(false);
  const [showDefaultsConfig, setShowDefaultsConfig] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [realMoney, setRealMoney] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [pendingRealMoneyGameId, setPendingRealMoneyGameId] = useState<string | null>(null);
  const [creatingGame, setCreatingGame] = useState(false);
  const { isMaintenanceMode, loading: maintenanceLoading } = useMaintenanceMode();
  const { isTablet } = useDeviceSize();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Detect if this is a stale BFCache/frozen page restore
    // If the page navigation type is "back_forward", force a full reload to get fresh assets
    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navEntry?.type === "back_forward") {
      console.log("[GameLobby] Detected back_forward navigation, forcing reload for fresh content");
      window.location.reload();
      return;
    }

    fetchGames();
    checkSuperuser();

    // iOS Safari (and some mobile browsers) can keep SPA pages "alive" while hidden
    // or restore them from memory. Refresh the lobby when the page becomes visible
    // again so we don't display stale game lists after publishes/settings changes.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchGames();
        checkSuperuser();
      }
    };

    const handleWindowFocus = () => {
      fetchGames();
      checkSuperuser();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    // Polling fallback for realtime reliability - poll every 10 seconds (NOT 1 second - that hammers DB)
    const pollingInterval = setInterval(() => {
      fetchGames();
    }, 10000);

    const gamesChannel = supabase
      .channel('games-lobby-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games'
        },
        () => {
          // Realtime triggered - fetch updates
          fetchGames();
        }
      )
      .subscribe();

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
        () => {
          // Realtime triggered - fetch updates
          fetchGames();
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
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
    const perf = new PerfSession("GameLobby.fetchGames", 300);

    // Fetch games + their current players in ONE query (avoid N+1).
    const { data: gamesData, error } = await perf.step("games.select", () =>
      supabase
        .from("games")
        .select(
          `
            *,
            players:players(
              id,
              user_id,
              position,
              chips,
              legs,
              is_bot,
              sitting_out,
              created_at,
              profiles(username)
            )
          `
        )
        .order("created_at", { ascending: false })
    );

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch games",
        variant: "destructive",
      });
      perf.done({ error: error.message });
      return;
    }

    // Batch fetch snapshots for ended sessions (so we can include departed players in counts)
    const endedGameIds = (gamesData || [])
      .filter((g: any) => g.status === "session_ended")
      .map((g: any) => g.id);

    const snapshotCounts: Record<string, number> = {};

    if (endedGameIds.length > 0) {
      const { data: snapshots, error: snapError } = await perf.step("snapshots.select", () =>
        supabase
          .from("session_player_snapshots")
          .select("game_id, user_id, player_id, is_bot")
          .in("game_id", endedGameIds)
      );

      if (!snapError && snapshots?.length) {
        const perGameKeys = new Map<string, Set<string>>();
        for (const snap of snapshots as any[]) {
          const key = (snap.is_bot ?? false) ? `bot:${snap.player_id}` : `user:${snap.user_id}`;
          const set = perGameKeys.get(snap.game_id) ?? new Set<string>();
          set.add(key);
          perGameKeys.set(snap.game_id, set);
        }
        for (const [gid, set] of perGameKeys.entries()) {
          snapshotCounts[gid] = set.size;
        }
      }
    }

    const gamesWithPlayers = await perf.step("games.enrich", async () =>
      (gamesData || []).map((game: any) => {
        const playersData = (game.players ?? []) as any[];

        // Host is the first human player who joined (earliest created_at)
        const humanPlayers = playersData.filter((p) => !p.is_bot);
        const sortedByJoinTime = [...humanPlayers].sort((a, b) => {
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        });
        const hostPlayer = sortedByJoinTime[0];
        const host_username = hostPlayer?.profiles?.username || "Unknown";

        const isCreator = hostPlayer?.user_id === userId;
        const isPlayer = playersData.some((p) => p.user_id === userId);

        // Calculate duration
        const durationMinutes = Math.floor((Date.now() - new Date(game.created_at).getTime()) / (1000 * 60));

        // Use snapshot count for ended sessions, current players otherwise
        const playerCount =
          game.status === "session_ended" && snapshotCounts[game.id] !== undefined
            ? snapshotCounts[game.id]
            : playersData.length;

        return {
          ...game,
          player_count: playerCount,
          is_creator: isCreator,
          is_player: isPlayer,
          host_username,
          duration_minutes: durationMinutes,
          players:
            playersData.map((p) => ({
              id: p.id,
              username: p.is_bot
                ? getBotAlias(
                    playersData.map((pd) => ({ user_id: pd.user_id, is_bot: pd.is_bot, created_at: pd.created_at })),
                    p.user_id
                  )
                : (p.profiles?.username || "Unknown"),
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
    perf.done({ gameCount: gamesData?.length ?? 0 });
  };

  const createGame = async () => {
    // Prevent double-clicks
    if (creatingGame) return;
    setCreatingGame(true);

    const perf = new PerfSession("GameLobby.createGame", 300);

    try {
      // Fetch last 50 game names to avoid duplicates
      const { data: recentGames } = await perf.step("games.recentNames", () =>
        supabase
          .from("games")
          .select("name")
          .order("created_at", { ascending: false })
          .limit(50)
      );

      const recentNames = (recentGames?.map((g) => g.name).filter(Boolean) as string[]) || [];

      const sessionName = generateGameName(recentNames);

      // Create game with waiting status
      const { data: game, error: gameError } = await perf.step("games.insert", () =>
        supabase
          .from("games")
          .insert({
            buy_in: 100,
            status: "waiting",
            name: sessionName,
            real_money: realMoney,
          })
          .select()
          .single()
      );

      if (gameError) {
        toast({
          title: "Error",
          description: "Failed to create game",
          variant: "destructive",
        });
        perf.done({ error: gameError.message });
        return;
      }

      // Log session creation event
      await perf.step("session_events.insert", () => logSessionCreated(game.id, userId, sessionName));

      // Auto-seat host in a random position (1-7)
      const randomPosition = Math.floor(Math.random() * 7) + 1;

      // Fetch user's profile to get their deck_color_mode preference
      const { data: userProfile } = await perf.step("profiles.select", () =>
        supabase.from("profiles").select("deck_color_mode").eq("id", userId).maybeSingle()
      );

      const { error: playerError } = await perf.step("players.insert", () =>
        supabase.from("players").insert({
          game_id: game.id,
          user_id: userId,
          chips: 0,
          position: randomPosition,
          sitting_out: false,
          waiting: true, // Ready to play when game starts
          deck_color_mode: userProfile?.deck_color_mode || null,
        })
      );

      if (playerError) {
        console.error("Error seating host:", playerError);

        // Clean up the game if we couldn't seat the host
        await perf.step("games.cleanupDelete", () => supabase.from("games").delete().eq("id", game.id));

        toast({
          title: "Error",
          description: "Failed to create game",
          variant: "destructive",
        });
        perf.done({ error: playerError.message });
        return;
      }

      setShowCreateDialog(false);
      navigate(`/game/${game.id}`);
      perf.done({ ok: true });
    } finally {
      setCreatingGame(false);
    }
  };

  const joinGame = async (gameId: string, skipWarning = false) => {
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle();

    // If already a player, just navigate
    if (existingPlayer) {
      navigate(`/game/${gameId}`);
      return;
    }

    // Check if this is a real money game and show warning if needed
    if (!skipWarning) {
      const game = games.find(g => g.id === gameId);
      if (game?.real_money) {
        setPendingRealMoneyGameId(gameId);
        return;
      }
    }

    // Everyone except the host joins as observer and selects their seat
    // The host is already seated when they create the game
    navigate(`/game/${gameId}`);
  };

  const handleRealMoneyConfirm = () => {
    if (pendingRealMoneyGameId) {
      const gameId = pendingRealMoneyGameId;
      setPendingRealMoneyGameId(null);
      joinGame(gameId, true);
    }
  };

  const handleRealMoneyCancel = () => {
    setPendingRealMoneyGameId(null);
  };

  const deleteGame = async (gameId: string) => {
    // Check if game has any history (rounds played)
    const { data: rounds, error: roundsError } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId)
      .limit(1);

    if (roundsError) {
      console.error('Error checking game history:', roundsError);
      toast({
        title: "Error",
        description: "Failed to check game history",
        variant: "destructive",
      });
      return;
    }

    const hasHistory = rounds && rounds.length > 0;

    if (hasHistory) {
      // Move to session_ended status instead of deleting (so it moves to historical)
      const { error: updateError } = await supabase
        .from('games')
        .update({
          status: 'session_ended',
          session_ended_at: new Date().toISOString()
        })
        .eq('id', gameId);

      if (updateError) {
        toast({
          title: "Error",
          description: "Failed to end game session",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Session Ended",
        description: "Game moved to historical (history preserved)",
      });
    } else {
      // No history, safe to delete
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
    }

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

  // Check if user is blocked (maintenance mode + not superuser)
  const isBlocked = isMaintenanceMode && !isSuperuser;

  return (
    <div className="space-y-6">
      {/* Maintenance Mode Banner */}
      {isMaintenanceMode && (
        <div className="bg-amber-900/40 border-2 border-amber-600/60 rounded-xl p-4 flex items-center gap-3">
          <Wrench className="h-6 w-6 text-amber-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-amber-300">Under Maintenance</h3>
            <p className="text-sm text-amber-200/80">
              {isSuperuser 
                ? "Maintenance mode is active. Other users are blocked from all actions."
                : "The app is currently under maintenance. Please check back later."}
            </p>
          </div>
        </div>
      )}
      {/* Header with Peoria Skyline Backdrop */}
      <div className="relative overflow-hidden rounded-xl border border-amber-700/30 h-[200px] sm:min-h-[240px] md:min-h-[280px]">
        {/* Bridge Background - All devices */}
        <img 
          src={peoriaBridgeMobile} 
          alt="I-74 Bridge Peoria Illinois"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient Overlay - lighter at top to show skyline, darker at bottom for text */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        {/* Content - title at top, buttons at bottom */}
        <div className="absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4 md:p-6">
          {/* Title section */}
          <div className="flex items-center justify-between">
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
            <Button 
              onClick={() => setShowRulesDialog(true)} 
              size="sm"
              variant="ghost"
              className={`p-0 text-amber-300 hover:text-amber-100 hover:bg-amber-600/20 -mt-2 ${
                isTablet ? 'h-16 w-16' : 'h-10 w-10'
              }`}
              title="Game Rules"
            >
              <Info className={isTablet ? 'h-10 w-10' : 'h-6 w-6'} />
            </Button>
          </div>
          
          {/* Buttons section - at bottom */}
          <div className="flex gap-2 w-full sm:w-auto sm:justify-end mt-auto">
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
              disabled={isBlocked}
              className="flex-1 sm:flex-none bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold shadow-lg shadow-amber-500/30 text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create New Game
            </Button>
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
            Completed ({historicalGames.length})
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
                      <div className="flex flex-col gap-2 pb-3 border-b border-amber-700/30">
                        {/* Game name - full width */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md flex-shrink-0">
                            <span className="text-black text-xs sm:text-sm font-bold">♦</span>
                          </div>
                          <h3 className="font-bold text-amber-100 text-sm sm:text-base flex-1">
                            {game.name || `Game #${game.id.slice(0, 8)}`}
                            {game.real_money && <span className="text-green-400 ml-1">$</span>}
                          </h3>
                        </div>
                        
                        {/* Button and badges row */}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => joinGame(game.id)}
                            disabled={(game.player_count >= 7 && !game.is_player) || isBlocked}
                            className={`w-1/2 sm:w-auto text-xs sm:text-sm ${game.is_player 
                              ? 'bg-blue-600 hover:bg-blue-500 text-white'
                              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {game.is_player ? 'Re-Join' : 'Join'}
                          </Button>
                          <div className="flex gap-1 flex-1">
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
                                  {game.real_money && <span className="text-green-400 ml-1">$</span>}
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
                                          ${formatChipValue(player.chips)}
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
                        <span className="text-amber-400/60">Name:</span>{' '}
                        <span className="font-medium text-amber-100">
                          {game.name || `Game #${game.id.slice(0, 8)}`}
                          {game.real_money && <span className="text-green-400 ml-1">$</span>}
                        </span>
                      </div>
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

      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) setRealMoney(false); // Reset when closing
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Game</DialogTitle>
            <DialogDescription>
              Start a new game of Peoria Poker League
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Start a dealer call-it home game session. Players begin at $0 and can go into debt. The dealer will select the game type and configure rules once the game starts.
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg border border-amber-600/30 bg-slate-800/50">
                <div>
                  <div className="font-medium text-amber-100">Real Money</div>
                  <div className="text-xs text-amber-300/60">Track this session for real money</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={realMoney}
                    onChange={(e) => setRealMoney(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
              {realMoney && (
                <p className="text-xs font-bold text-red-400 px-1">
                  Results of this session will be reflected in player balances when session completes.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createGame} disabled={creatingGame}>
              {creatingGame ? 'Creating...' : 'Create Game'}
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
          currentUserId={userId}
          session={{
            id: selectedSession.id,
            created_at: selectedSession.created_at,
            session_ended_at: selectedSession.session_ended_at || selectedSession.created_at,
            total_hands: selectedSession.total_hands || 0,
            host_username: selectedSession.host_username || 'Unknown',
            game_type: selectedSession.game_type,
            real_money: selectedSession.real_money,
            players: selectedSession.players || [],
          }}
        />
      )}

      <GameDefaultsConfig 
        open={showDefaultsConfig} 
        onOpenChange={setShowDefaultsConfig} 
      />

      <GameRules 
        open={showRulesDialog} 
        onOpenChange={setShowRulesDialog} 
      />

      <RealMoneyWarningDialog
        open={!!pendingRealMoneyGameId}
        onConfirm={handleRealMoneyConfirm}
        onCancel={handleRealMoneyCancel}
      />
    </div>
  );
};
