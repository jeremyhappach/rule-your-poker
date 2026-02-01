import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RefreshCw, Bug } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeadlineDebugPanelProps {
  gameId: string | undefined;
  userId: string | undefined;
}

interface PlayerDebugInfo {
  id: string;
  user_id: string;
  position: number;
  username: string;
  is_bot: boolean;
  sitting_out: boolean;
  sit_out_next_hand: boolean;
  stand_up_next_hand: boolean;
  waiting: boolean;
  status: string;
  auto_ante: boolean;
  auto_fold: boolean;
  ante_decision: string | null;
  current_decision: string | null;
  chips: number;
  legs: number;
}

interface DeadlineInfo {
  name: string;
  deadline: string | null;
  msFromNow: number | null;
  isExpired: boolean;
}

interface DebugSnapshot {
  timestamp: string;
  gameId: string;
  gameStatus: string;
  gameName: string | null;
  currentRound: number | null;
  dealerPosition: number | null;
  totalHands: number | null;
  isFirstHand: boolean;
  myPlayer: PlayerDebugInfo | null;
  allPlayers: PlayerDebugInfo[];
  deadlines: DeadlineInfo[];
  humanActiveCount: number;
  humanTotalCount: number;
  botCount: number;
}

export const DeadlineDebugPanel = ({ gameId, userId }: DeadlineDebugPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!gameId) return;

    setIsRefreshing(true);

    try {
      // Fetch game data
      const { data: gameData } = await supabase
        .from('games')
        .select(`
          id,
          status,
          name,
          current_round,
          dealer_position,
          total_hands,
          is_first_hand,
          config_deadline,
          ante_decision_deadline,
          game_over_at
        `)
        .eq('id', gameId)
        .single();

      if (!gameData) {
        setSnapshot(null);
        setIsRefreshing(false);
        return;
      }

      // Fetch players with profiles
      const { data: playersData } = await supabase
        .from('players')
        .select(`
          id,
          user_id,
          position,
          is_bot,
          sitting_out,
          sit_out_next_hand,
          stand_up_next_hand,
          waiting,
          status,
          auto_ante,
          auto_fold,
          ante_decision,
          current_decision,
          chips,
          legs,
          profiles!inner(username)
        `)
        .eq('game_id', gameId)
        .order('position');

      // Fetch round deadline if we have a current round
      let roundDeadline: string | null = null;
      if (gameData.current_round) {
        const { data: roundData } = await supabase
          .from('rounds')
          .select('decision_deadline')
          .eq('game_id', gameId)
          .eq('round_number', gameData.current_round)
          .single();
        roundDeadline = roundData?.decision_deadline ?? null;
      }

      const now = Date.now();

      // Build deadline info
      const deadlines: DeadlineInfo[] = [];

      if (gameData.config_deadline) {
        const dl = new Date(gameData.config_deadline).getTime();
        deadlines.push({
          name: 'Config Deadline',
          deadline: gameData.config_deadline,
          msFromNow: dl - now,
          isExpired: dl < now,
        });
      }

      if (gameData.ante_decision_deadline) {
        const dl = new Date(gameData.ante_decision_deadline).getTime();
        deadlines.push({
          name: 'Ante Decision',
          deadline: gameData.ante_decision_deadline,
          msFromNow: dl - now,
          isExpired: dl < now,
        });
      }

      if (roundDeadline) {
        const dl = new Date(roundDeadline).getTime();
        deadlines.push({
          name: 'Round Decision',
          deadline: roundDeadline,
          msFromNow: dl - now,
          isExpired: dl < now,
        });
      }

      if (gameData.game_over_at) {
        const dl = new Date(gameData.game_over_at).getTime();
        deadlines.push({
          name: 'Game Over At',
          deadline: gameData.game_over_at,
          msFromNow: dl - now,
          isExpired: dl < now,
        });
      }

      // Map players
      const players: PlayerDebugInfo[] = (playersData || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        position: p.position,
        username: p.profiles?.username || 'Unknown',
        is_bot: p.is_bot,
        sitting_out: p.sitting_out,
        sit_out_next_hand: p.sit_out_next_hand,
        stand_up_next_hand: p.stand_up_next_hand,
        waiting: p.waiting,
        status: p.status,
        auto_ante: p.auto_ante,
        auto_fold: p.auto_fold,
        ante_decision: p.ante_decision,
        current_decision: p.current_decision,
        chips: p.chips,
        legs: p.legs,
      }));

      const myPlayer = players.find(p => p.user_id === userId) || null;
      const humanPlayers = players.filter(p => !p.is_bot);
      const humanActive = humanPlayers.filter(p => !p.sitting_out);

      setSnapshot({
        timestamp: new Date().toISOString(),
        gameId: gameData.id,
        gameStatus: gameData.status,
        gameName: gameData.name,
        currentRound: gameData.current_round,
        dealerPosition: gameData.dealer_position,
        totalHands: gameData.total_hands,
        isFirstHand: gameData.is_first_hand,
        myPlayer,
        allPlayers: players,
        deadlines,
        humanActiveCount: humanActive.length,
        humanTotalCount: humanPlayers.length,
        botCount: players.filter(p => p.is_bot).length,
      });
    } catch (e) {
      console.error('[DeadlineDebugPanel] Error fetching snapshot:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [gameId, userId]);

  // Fetch on open
  useEffect(() => {
    if (isOpen && gameId) {
      fetchSnapshot();
    }
  }, [isOpen, gameId, fetchSnapshot]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && isOpen) {
      autoRefreshRef.current = setInterval(fetchSnapshot, 2000);
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
      autoRefreshRef.current = null;
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, [autoRefresh, isOpen, fetchSnapshot]);

  if (!gameId) return null;

  const formatMs = (ms: number | null): string => {
    if (ms === null) return '-';
    const seconds = Math.round(ms / 1000);
    if (seconds < 0) return `${seconds}s (expired)`;
    return `${seconds}s`;
  };

  const getBadgeVariant = (value: boolean): 'default' | 'destructive' | 'outline' => {
    return value ? 'destructive' : 'outline';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full flex items-center justify-between gap-2 bg-background/95 backdrop-blur border-muted-foreground/30"
          >
            <span className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Debug Panel
            </span>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="bg-background/95 backdrop-blur border border-border rounded-lg p-3 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
            {/* Header with controls */}
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
              <span className="font-medium text-muted-foreground">
                {snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString() : 'Loading...'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  {autoRefresh ? 'Stop' : 'Auto'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={fetchSnapshot}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
                </Button>
              </div>
            </div>

            {snapshot ? (
              <>
                {/* Game Info */}
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Game</div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Status:</span>
                    <Badge variant="outline" className="text-xs h-5">{snapshot.gameStatus}</Badge>
                    <span>Round:</span>
                    <span>{snapshot.currentRound ?? '-'}</span>
                    <span>Hand #:</span>
                    <span>{snapshot.totalHands ?? 0}{snapshot.isFirstHand ? ' (first)' : ''}</span>
                    <span>Dealer Pos:</span>
                    <span>{snapshot.dealerPosition ?? '-'}</span>
                  </div>
                </div>

                {/* Player Counts */}
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Players</div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      Humans Active: {snapshot.humanActiveCount}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Humans Total: {snapshot.humanTotalCount}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Bots: {snapshot.botCount}
                    </Badge>
                  </div>
                </div>

                {/* Deadlines */}
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Deadlines</div>
                  {snapshot.deadlines.length > 0 ? (
                    <div className="space-y-1">
                      {snapshot.deadlines.map((dl, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{dl.name}:</span>
                          <Badge variant={dl.isExpired ? 'destructive' : 'outline'} className="text-xs">
                            {formatMs(dl.msFromNow)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No active deadlines</span>
                  )}
                </div>

                {/* My Player */}
                {snapshot.myPlayer && (
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">My Status ({snapshot.myPlayer.username})</div>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant={getBadgeVariant(snapshot.myPlayer.sitting_out)} className="text-xs">
                        sitting_out: {snapshot.myPlayer.sitting_out ? 'YES' : 'no'}
                      </Badge>
                      <Badge variant={getBadgeVariant(snapshot.myPlayer.sit_out_next_hand)} className="text-xs">
                        sit_out_next: {snapshot.myPlayer.sit_out_next_hand ? 'YES' : 'no'}
                      </Badge>
                      <Badge variant={getBadgeVariant(snapshot.myPlayer.stand_up_next_hand)} className="text-xs">
                        stand_up_next: {snapshot.myPlayer.stand_up_next_hand ? 'YES' : 'no'}
                      </Badge>
                      <Badge variant={getBadgeVariant(snapshot.myPlayer.waiting)} className="text-xs">
                        waiting: {snapshot.myPlayer.waiting ? 'YES' : 'no'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        auto_ante: {snapshot.myPlayer.auto_ante ? 'yes' : 'no'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        auto_fold: {snapshot.myPlayer.auto_fold ? 'yes' : 'no'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground mt-1">
                      <span>Player ID:</span>
                      <span className="font-mono text-[10px] truncate">{snapshot.myPlayer.id}</span>
                      <span>Position:</span>
                      <span>{snapshot.myPlayer.position}</span>
                      <span>Status:</span>
                      <span>{snapshot.myPlayer.status}</span>
                      <span>Ante Decision:</span>
                      <span>{snapshot.myPlayer.ante_decision ?? '-'}</span>
                      <span>Current Decision:</span>
                      <span>{snapshot.myPlayer.current_decision ?? '-'}</span>
                      <span>Chips:</span>
                      <span>{snapshot.myPlayer.chips}</span>
                      <span>Legs:</span>
                      <span>{snapshot.myPlayer.legs}</span>
                    </div>
                  </div>
                )}

                {/* All Players Summary */}
                <div className="space-y-1">
                  <div className="font-medium text-foreground">All Players</div>
                  <div className="space-y-1">
                    {snapshot.allPlayers.map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          'flex items-center gap-2 text-[10px] p-1 rounded',
                          p.user_id === userId && 'bg-primary/10 border border-primary/20'
                        )}
                      >
                        <span className="w-4 text-center">{p.position}</span>
                        <span className="flex-1 truncate">
                          {p.username}
                          {p.is_bot && ' 🤖'}
                        </span>
                        {p.sitting_out && <Badge variant="destructive" className="text-[9px] h-4 px-1">OUT</Badge>}
                        {p.sit_out_next_hand && <Badge variant="secondary" className="text-[9px] h-4 px-1">→OUT</Badge>}
                        {p.waiting && <Badge variant="outline" className="text-[9px] h-4 px-1">WAIT</Badge>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Game ID */}
                <div className="border-t border-border pt-2 text-muted-foreground">
                  <span className="font-mono text-[10px] break-all">Game: {snapshot.gameId}</span>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-4">Loading...</div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
