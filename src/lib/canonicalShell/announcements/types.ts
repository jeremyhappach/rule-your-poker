/**
 * Canonical announcement system — type contract.
 *
 * Shell-owned semantic announcement pipeline. Games emit semantic
 * events; the shell owns rendering, placement, dedupe, queueing and
 * teardown. See CanonicalAnnouncementProvider for orchestration.
 */

export type AnnouncementType =
  | 'match_win'
  | 'round_win'
  | 'chip_award'
  | 'dealer_configuring'
  | 'waiting_for_players';

export interface AnnouncementScope {
  /** dealerGameId is the primary lifecycle boundary. */
  dealerGameId?: string | null;
  /** Optional finer scope for round-bound events (round_win, chip_award). */
  roundId?: string | null;
}

export interface AnnouncementEvent {
  /**
   * Semantic stable id. Same id = same event = dedupe.
   * Convention: `${dealerGameId}:${type}` for once-per-dealer-game,
   * `${roundId}:${type}` for once-per-round, etc.
   */
  id: string;
  type: AnnouncementType;
  scope: AnnouncementScope;
  payload?: Record<string, unknown>;
  /** ms before auto-dismiss. Omit for caller-driven dismiss. */
  ttlMs?: number;
  /**
   * Override default type priority (higher wins). Lifecycle events
   * (match_win) preempt informational ones (waiting_for_players).
   */
  priority?: number;
  /**
   * 'replace' = stateful announcement; replaces any other queued event
   *   of the same type instead of stacking. Used for waiting_for_players,
   *   dealer_configuring.
   * 'enqueue' (default) = discrete event; queued and shown once.
   */
  behavior?: 'enqueue' | 'replace';
}

export const DEFAULT_PRIORITY: Record<AnnouncementType, number> = {
  match_win: 100,
  round_win: 80,
  chip_award: 60,
  dealer_configuring: 50,
  waiting_for_players: 40,
};

export const DEFAULT_BEHAVIOR: Record<AnnouncementType, 'enqueue' | 'replace'> = {
  match_win: 'enqueue',
  round_win: 'enqueue',
  chip_award: 'enqueue',
  dealer_configuring: 'replace',
  waiting_for_players: 'replace',
};

export const DEFAULT_TTL_MS: Partial<Record<AnnouncementType, number>> = {
  match_win: 4500,
  round_win: 3000,
  chip_award: 2200,
  // dealer_configuring / waiting_for_players: no TTL — cleared by scope teardown
  // or by the caller emitting a different replace-type event.
};
