import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bug, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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

export function RoundHandDebugOverlay({ gameId }: { gameId: string | undefined }) {
  const location = useLocation();
  const enabled = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("debug") === "1" || sp.get("debug") === "true";
  }, [location.search]);

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

      const maxRoundFromRounds = rounds.reduce<number | null>((acc, r) => {
        const rn = typeof r.round_number === "number" ? r.round_number : null;
        if (rn === null) return acc;
        return acc === null ? rn : Math.max(acc, rn);
      }, null);

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

  useEffect(() => {
    if (!enabled) return;
    // fetch once so it is populated when user opens it
    fetchSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gameId]);

  useEffect(() => {
    if (!enabled) return;
    if (!autoRefresh) {
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
  }, [autoRefresh, enabled, fetchSnapshot]);

  if (!enabled || !gameId) return null;

  const mismatch =
    snapshot &&
    typeof snapshot.gameCurrentHand === "number" &&
    typeof snapshot.maxHandFromRounds === "number" &&
    snapshot.gameCurrentHand > snapshot.maxHandFromRounds;

  const formatId = (id: string | null) => (id ? `${id.slice(0, 8)}…${id.slice(-6)}` : "-");

  return (
    <div className="fixed bottom-4 left-4 z-[210] max-w-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between gap-2 bg-background/95 backdrop-blur border-muted-foreground/30"
            onClick={() => {
              // ensure fresh snapshot right when opening
              if (!open) fetchSnapshot();
            }}
          >
            <span className="flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Round/Hand Debug
            </span>
            <span className="text-[10px] text-muted-foreground">debug=1</span>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="bg-background/95 backdrop-blur border border-border rounded-lg p-3 space-y-3 text-xs">
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
              </>
            ) : (
              <div className="text-center text-muted-foreground py-4">Loading…</div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
