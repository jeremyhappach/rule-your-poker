import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Snapshot = {
  ts: string;
  gameId: string;
  dealerGameId: string | null;
  gameType: string | null;
  gameStatus: string | null;
  gameCurrentHand: number | null;
  gameCurrentRound: number | null;
  roundsLoaded: number;
  latestRoundKey: {
    id: string;
    hand: number | null;
    round: number;
    status: string;
  } | null;
  maxHandFromRounds: number | null;
  maxRoundFromRounds: number | null;
  maxRoundInMaxHand: number | null;
  hasExactRoundForGameState: boolean;
};

interface RoundHandDebugOverlayProps {
  gameId: string | undefined;
  /** Compact inline mode for player area */
  inline?: boolean;
}

export function RoundHandDebugOverlay({ gameId, inline = false }: RoundHandDebugOverlayProps) {
  const [open, setOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!gameId) return;
    setIsRefreshing(true);

    try {
      const { data: game } = await supabase
        .from("games")
        .select("id, status, game_type, current_game_uuid, total_hands, current_round")
        .eq("id", gameId)
        .single();

      if (!game) {
        setSnapshot(null);
        return;
      }

      const dealerGameId = (game as any).current_game_uuid as string | null;

      let rounds: Array<{
        id: string;
        hand_number: number | null;
        round_number: number;
        status: string;
      }> = [];

      if (dealerGameId) {
        const { data: roundsData } = await supabase
          .from("rounds")
          .select("id, hand_number, round_number, status")
          .eq("game_id", gameId)
          .eq("dealer_game_id", dealerGameId)
          .order("hand_number", { ascending: false })
          .order("round_number", { ascending: false })
          .limit(1000);

        rounds = (roundsData ?? []) as any;
      }

      const maxHandFromRounds = rounds.reduce<number | null>((acc, r) => {
        if (typeof r.hand_number !== "number") return acc;
        return acc === null ? r.hand_number : Math.max(acc, r.hand_number);
      }, null);

      // Max round number across ALL rounds in this dealer game
      const maxRoundFromRounds = rounds.reduce<number | null>((acc, r) => {
        const rn = typeof r.round_number === "number" ? r.round_number : null;
        if (rn === null) return acc;
        return acc === null ? rn : Math.max(acc, rn);
      }, null);

      // Max round number within the max hand only
      const maxRoundInMaxHand =
        maxHandFromRounds === null
          ? null
          : rounds
              .filter((r) => r.hand_number === maxHandFromRounds)
              .reduce<number | null>((acc, r) => {
                const rn = typeof r.round_number === "number" ? r.round_number : null;
                if (rn === null) return acc;
                return acc === null ? rn : Math.max(acc, rn);
              }, null);

      const gameCurrentHand = typeof game.total_hands === "number" ? game.total_hands : null;
      const gameCurrentRound = typeof game.current_round === "number" ? game.current_round : null;

      const hasExactRoundForGameState =
        typeof gameCurrentHand === "number" &&
        typeof gameCurrentRound === "number" &&
        Boolean(
          rounds.find(
            (r) => r.hand_number === gameCurrentHand && r.round_number === gameCurrentRound
          )
        );

      const latest = rounds[0] ?? null;

      setSnapshot({
        ts: new Date().toISOString(),
        gameId: game.id,
        dealerGameId,
        gameType: game.game_type ?? null,
        gameStatus: game.status ?? null,
        gameCurrentHand,
        gameCurrentRound,
        roundsLoaded: rounds.length,
        latestRoundKey: latest
          ? {
              id: latest.id,
              hand: latest.hand_number ?? null,
              round: latest.round_number,
              status: latest.status,
            }
          : null,
        maxHandFromRounds,
        maxRoundFromRounds,
        maxRoundInMaxHand,
        hasExactRoundForGameState,
      });
    } catch (e) {
      console.error("[RoundHandDebugOverlay] fetchSnapshot failed", e);
    } finally {
      setIsRefreshing(false);
    }
  }, [gameId]);

  // Fetch on open
  useEffect(() => {
    if (open && gameId) {
      fetchSnapshot();
    }
  }, [open, gameId, fetchSnapshot]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !open) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(fetchSnapshot, 2000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, open, fetchSnapshot]);

  if (!gameId) return null;

  const mismatch =
    snapshot &&
    typeof snapshot.gameCurrentHand === "number" &&
    typeof snapshot.maxHandFromRounds === "number" &&
    snapshot.gameCurrentHand > snapshot.maxHandFromRounds;

  const formatId = (id: string | null) => (id ? `${id.slice(0, 8)}…` : "-");

  // Inline mode: fixed floating button in top-left corner, expands upward
  if (inline) {
    return (
      <div className="fixed bottom-28 left-2 z-[200]">
        <button
          onClick={() => {
            setOpen((v) => !v);
            if (!open) {
              fetchSnapshot();
              setAutoRefresh(true);
            } else {
              setAutoRefresh(false);
            }
          }}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors shadow-lg",
            open 
              ? "bg-primary text-primary-foreground" 
              : "bg-background/95 backdrop-blur border border-border text-muted-foreground hover:text-foreground"
          )}
        >
          <Bug className="h-3 w-3" />
          <span>Debug</span>
          {mismatch && !open && <span className="text-destructive font-bold">!</span>}
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-1 w-56 bg-background/95 backdrop-blur border border-border rounded-lg p-2 text-[10px] space-y-2 shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
              <span className="text-muted-foreground">
                {snapshot?.ts ? new Date(snapshot.ts).toLocaleTimeString() : "..."}
              </span>
              <div className="flex items-center gap-1">
                <button
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px]",
                    autoRefresh ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => setAutoRefresh((v) => !v)}
                >
                  {autoRefresh ? "Auto ✓" : "Auto"}
                </button>
                <button
                  className="p-0.5 rounded hover:bg-muted"
                  onClick={fetchSnapshot}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                </button>
              </div>
            </div>

            {snapshot ? (
              <div className="space-y-1.5">
                {/* Game State */}
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                  <span className="text-muted-foreground">Hand:</span>
                  <span className={mismatch ? "text-destructive font-bold" : ""}>
                    {snapshot.gameCurrentHand ?? "-"}
                  </span>
                  <span className="text-muted-foreground">Round:</span>
                  <span className={!snapshot.hasExactRoundForGameState ? "text-destructive font-bold" : ""}>
                    {snapshot.gameCurrentRound ?? "-"}
                  </span>
                </div>

                {/* Rounds Table */}
                <div className="border-t border-border pt-1">
                  <div className="text-muted-foreground mb-0.5">Rounds (dealer game):</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                    <span className="text-muted-foreground">Count:</span>
                    <span>{snapshot.roundsLoaded}</span>
                    <span className="text-muted-foreground">Max hand:</span>
                    <span className={mismatch ? "text-destructive font-bold" : ""}>
                      {snapshot.maxHandFromRounds ?? "-"}
                    </span>
                    <span className="text-muted-foreground">Max round:</span>
                    <span>{snapshot.maxRoundFromRounds ?? "-"}</span>
                    <span className="text-muted-foreground">Max rnd in max hand:</span>
                    <span>{snapshot.maxRoundInMaxHand ?? "-"}</span>
                  </div>
                </div>

                {/* Latest Round */}
                {snapshot.latestRoundKey && (
                  <div className="border-t border-border pt-1">
                    <div className="text-muted-foreground mb-0.5">Latest:</div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                      <span className="text-muted-foreground">H/R:</span>
                      <span>
                        {snapshot.latestRoundKey.hand ?? "-"}/{snapshot.latestRoundKey.round}
                      </span>
                      <span className="text-muted-foreground">Status:</span>
                      <span>{snapshot.latestRoundKey.status}</span>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {mismatch && (
                  <div className="bg-destructive/20 text-destructive rounded px-1 py-0.5 text-center font-bold">
                    ⚠ HAND MISMATCH: game says {snapshot.gameCurrentHand}, rounds max is {snapshot.maxHandFromRounds}
                  </div>
                )}
                {!snapshot.hasExactRoundForGameState && snapshot.gameCurrentHand !== null && (
                  <div className="bg-destructive/20 text-destructive rounded px-1 py-0.5 text-center font-bold">
                    ⚠ ROUND MISSING: H{snapshot.gameCurrentHand}/R{snapshot.gameCurrentRound} not in table
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-2">Loading…</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Fixed overlay mode (original)
  return (
    <div className="fixed bottom-4 left-4 z-[210] max-w-sm">
      <div className="flex flex-col">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between gap-2 bg-background/95 backdrop-blur border-muted-foreground/30"
          onClick={() => {
            setOpen((v) => !v);
            if (!open) fetchSnapshot();
          }}
        >
          <span className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Round/Hand Debug
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {open && (
          <div className="mt-2 bg-background/95 backdrop-blur border border-border rounded-lg p-3 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
              <span className="text-muted-foreground">
                {snapshot?.ts ? new Date(snapshot.ts).toLocaleTimeString() : "Loading…"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setAutoRefresh((v) => !v)}
                >
                  {autoRefresh ? "Stop" : "Auto"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={fetchSnapshot}
                  disabled={isRefreshing}
                  title="Refresh"
                >
                  <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                </Button>
              </div>
            </div>

            {snapshot ? (
              <>
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Game state</div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Status:</span>
                    <span>{snapshot.gameStatus ?? "-"}</span>
                    <span>Type:</span>
                    <span>{snapshot.gameType ?? "-"}</span>
                    <span>Dealer game:</span>
                    <span className="font-mono text-[10px] truncate">{formatId(snapshot.dealerGameId)}</span>
                    <span>Current hand:</span>
                    <span>
                      <Badge variant={mismatch ? "destructive" : "outline"} className="h-5 text-xs">
                        {snapshot.gameCurrentHand ?? "-"}
                      </Badge>
                    </span>
                    <span>Current round:</span>
                    <span>
                      <Badge variant={snapshot.hasExactRoundForGameState ? "outline" : "destructive"} className="h-5 text-xs">
                        {snapshot.gameCurrentRound ?? "-"}
                      </Badge>
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="font-medium text-foreground">Rounds table (this dealer game)</div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Rounds loaded:</span>
                    <span>{snapshot.roundsLoaded}</span>
                    <span>Max hand:</span>
                    <span>
                      <Badge variant="outline" className="h-5 text-xs">
                        {snapshot.maxHandFromRounds ?? "-"}
                      </Badge>
                    </span>
                    <span>Max round #:</span>
                    <span>
                      <Badge variant="outline" className="h-5 text-xs">
                        {snapshot.maxRoundFromRounds ?? "-"}
                      </Badge>
                    </span>
                    <span>Max round (max hand):</span>
                    <span>
                      <Badge variant="outline" className="h-5 text-xs">
                        {snapshot.maxRoundInMaxHand ?? "-"}
                      </Badge>
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="font-medium text-foreground">Latest round key</div>
                  {snapshot.latestRoundKey ? (
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                      <span>Hand/Round:</span>
                      <span>
                        {snapshot.latestRoundKey.hand ?? "-"}/{snapshot.latestRoundKey.round}
                      </span>
                      <span>Status:</span>
                      <span>
                        <Badge variant="outline" className="h-5 text-xs">
                          {snapshot.latestRoundKey.status}
                        </Badge>
                      </span>
                      <span>Round id:</span>
                      <span className="font-mono text-[10px] truncate">{formatId(snapshot.latestRoundKey.id)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No rounds found for current dealer game.</span>
                  )}
                </div>

                {/* Warnings */}
                {mismatch && (
                  <div className="bg-destructive/20 text-destructive rounded px-2 py-1 text-center font-bold text-xs">
                    ⚠ HAND MISMATCH
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-4">Loading…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
