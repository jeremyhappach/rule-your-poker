/**
 * Force Instant 3-5-7 Deal — admin-only harness panel.
 *
 * Lives inside the admin-only Geometry Lab modal (which is itself gated
 * to admin viewers). Lets an admin pick any live 3-5-7 game + any
 * currently-active seated player and queue a one-shot override so the
 * NEXT Round 1 dealt by the normal `startRound` path forces that
 * player's cards to 3♣, 5♦, 7♥. Detection and win commit run through
 * the platform's own `has357Hand` / instant-win path — nothing here
 * bypasses the rule under test.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  queue357ForceDeal,
  cancel357ForceDeal,
  fetchPending357ForceDeal,
  FORCED_357_CARDS,
  type ForceDealRow,
} from "@/lib/threeFiveSeven/instantWinHarness";

interface GameRow { id: string; game_type: string; status: string; created_at: string }
interface PlayerRow { id: string; position: number; user_id: string; is_bot: boolean; status: string; sitting_out: boolean; username?: string | null }

export function Force357InstantWinPanel() {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);
  const { isAdmin, loading: adminLoading } = useIsAdmin(userId);
  const [games, setGames] = useState<GameRow[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [pending, setPending] = useState<ForceDealRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Load live 3-5-7 games
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from('games')
        .select('id, game_type, status, created_at')
        .in('game_type', ['3-5-7', '357', '3-5-7-game'])
        .in('status', ['waiting', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(25);
      setGames((data as GameRow[]) ?? []);
    })();
  }, [isAdmin]);

  // Load players & pending override when game changes
  useEffect(() => {
    if (!isAdmin || !selectedGameId) {
      setPlayers([]); setSelectedPlayerId(''); setPending(null);
      return;
    }
    (async () => {
      const [{ data: pls }, pend] = await Promise.all([
        supabase
          .from('players')
          .select('id, position, user_id, is_bot, status, sitting_out, profiles(username)')
          .eq('game_id', selectedGameId)
          .order('position'),
        fetchPending357ForceDeal(selectedGameId),
      ]);
      const seated = ((pls as any[]) ?? [])
        .filter(p => !p.is_bot && p.status !== 'left' && p.status !== 'observer')
        .map(p => ({
          id: p.id, position: p.position, user_id: p.user_id, is_bot: p.is_bot,
          status: p.status, sitting_out: p.sitting_out,
          username: p.profiles?.username ?? null,
        })) as PlayerRow[];
      setPlayers(seated);
      // Default target = admin viewer if seated, else first seated human.
      const viewerRow = seated.find(p => p.user_id === userId);
      setSelectedPlayerId(pend?.target_player_id ?? viewerRow?.id ?? seated[0]?.id ?? '');
      setPending(pend);
    })();
  }, [isAdmin, selectedGameId, userId]);

  if (adminLoading) return null;
  if (!isAdmin) return null;

  const gameLabel = (g: GameRow) => `${g.status} · ${g.id.slice(0, 8)} · ${new Date(g.created_at).toLocaleTimeString()}`;
  const playerLabel = (p: PlayerRow) => `pos ${p.position} · ${p.username ?? p.user_id.slice(0, 8)}${p.sitting_out ? ' (sitting out)' : ''}`;

  const onQueue = async () => {
    if (!selectedGameId || !selectedPlayerId || !userId) return;
    setBusy(true);
    const res = await queue357ForceDeal({ gameId: selectedGameId, targetPlayerId: selectedPlayerId, createdBy: userId });
    setBusy(false);
    if (!res.ok) { toast.error(`Failed to queue: ${res.error}`); return; }
    toast.success('Forced 3-5-7 deal queued for next Round 1');
    setPending(await fetchPending357ForceDeal(selectedGameId));
  };

  const onCancel = async () => {
    if (!selectedGameId) return;
    setBusy(true);
    await cancel357ForceDeal(selectedGameId);
    setBusy(false);
    setPending(null);
    toast.success('Pending force-deal cleared');
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-muted-foreground leading-snug">
        Queues a one-shot override for the next Round 1 dealt by the normal
        3-5-7 <code>startRound</code> path. Target player receives
        {' '}<strong>{FORCED_357_CARDS.map(c => `${c.rank}${c.suit}`).join(' ')}</strong>.
        Detection runs through the unchanged <code>has357Hand</code> path.
        Override auto-consumes on first apply.
      </div>

      <div>
        <Label className="text-xs">Live 3-5-7 game</Label>
        <Select value={selectedGameId} onValueChange={setSelectedGameId}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Select a game" /></SelectTrigger>
          <SelectContent>
            {games.map(g => <SelectItem key={g.id} value={g.id}>{gameLabel(g)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs">Target seated human</Label>
        <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId} disabled={!players.length}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Select a player" /></SelectTrigger>
          <SelectContent>
            {players.map(p => <SelectItem key={p.id} value={p.id}>{playerLabel(p)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={onQueue} disabled={busy || !selectedGameId || !selectedPlayerId}>
          Force Instant 3-5-7 Deal
        </Button>
        {pending && (
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel pending
          </Button>
        )}
      </div>

      {pending && (
        <div className="rounded-md border p-2 text-xs bg-muted/40">
          <div><strong>Pending override</strong></div>
          <div>target_player_id: <code>{pending.target_player_id}</code></div>
          <div>queued: {new Date(pending.created_at).toLocaleString()}</div>
          <div>cards: {(pending.target_cards ?? []).map(c => `${c.rank}${c.suit}`).join(' ')}</div>
          <div>consumed: {pending.consumed_at ? 'yes' : 'no'}</div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-snug">
        Diagnostic events are written to <code>debug_events</code> under
        <code> event_type LIKE '357.instant_win.%'</code> for the affected
        game — includes dealt cards, cards passed into detection,
        <code> has357Hand</code> result, atomic commit outcome, and whether the
        override row was consumed.
      </p>
    </div>
  );
}

export default Force357InstantWinPanel;
