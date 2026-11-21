import { requestSessionEnd } from "@/lib/sessionLifecycleAuthority";
import {findGame} from "@/lib/gameCatalog";
import { useLayoutEffect, useState } from "react";
import { useLobbyGames } from "@/hooks/useLobbyGames";
import { cancelOnboardingEntry } from '@/lib/mobileOnboarding';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { SessionResults } from "@/components/SessionResults";
import {AsyncHistory} from './delayed/AsyncHistory';

import { format } from "date-fns";
import { generateGameName } from "@/lib/gameNames";
import { logSessionCreated } from "@/lib/sessionEventLog";
import { createSession } from "@/lib/sessionCreation";
import { formatChipValue } from "@/lib/utils";
import { getBotAlias } from "@/lib/botAlias";
import { PerfSession } from "@/lib/perf";
import { Wrench } from "lucide-react";

import { useIsAdmin } from "@/hooks/useIsAdmin";
import { RealMoneyWarningDialog } from "@/components/RealMoneyWarningDialog";
import { useWakeLock } from "@/hooks/useWakeLock";
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
  points_to_win?: number;
  real_money?: boolean;
  is_paused?: boolean;
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
  isMaintenanceMode: boolean;
  onInitialLoad?: (ready: boolean) => void;
  onOnboardingBlocked?: (blocked: boolean) => void;
}

export const GameLobby = ({ userId, isMaintenanceMode, onInitialLoad, onOnboardingBlocked }: GameLobbyProps) => {
  // Prevent screen from dimming in the lobby
  useWakeLock(true);
  
  const { games, loading, refresh: fetchGames, initialLoadSucceeded } = useLobbyGames(userId);
  useLayoutEffect(() => { onInitialLoad?.(!loading && initialLoadSucceeded); }, [loading, initialLoadSucceeded, onInitialLoad]);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Game | null>(null);
  const [showSessionResults, setShowSessionResults] = useState(false);
  const [realMoney, setRealMoney] = useState(false);
  const { isAdmin: isSuperuser } = useIsAdmin(userId);
  const [pendingRealMoneyGameId, setPendingRealMoneyGameId] = useState<string | null>(null);
  const [creatingGame, setCreatingGame] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const hasRecoverableSession=games.some(game=>game.is_player&&!game.session_ended_at&&!['session_ended','completed','game_over'].includes(game.status));
  const onboardingBlocked=loading||!initialLoadSucceeded||creatingGame||showCreateDialog||showSessionResults||!!pendingRealMoneyGameId||!!deleteGameId||hasRecoverableSession;
  useLayoutEffect(()=>{onOnboardingBlocked?.(onboardingBlocked);},[onboardingBlocked,onOnboardingBlocked]);
  useLayoutEffect(()=>{if(initialLoadSucceeded&&hasRecoverableSession)cancelOnboardingEntry();},[initialLoadSucceeded,hasRecoverableSession]);

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

      const game = await perf.step("session.create", () => createSession(userId, sessionName, realMoney));
      void logSessionCreated(game.game_id, userId, sessionName).catch(console.warn);

      setShowCreateDialog(false);
      navigate(`/game/${game.game_id}`);
      perf.done({ ok: true });
    } catch (error) {
      toast({ title: "Could not create table", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      perf.done({ error: String(error) });
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
    try {
      await requestSessionEnd(gameId);
      setDeleteGameId(null);
      await fetchGames();
    } catch (error) {
      toast({ title: "Could not close session", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
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
      <button className="midnight-create" onClick={()=>setShowCreateDialog(true)} disabled={isBlocked}>Create New Game</button>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get('sessions')==='completed'?'historical':'active'} className="w-full">
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
            activeGames.map(game=><article key={game.id} className="midnight-session">
              <div className="midnight-session-heading"><h3>{game.name||`Game #${game.id.slice(0,8)}`}{game.real_money&&<span className="text-green-400 ml-1">$</span>}</h3>
                <Button size="sm" onClick={()=>joinGame(game.id)} disabled={(game.player_count>=7&&!game.is_player)||isBlocked}>{game.is_player?'Re-Join':'Join'}</Button></div>
              <p>Host: {game.host_username} · Duration: {game.duration_minutes} min · Players: {game.player_count}</p>
              {game.game_type&&game.ante_amount!==undefined&&<p>Last Game: $<span>{formatChipValue(game.ante_amount)}</span> {findGame(game.game_type)?.name??game.game_type}{['holm-game','holm','3-5-7','3-5-7-game'].includes(game.game_type)&&game.pot_max_enabled?`, $${formatChipValue(game.pot_max_value??0)} Max`:''}</p>}
              <div className="midnight-session-status"><span>{game.is_paused?'Paused':game.status==='waiting'?'Waiting':'Active'}</span>{game.is_player&&<span>· Yours</span>}
                {game.is_creator&&game.status==='waiting'&&<Button size="sm" variant="destructive" onClick={()=>setDeleteGameId(game.id)}>Delete</Button>}</div>
            </article>)
          )}
        </TabsContent>
        
        <TabsContent value="historical" className="space-y-2 mt-4">
          <AsyncHistory profileId={userId}/>
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
            historicalGames.filter(game=>game.game_type!=='delayed-head-to-head').map((game) => (
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
              Start a live multiplayer session
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

      <RealMoneyWarningDialog
        open={!!pendingRealMoneyGameId}
        onConfirm={handleRealMoneyConfirm}
        onCancel={handleRealMoneyCancel}
      />
    </div>
  );
};
