import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bug, X } from "lucide-react";
import { format } from "date-fns";

type SnapshotRow = {
  id: string;
  created_at: string | null;
  game_id: string;
  player_id: string;
  user_id: string;
  username: string;
  chips: number;
  is_bot: boolean | null;
  hand_number: number;
};

function shortId(id?: string | null) {
  if (!id) return "";
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

export function SnapshotsDebugOverlay({ gameId }: { gameId: string }) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [lastInsertId, setLastInsertId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const fetchAll = async () => {
      const { data, error } = await supabase
        .from("session_player_snapshots")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(250);

      if (cancelled) return;

      if (error) {
        console.error("[SnapshotsDebugOverlay] fetch error", error);
        setSnapshots([]);
        return;
      }

      setSnapshots((data as SnapshotRow[]) ?? []);
    };

    fetchAll();

    const channel = supabase
      .channel(`snapshots-debug-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_player_snapshots",
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as SnapshotRow;
          setLastInsertId(row.id);
          setSnapshots((prev) => {
            if (prev.some((s) => s.id === row.id)) return prev;
            return [row, ...prev].slice(0, 250);
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [open, gameId]);

  const latestByParticipant = useMemo(() => {
    const map = new Map<string, SnapshotRow>();
    // snapshots are already newest-first
    for (const s of snapshots) {
      const key = (s.is_bot ?? false) ? `bot:${s.player_id}` : `user:${s.user_id}`;
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values());
  }, [snapshots]);

  const latestSum = useMemo(() => {
    return latestByParticipant.reduce((sum, s) => sum + (Number(s.chips) || 0), 0);
  }, [latestByParticipant]);

  // Avoid auto-opening on initial mount.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
  }, []);

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant={open ? "secondary" : "outline"}
          size="sm"
          className="shadow"
          onClick={() => setOpen((v) => !v)}
        >
          <Bug className="h-4 w-4 mr-2" />
          Snapshots
          <Badge variant="secondary" className="ml-2">
            {snapshots.length}
          </Badge>
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="absolute inset-0 p-4 flex items-end sm:items-center justify-center">
            <Card className="w-full max-w-xl border shadow-lg">
              <div className="flex items-center justify-between p-3 border-b">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">Snapshot Debug</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Latest-per-player sum: <span className={latestSum === 0 ? "text-foreground" : "text-destructive"}>{latestSum}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close snapshot debug overlay">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="h-[60vh]">
                <div className="p-3 space-y-2 font-mono text-xs">
                  {snapshots.length === 0 ? (
                    <div className="text-muted-foreground">No snapshots yet.</div>
                  ) : (
                    snapshots.map((s, idx) => {
                      const isNew = s.id === lastInsertId;
                      const ts = s.created_at ? format(new Date(s.created_at), "HH:mm:ss.SSS") : "(no time)";
                      return (
                        <div key={s.id} className="rounded border bg-card p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 truncate">
                              <span className="text-muted-foreground">#{idx + 1}</span> {s.username}{" "}
                              {(s.is_bot ?? false) ? <span className="text-muted-foreground">(bot)</span> : null}
                            </div>
                            <div className="flex items-center gap-2">
                              {isNew && <Badge variant="default">NEW</Badge>}
                              <Badge variant={s.chips >= 0 ? "default" : "destructive"}>
                                {s.chips >= 0 ? "+" : ""}{s.chips}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                            <div>hand: {s.hand_number}</div>
                            <div>time: {ts}</div>
                            <div>player: {shortId(s.player_id)}</div>
                            <div>user: {shortId(s.user_id)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>

              <div className="p-3 border-t text-xs text-muted-foreground">
                This updates live as snapshots are written.
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
