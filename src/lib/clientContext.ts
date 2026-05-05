/**
 * Client-side correlation context for debug/animation events.
 *
 * - clientId: stable per-tab/session identifier (sessionStorage)
 * - clientTimestamp: ISO string at emit time
 * - shortGameId: human-readable last-8 of a game UUID
 *
 * These fields are required on all visual-contract, dice, and
 * animation-related debug_sync_events for cross-client correlation.
 */

const SESSION_KEY = 'ptp_client_session_id';

let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    if (!cached) cached = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    return cached;
  }
}

export function getClientTimestamp(): string {
  return new Date().toISOString();
}

export function getShortGameId(gameId: string | null | undefined): string | null {
  if (!gameId) return null;
  const s = String(gameId);
  if (s.length <= 8) return s;
  return s.slice(-8);
}

/**
 * Standard correlation envelope for animation/visual-contract/dice events.
 * `animationPath` is REQUIRED — pass an explicit short label like
 * 'cribbage-cut-card', 'yahtzee-dice-roll', 'holm-solo-reveal'.
 */
export interface AnimationEventEnvelope {
  clientId: string;
  clientTimestamp: string;
  shortGameId: string | null;
  animationPath: string;
}

export function buildAnimationEnvelope(
  gameId: string | null | undefined,
  animationPath: string,
): AnimationEventEnvelope {
  return {
    clientId: getClientId(),
    clientTimestamp: getClientTimestamp(),
    shortGameId: getShortGameId(gameId),
    animationPath,
  };
}
