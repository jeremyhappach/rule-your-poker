/**
 * SessionEndedTablePanel — shared transient "Session Ended" table state.
 *
 * Rendered ONLY when a connected client observed the live terminal
 * presentation through to its completion boundary on an authoritatively
 * `session_ended` game (see Game.tsx `sessionEndedTableAdmitted`). It is
 * client-local and purely presentational:
 *   - no database writes on open or close
 *   - no status semantics, no settlement, no payout
 *   - never reconstructed on a fresh mount / reconnect
 *
 * The panel sits over the still-mounted canonical table shell: felt, seat
 * ring, and identity placement remain behind a restrained scrim, which also
 * disables every gameplay affordance underneath (single pointer owner).
 *
 * Authoritative results source: `session_player_snapshots` — the same rows
 * the `record_session_results` trigger reads to mint SessionResult
 * transactions. `chips` on the latest snapshot per participant IS the net
 * session result (running balance across the session), so it is rendered
 * directly rather than reconstructed from the final game payout.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatChipValue } from '@/lib/utils';

interface SessionEndedRow {
  key: string;
  username: string;
  net: number;
  isBot: boolean;
  isSelf: boolean;
}

function formatNet(net: number): string {
  if (net === 0) return '0';
  const sign = net > 0 ? '+' : '-';
  return `${sign}${formatChipValue(Math.abs(net))}`;
}

export interface SessionEndedTablePanelProps {
  gameId: string;
  sessionName?: string | null;
  currentUserId?: string | null;
  onBackToLobby: () => void;
}

export function SessionEndedTablePanel({
  gameId,
  sessionName,
  currentUserId,
  onBackToLobby,
}: SessionEndedTablePanelProps) {
  const [rows, setRows] = useState<SessionEndedRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    const { data, error } = await supabase
      .from('session_player_snapshots')
      .select('player_id, user_id, username, chips, is_bot, created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false });
    if (signal.cancelled) return;
    if (error) {
      setFailed(true);
      return;
    }
    const latest = new Map<string, SessionEndedRow>();
    for (const snap of (data ?? []) as any[]) {
      const isBot = !!snap.is_bot;
      const key = isBot ? `bot:${snap.player_id}` : `user:${snap.user_id}`;
      if (latest.has(key)) continue;
      latest.set(key, {
        key,
        username: snap.username ?? 'Player',
        net: Number(snap.chips ?? 0),
        isBot,
        isSelf: !isBot && !!currentUserId && snap.user_id === currentUserId,
      });
    }
    const sorted = Array.from(latest.values()).sort(
      (a, b) => b.net - a.net || a.username.localeCompare(b.username),
    );
    setRows(sorted);
  }, [gameId, currentUserId]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    // Authoritative snapshot rows may land a beat after `session_ended`.
    // One bounded re-read, no polling loop.
    const t = setTimeout(() => { void load(signal); }, 2500);
    return () => { signal.cancelled = true; clearTimeout(t); };
  }, [load]);

  return (
    <div
      data-session-ended-table=""
      className="absolute inset-0 z-[95] flex items-center justify-center bg-background/70 backdrop-blur-[2px] px-4"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card/95 shadow-2xl flex flex-col max-h-[80%]">
        <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Session Ended</h2>
          {sessionName ? (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{sessionName}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-5 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border shrink-0">
          <span>Player</span>
          <span>Result</span>
        </div>

        <div className="overflow-y-auto overscroll-contain min-h-0 flex-1 px-5 py-2">
          {rows === null && !failed ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading results…</p>
          ) : failed || (rows && rows.length === 0) ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Final results are unavailable.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows!.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 py-2">
                  <span
                    title={r.username}
                    className={`truncate text-sm ${r.isSelf ? 'font-semibold text-foreground' : 'text-foreground/90'}`}
                  >
                    {r.username}
                  </span>
                  <span
                    className={`text-sm font-mono tabular-nums shrink-0 ${
                      r.net > 0 ? 'text-emerald-500' : r.net < 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {formatNet(r.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <Button className="w-full" onClick={onBackToLobby}>
            Back to Lobby
          </Button>
        </div>
      </div>
    </div>
  );
}
