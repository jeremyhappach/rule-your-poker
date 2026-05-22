/**
 * Canonical announcement system — type contract.
 *
 * Two announcement classes:
 *
 *  TRANSIENT (behavior: 'enqueue')
 *    Discrete event bursts — match_win, round_win, chip_award.
 *    Queued, priority-preemptive, auto-dismissed by TTL.
 *
 *  AMBIENT (behavior: 'ambient')
 *    Persistent contextual state — dealer_configuring, waiting_for_*,
 *    dealer_selection_in_progress. Lives in a single dedicated slot
 *    (NOT the transient queue). Latest ambient replaces prior ambient.
 *    No TTL: persists until superseded or scope boundary teardown.
 *    Transient events render OVER ambient; when transient ends,
 *    ambient resumes if still relevant.
 *
 * The legacy 'replace' behavior is preserved as an alias of 'ambient'.
 */

export type AnnouncementType =
  // Transient
  | 'match_win'
  | 'round_win'
  | 'chip_award'
  | 'dealer_selected'
  // Ambient
  | 'dealer_configuring'
  | 'waiting_for_players'
  | 'waiting_for_player'
  | 'waiting_for_next_round'
  | 'dealer_selection_in_progress';

export interface AnnouncementScope {
  /** dealerGameId is the primary lifecycle boundary. */
  dealerGameId?: string | null;
  /** Optional finer scope for round-bound events. */
  roundId?: string | null;
}

export type AnnouncementBehavior = 'enqueue' | 'ambient' | 'replace';

export interface AnnouncementEvent {
  /**
   * Semantic stable id. For transient events: dedupe key.
   * For ambient events: identity for "is this the same ambient state
   * already showing?" — re-emitting the same id is a no-op refresh.
   */
  id: string;
  type: AnnouncementType;
  scope: AnnouncementScope;
  payload?: Record<string, unknown>;
  /** ms before auto-dismiss. Ignored for ambient events. */
  ttlMs?: number;
  /** Override default type priority (transient-vs-transient ordering). */
  priority?: number;
  /**
   * 'enqueue' = transient burst.
   * 'ambient' = persistent contextual state (replaces prior ambient).
   * 'replace' = legacy alias for 'ambient'.
   */
  behavior?: AnnouncementBehavior;
}

export const DEFAULT_PRIORITY: Record<AnnouncementType, number> = {
  match_win: 100,
  dealer_selected: 90,
  round_win: 80,
  chip_award: 60,
  dealer_configuring: 50,
  dealer_selection_in_progress: 50,
  waiting_for_players: 40,
  waiting_for_next_round: 40,
  waiting_for_player: 30,
};

export const DEFAULT_BEHAVIOR: Record<AnnouncementType, AnnouncementBehavior> = {
  match_win: 'enqueue',
  round_win: 'enqueue',
  chip_award: 'enqueue',
  dealer_selected: 'enqueue',
  dealer_configuring: 'ambient',
  dealer_selection_in_progress: 'ambient',
  waiting_for_players: 'ambient',
  waiting_for_next_round: 'ambient',
  waiting_for_player: 'ambient',
};

export const DEFAULT_TTL_MS: Partial<Record<AnnouncementType, number>> = {
  match_win: 4500,
  round_win: 3000,
  chip_award: 2200,
  dealer_selected: 2500,
  // Ambient types: no TTL — cleared by supersession or boundary teardown.
};

export function isAmbientBehavior(b: AnnouncementBehavior | undefined): boolean {
  return b === 'ambient' || b === 'replace';
}

/**
 * Celebration-tier announcement types.
 *
 * Rendered by the shell-owned CanonicalCelebrationLayer as a centered
 * overlay surface (not the 36px lifecycle rail). The rail-mounted
 * CanonicalAnnouncementLayer skips these types so a celebration event
 * never occupies the lifecycle messaging slot.
 *
 * Currently: match_win only. Add round-tier celebrations here when
 * their visual class is promoted out of lifecycle messaging.
 */
export const CELEBRATION_TYPES: ReadonlySet<AnnouncementType> = new Set<AnnouncementType>([
  'match_win',
]);

export function isCelebrationType(t: AnnouncementType | undefined | null): boolean {
  return !!t && CELEBRATION_TYPES.has(t);
}

