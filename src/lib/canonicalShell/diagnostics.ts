/**
 * Canonical Table Shell — diagnostics & invariants (Phase 0).
 *
 * Establishes the telemetry surface for the upcoming persistent-shell
 * architecture so structural regressions are observable from the first
 * extraction onward.
 *
 * Event prefix: [canonical-shell]
 *
 * Invariants tracked:
 *  - INV-shell-1: shell never unmounts within a session
 *  - INV-shell-2: PlayfieldSlot identity is monotonic per (sessionId, gameType)
 *                 within a single dealerGameId — no in-place identity swap
 *  - INV-shell-3: no slot identity change without passing through
 *                 NeutralInterstitial (slot === null) between two non-null
 *                 identities
 *  - INV-shell-4: overlays follow lifecycle ordering
 *                 (Waiting < Config < Ante < DS < Celebration < Settlement < Neutral)
 *  - INV-shell-5: SeatAnchorLayer projection mode is stable per render frame
 */

import { checkInvariant } from '@/lib/debugSyncInvariants';

const PREFIX = '[canonical-shell]';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export type ShellLifecycleEvent =
  | 'shell-mounted'
  | 'shell-unmounted'
  | 'slot-identity-changed'
  | 'slot-entered-neutral'
  | 'slot-left-neutral'
  | 'overlay-enter'
  | 'overlay-exit'
  | 'transfer-intent-received'
  | 'chip-transport-dispatched'
  | 'chip-transport-settled'
  | 'chip-transport-dropped'
  | 'announcement-lifecycle'
  | 'seat-anchor-projection-changed'
  | 'seat-anchor-canonicalized-2p';

export interface ShellEventPayload {
  sessionId?: string;
  gameId?: string | null;
  gameType?: string | null;
  dealerGameId?: string | null;
  handNumber?: number | null;
  detail?: Record<string, unknown>;
  /** Optional exact lifecycle identity for debug persistence dedupe. */
  dedupKey?: string;
}

/**
 * Single funnel for shell lifecycle / structural events.
 * Persists to debug_sync_events and console-logs in dev.
 */
export function recordShellEvent(
  eventName: ShellLifecycleEvent,
  payload: ShellEventPayload = {},
): void {
  const {
    sessionId,
    gameId,
    gameType,
    dealerGameId,
    handNumber,
    detail,
    dedupKey,
  } = payload;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`${PREFIX} ${eventName}`, {
      sessionId,
      gameId,
      gameType,
      dealerGameId,
      handNumber,
      ...detail,
    });
  }

  // Lazy-load persistence to keep this module importable from pure
  // Node test environments (persistSyncDebugEvent pulls in the
  // supabase client which touches localStorage at module init).
  if (typeof window !== 'undefined') {
    void import('@/lib/persistSyncDebugEvent').then(({ persistSyncDebugEvent }) => {
      void persistSyncDebugEvent({
        gameId: gameId || NIL_UUID,
        gameType: gameType || 'canonical-shell',
        handNumber: typeof handNumber === 'number' ? handNumber : 0,
        eventType: 'transition',
        severity: 'info',
        eventName: `canonical-shell-${eventName}`,
        dedupKey,
        payload: {
          sessionId: sessionId ?? null,
          dealerGameId: dealerGameId ?? null,
          ts: Date.now(),
          ...detail,
        },
      });
    });
  }
}

// ── Invariant checks ──────────────────────────────────────────

/**
 * INV-shell-2 / INV-shell-3: validate a proposed slot identity transition.
 *
 * Allowed transitions:
 *   null → identity        (entering a game)
 *   identity → null        (entering NeutralInterstitial)
 *   identity → identity    only when the new dealerGameId is strictly newer
 *
 * Disallowed:
 *   identity → identity    without passing through null
 *   in-place gameType swap with same dealerGameId
 */
export function checkSlotTransition(
  prev: { gameType: string; dealerGameId: string } | null,
  next: { gameType: string; dealerGameId: string } | null,
  gameId?: string,
): boolean {
  if (!prev || !next) return true; // null on either side is always legal

  const samePair =
    prev.gameType === next.gameType && prev.dealerGameId === next.dealerGameId;
  if (samePair) return true; // identical identity is a no-op, not a transition

  return checkInvariant(
    'canonical-shell',
    'slot-transition-without-neutral',
    false,
    `Direct slot identity swap without NeutralInterstitial: ${prev.gameType}/${prev.dealerGameId} → ${next.gameType}/${next.dealerGameId}`,
    { prev, next, gameId: gameId ?? '' },
  );
}

/**
 * INV-shell-5: projection mode must be one of the two contractual values.
 */
export function checkProjectionMode(mode: string, gameId?: string): boolean {
  const ok = mode === 'observer-absolute' || mode === 'active-canonical';
  return checkInvariant(
    'canonical-shell',
    'invalid-projection-mode',
    ok,
    `Invalid SeatAnchorLayer projection mode: "${mode}"`,
    { mode, gameId: gameId ?? '' },
  );
}
