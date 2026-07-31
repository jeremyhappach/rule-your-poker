/**
 * SessionEndedTablePhase — shared read-only *table phase* (not a modal).
 *
 * Entered only when a connected client observed the canonical terminal
 * presentation for a session-ending result through to its true completion
 * boundary (see Game.tsx `markTerminalPresentationComplete`). It is
 * client-local and purely presentational:
 *   - no database writes on open or close
 *   - no status semantics, no settlement, no payout
 *   - never reconstructed on a fresh mount / reconnect
 *
 * Structure:
 *   <SessionEndedFeltPanel/>   → portaled INTO [data-canonical-felt-surface],
 *                                so it is positioned relative to the felt, not
 *                                the viewport. No scrim, no backdrop blur, no
 *                                global pointer blocker, no viewport z-layer.
 *   <SessionEndedPaneAction/>  → the sole primary action in the local player's
 *                                content pane (Back to Lobby).
 *
 * Authoritative results source: `session_player_snapshots` — the same rows the
 * `record_session_results` trigger reads to mint SessionResult transactions.
 * `chips` on the latest snapshot per participant IS the net session result, so
 * it is rendered directly. Every participant with session activity is included
 * (all snapshot rows for the session, not just the final seated roster).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { formatChipValue } from '@/lib/utils';
import { useAnnouncements } from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';

interface SessionEndedRow {
  key: string;
  username: string;
  net: number;
  isBot: boolean;
  isSelf: boolean;
  latestAt: number;
}

function formatNet(net: number): string {
  if (net === 0) return '0';
  const sign = net > 0 ? '+' : '-';
  return `${sign}${formatChipValue(Math.abs(net))}`;
}

export interface SessionEndedTablePhaseProps {
  gameId: string;
  sessionName?: string | null;
  currentUserId?: string | null;
}

/**
 * Felt-relative results panel. Rendered through a portal into the canonical
 * felt surface so all sizing/positioning is felt-relative and the HUD/tab rail
 * (outside the felt) stay unobstructed and interactive.
 */
export function SessionEndedFeltPanel({
  gameId,
  sessionName,
  currentUserId,
}: SessionEndedTablePhaseProps) {
  const [rows, setRows] = useState<SessionEndedRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [feltEl, setFeltEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const find = () =>
      document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
    const found = find();
    if (found) {
      setFeltEl(found);
      return;
    }
    // The felt host may commit a frame later than this phase.
    let raf = 0;
    const tick = () => {
      const el = find();
      if (el) {
        setFeltEl(el);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    // ALL participants with session activity: every snapshot row for this
    // session, reduced to the latest row per participant identity. Not
    // filtered by seat occupancy, connection, dealer game, or final hand.
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
      // Identity: user for humans (survives re-seating with a new player row),
      // player row for bots (bots have no stable user identity).
      const key = isBot
        ? `bot:${snap.player_id}`
        : snap.user_id
          ? `user:${snap.user_id}`
          : `player:${snap.player_id}`;
      const at = new Date(snap.created_at ?? 0).getTime();
      const existing = latest.get(key);
      if (existing && existing.latestAt >= at) continue;
      latest.set(key, {
        key,
        username: snap.username ?? 'Player',
        net: Number(snap.chips ?? 0),
        isBot,
        isSelf: !isBot && !!currentUserId && snap.user_id === currentUserId,
        latestAt: at,
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
    const channel = supabase
      .channel(`session-ended-results-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_player_snapshots',
          filter: `game_id=eq.${gameId}`,
        },
        () => { void load(signal); },
      )
      .subscribe();
    return () => {
      signal.cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [load, gameId]);

  if (!feltEl) return null;

  return createPortal(
    <div
      data-session-ended-felt-panel=""
      className="absolute inset-0 z-[30] flex items-center justify-center p-[6%]"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="w-[min(320px,86%)] max-h-full min-h-0 flex flex-col rounded-lg border border-border bg-card/95 shadow-xl"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="px-3 pt-1.5 pb-1 shrink-0">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Results</h2>
        </div>

        <div className="overflow-y-auto overscroll-contain min-h-0 flex-1 px-3 pb-1.5">
          {rows === null && !failed ? (
            <p className="text-xs text-muted-foreground py-1.5 text-center">Loading results…</p>
          ) : failed || (rows && rows.length === 0) ? (
            <p className="text-xs text-muted-foreground py-1.5 text-center">
              Final results are unavailable.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows!.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 py-1 min-h-[26px]">
                  <span
                    title={r.username}
                    aria-label={r.username}
                    className={`truncate text-xs leading-tight ${r.isSelf ? 'font-semibold text-foreground' : 'text-foreground/90'}`}
                  >
                    {r.username}
                  </span>
                  <span
                    className={`text-xs font-semibold font-mono tabular-nums shrink-0 text-right ${
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
      </div>
    </div>,
    feltEl,
  );
}

/**
 * Persistent HUD row-1 announcement for the Session Ended phase.
 *
 * Uses the canonical ambient announcement track — no TTL, no animate-in
 * and retire, no bespoke banner. Cleared on unmount (Back to Lobby, or
 * leaving the phase for any reason).
 */
export function SessionEndedAnnouncementMount({ gameId }: { gameId: string }) {
  const announcements = useAnnouncements();
  const announcementsRef = useRef(announcements);
  useEffect(() => {
    announcementsRef.current = announcements;
  }, [announcements]);
  useEffect(() => {
    if (!gameId) return;
    // Full phase reset of the rail: retire every leftover ambient plate
    // (win/lifecycle notices from the hand that just ended) and dismiss
    // any transient still occupying the active slot, then publish the
    // persistent Session Ended plate.
    announcementsRef.current.clearAmbient();
    announcementsRef.current.emit({
      id: `${gameId}:session-ended`,
      type: 'session_ended',
      scope: { dealerGameId: gameId },
    });
    return () => {
      announcementsRef.current.clearAmbient('session_ended');
    };
  }, [gameId]);
  return null;
}

/**
 * The sole primary action for this phase, portaled into the canonical
 * active-pane row (HUD row 4) of the normal mounted HUD grid. Local
 * navigation only — no database write, no status change, no effect on any
 * other connected client. Rendered only while the local viewer is on the
 * active game-content tab.
 */
export function SessionEndedPaneAction({
  onBackToLobby,
  active = true,
}: {
  onBackToLobby: () => void;
  active?: boolean;
}) {
  const [paneEl, setPaneEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      setPaneEl(null);
      return;
    }
    const find = () => document.querySelector<HTMLElement>('[data-hud-row="pane"]');
    const found = find();
    if (found) {
      setPaneEl(found);
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = find();
      if (el) {
        setPaneEl(el);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);

  if (!active || !paneEl) return null;

  return createPortal(
    <div
      data-session-ended-pane-action=""
      className="absolute inset-0 z-[5] flex items-center justify-center px-6"
      style={{ pointerEvents: 'none' }}
    >
      <Button
        className="min-w-[10rem]"
        style={{ pointerEvents: 'auto' }}
        onClick={onBackToLobby}
      >
        Back to Lobby
      </Button>
    </div>,
    paneEl,
  );
}
