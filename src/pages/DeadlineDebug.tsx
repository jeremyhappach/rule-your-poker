import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type GameRow = {
  id: string;
  status: string;
  name: string | null;
  game_type: string | null;
  updated_at: string;
};

export default function DeadlineDebug() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [gameId, setGameId] = useState(searchParams.get("gameId") ?? "");
  const [games, setGames] = useState<GameRow[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [auditOnly, setAuditOnly] = useState(true);
  const [debugDeadlines, setDebugDeadlines] = useState(
    typeof window !== "undefined" && window.localStorage.getItem("debugDeadlines") === "1"
  );
  const [resultJson, setResultJson] = useState<string>("");

  const selectedGame = useMemo(() => games.find((g) => g.id === gameId) ?? null, [games, gameId]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/auth");
      }
    };
    init();
  }, [navigate]);

  useEffect(() => {
    // Keep query param in sync for easy sharing
    const next = new URLSearchParams(searchParams);
    if (gameId) next.set("gameId", gameId);
    else next.delete("gameId");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("debugDeadlines", debugDeadlines ? "1" : "0");
  }, [debugDeadlines]);

  const refreshGames = async () => {
    setLoadingGames(true);
    try {
      const { data, error } = await supabase
        .from("games")
        .select("id,status,name,game_type,updated_at")
        .in("status", [
          "configuring",
          "game_selection",
          "dealer_selection",
          "ante_decision",
          "in_progress",
          "betting",
          "game_over",
          "waiting_for_players",
        ])
        .order("updated_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      setGames((data as GameRow[]) ?? []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message ?? "Failed to load games",
        variant: "destructive",
      });
    } finally {
      setLoadingGames(false);
    }
  };

  const runAudit = async () => {
    if (!gameId) {
      toast({
        title: "Missing gameId",
        description: "Pick a game first.",
        variant: "destructive",
      });
      return;
    }

    setRunningAudit(true);
    setResultJson("");

    try {
      const ts = Date.now();
      const response = await supabase.functions.invoke("enforce-deadlines", {
        body: {
          gameId,
          source: "debug-ui",
          requestId: `debug-ui:${gameId}:${ts}`,
          debug: true,
          auditOnly,
          debugLabel: "DeadlineDebugPage",
        },
      });

      if (response.error) {
        throw response.error;
      }

      setResultJson(JSON.stringify(response.data ?? null, null, 2));
    } catch (e: any) {
      toast({
        title: "Audit failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningAudit(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground p-4">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Deadline Debug</h1>
          <p className="text-sm text-muted-foreground">
            Runs a deadline audit snapshot for a specific game. Enable extra client logging with the toggle.
          </p>
        </header>

        <Card className="p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="game-id">Game ID</Label>
              <Input
                id="game-id"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="Paste a game UUID"
                autoComplete="off"
              />
              {selectedGame && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedGame.name ?? "(unnamed)"} • {selectedGame.status} • {selectedGame.game_type ?? "(unknown)"}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={refreshGames} disabled={loadingGames}>
                {loadingGames ? "Loading…" : "Refresh games"}
              </Button>
              <Button onClick={runAudit} disabled={runningAudit || !gameId}>
                {runningAudit ? "Running…" : "Run audit"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Audit only</div>
                <div className="text-xs text-muted-foreground">
                  When on, the backend returns snapshot without mutating anything.
                </div>
              </div>
              <Switch checked={auditOnly} onCheckedChange={setAuditOnly} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Client debug logs</div>
                <div className="text-xs text-muted-foreground">
                  Sets local flag used by the deadline enforcer hook.
                </div>
              </div>
              <Switch checked={debugDeadlines} onCheckedChange={setDebugDeadlines} />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Active games (latest 30)</div>
            <ScrollArea className="h-44 rounded-md border border-border">
              <div className="p-2 space-y-1">
                {games.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">No games loaded yet.</div>
                ) : (
                  games.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGameId(g.id)}
                      className={`w-full text-left rounded-md px-2 py-1.5 border transition-colors ${
                        g.id === gameId
                          ? "bg-accent text-accent-foreground border-border"
                          : "bg-background text-foreground border-transparent hover:bg-muted"
                      }`}
                    >
                      <div className="text-xs font-mono truncate">{g.id}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {g.name ?? "(unnamed)"} • {g.status} • {g.game_type ?? "(unknown)"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Audit result</div>
            <Button
              variant="outline"
              onClick={() => {
                if (!resultJson) return;
                navigator.clipboard.writeText(resultJson);
                toast({ title: "Copied", description: "Audit JSON copied to clipboard." });
              }}
              disabled={!resultJson}
            >
              Copy JSON
            </Button>
          </div>

          <ScrollArea className="h-[50vh] rounded-md border border-border">
            <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
              {resultJson || "Run an audit to see output here."}
            </pre>
          </ScrollArea>
        </Card>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => navigate("/")}>Back</Button>
        </div>
      </div>
    </main>
  );
}
