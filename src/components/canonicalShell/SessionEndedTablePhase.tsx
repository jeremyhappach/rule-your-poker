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
import { getBotAlias } from '@/lib/botAlias';
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
    // Participant union — snapshots alone are NOT a complete participant set.
    // `holm_settle_hand` (and the client snapshot owners) guard snapshot writes
    // on (game_id, hand_number) only, and hand_number restarts at 1 for every
    // dealer game, so after the first dealer game no further snapshot batch is
    // written. Any participant seated after that batch (e.g. bots added later)
    // has zero snapshot rows and silently disappeared from Results.
    //
    // Source of truth per participant:
    //   - currently-rostered rows -> `players.chips` (the SAME value the seat
    //     clusters render as the final balance)
    //   - departed/removed/replaced participants -> latest snapshot row
    const [snapRes, playerRes] = await Promise.all([
      supabase
        .from('session_player_snapshots')
        .select('player_id, user_id, username, chips, is_bot, created_at')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false }),
      supabase
        .from('players')
        .select('id, user_id, chips, is_bot, created_at, status, profiles(username)')
        .eq('game_id', gameId),
    ]);
    if (signal.cancelled) return;
    if (snapRes.error && playerRes.error) {
      setFailed(true);
      return;
    }
    const identityKey = (
      isBot: boolean,
      playerId: string,
      userId?: string | null,
    ) =>
      isBot
        ? `bot:${playerId}`
        : userId
          ? `user:${userId}`
          : `player:${playerId}`;

    const latest = new Map<string, SessionEndedRow>();
    for (const snap of (snapRes.data ?? []) as any[]) {
      const isBot = !!snap.is_bot;
      // Identity: user for humans (survives re-seating with a new player row),
      // player row for bots (bots have no stable user identity).
      const key = identityKey(isBot, snap.player_id, snap.user_id);
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

    const roster = (playerRes.data ?? []) as any[];
    for (const p of roster) {
      // Observers never had accounting activity; everything else (active,
      // sitting out, left, waiting) did and must appear exactly once.
      if (p.status === 'observer') continue;
      const isBot = !!p.is_bot;
      const key = identityKey(isBot, p.id, p.user_id);
      const username = isBot
        ? getBotAlias(roster, p.user_id)
        : p.profiles?.username ?? latest.get(key)?.username ?? 'Player';
      latest.set(key, {
        key,
        username,
        net: Number(p.chips ?? 0),
        isBot,
        isSelf: !isBot && !!currentUserId && p.user_id === currentUserId,
        latestAt: Number.MAX_SAFE_INTEGER,
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
    // CANONICAL FELT-SAFE CONTENT REGION (inscribed rectangle).
    //
    // [data-canonical-felt-surface] is an ELLIPSE (`rounded-[50%]` +
    // `overflow:hidden`) whose bounding box is the full play rect. A
    // rectangular panel sized against `inset-0` therefore extends into
    // the four clipped corners: the lower rows were painted outside the
    // ellipse and silently cut off before the body ever became
    // scrollable. THAT was the defect — not a missing max-height.
    //
    // Geometry: for an ellipse with semi-axes (a, b), a centered
    // rectangle of half-width `k·a` is fully inscribed iff its
    // half-height ≤ `b·√(1 − k²)`. We take k = 0.80 →
    // √(1 − 0.64) = 0.60, and use 58% height for visible clearance.
    // Both numbers are PERCENTAGES OF THE FELT — no vh/dvh, no window
    // or screen reads, no device constants, no fixed pixel heights.
    // This wrapper is a definite-size block, so the panel's `max-h-full`
    // and the body's `min-h-0` shrink resolve against a real constraint.
    <div
      data-session-ended-felt-panel=""
      data-session-ended-felt-safe-region=""
      className="absolute z-[30] flex items-center justify-center min-h-0 overflow-hidden"
      style={{
        left: '50%',
        top: '50%',
        width: '80%',
        height: '58%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <div
        className="w-full max-w-[320px] flex flex-col rounded-lg border border-border bg-card/95 shadow-xl overflow-hidden max-h-full min-h-0"
        style={{ pointerEvents: 'auto' }}
      >

        {/* Title: never scrolls, never shrinks. */}
        <div className="px-2.5 pt-1 pb-0.5 shrink-0">
          <h2 className="text-sm font-semibold text-foreground tracking-tight leading-tight">
            Results
          </h2>
        </div>

        {/* Results body: `flex: 0 1 auto` — intrinsic height for short lists
            (no stretching), but permitted to shrink inside the felt maximum
            for long lists so rows scroll internally while the title stays
            fixed. Rows are content-driven (min-height + padding), never a
            forced fixed height, so text inflation / accessibility sizing /
            bold names can never clip. */}
        <div className="flex-[0_1_auto] min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-2.5 pb-1 [-webkit-overflow-scrolling:touch]">
          {rows === null && !failed ? (
            <p className="text-xs text-muted-foreground py-1 text-center">Loading results…</p>
          ) : failed || (rows && rows.length === 0) ? (
            <p className="text-xs text-muted-foreground py-1 text-center">
              Final results are unavailable.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows!.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between gap-2.5 h-auto min-h-[21px] py-[1px] shrink-0 grow-0"
                >
                  <span
                    title={r.username}
                    aria-label={r.username}
                    className={`truncate text-xs leading-tight ${r.isSelf ? 'font-semibold text-foreground' : 'text-foreground/90'}`}
                  >
                    {r.username}
                  </span>
                  <span
                    className={`text-xs font-semibold font-mono tabular-nums leading-tight shrink-0 text-right ${
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
