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
  | 'peg_notice'
  | 'dealing_next_hand'
  // Ambient
  | 'dealer_configuring'
  | 'waiting_for_players'
  | 'waiting_for_player'
  | 'waiting_for_next_round'
  | 'dealer_selection_in_progress'
  | 'awaiting_ante'
  | 'awaiting_discards'
  | 'cta_prompt';


/**
 * Phase 2 (Transient UX Platform — rail migration) additions:
 *   - `awaiting_ante` (ambient): ante decision lifecycle for every game.
 *   - `cta_prompt` (ambient): actor-only call-to-action plate. Renderer
 *     gates visibility on payload.actorUserId === viewerUserId; observers
 *     see the matching `waiting_for_player` ambient instead.
 *   - `peg_notice` (transient): lightweight non-blocking gameplay notice
 *     (e.g. Cribbage "Go"). MUST NOT carry timing or progression
 *     implications. Anything that gates progression is an overlay
 *     (Phase 3), not a rail event.
 */

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
  /**
   * Optional producer-owned retirement group identity for transient
   * events. When present, the provider's `retireTransientScope(scope)`
   * removes all live and queued transients whose `transientScope`
   * matches — used to synchronously retire a previous ownership
   * group's rail events at a producer-defined boundary (e.g. Cribbage
   * counting scoring-target advance). Producers own the scope format
   * and when to retire; the provider is generic.
   */
  transientScope?: string;
  /**
   * Terminal retirement acknowledgment. When supplied, the provider
   * MUST invoke this callback exactly once for the event, at whichever
   * terminal transition first removes it from the transient track:
   *   'ttl'          — normal TTL expiration
   *   'preempt'      — higher-priority transient displaced it
   *   'dismiss'      — direct dismiss(id) call
   *   'scope-retire' — retireTransientScope() matched it (active OR queued)
   *   'boundary'     — provider scope teardown, clearScope, or a queued
   *                    event dropped by promoteNextTransient's scope
   *                    filter
   * Queued events removed before ever becoming visible also receive
   * exactly one callback. Never invoked for ordinary queue promotion
   * or visibility changes.
   */
  onRetired?: (id: string, reason: AnnouncementRetireReason) => void;
}

export type AnnouncementRetireReason =
  | 'ttl'
  | 'preempt'
  | 'dismiss'
  | 'scope-retire'
  | 'boundary';

export const DEFAULT_PRIORITY: Record<AnnouncementType, number> = {
  match_win: 100,
  dealer_selected: 90,
  round_win: 80,
  chip_award: 60,
  peg_notice: 55,
  dealer_configuring: 50,
  dealer_selection_in_progress: 50,
  awaiting_ante: 45,
  dealing_next_hand: 44,
  awaiting_discards: 42,
  waiting_for_players: 40,
  waiting_for_next_round: 40,
  cta_prompt: 35,
  waiting_for_player: 30,
};

export const DEFAULT_BEHAVIOR: Record<AnnouncementType, AnnouncementBehavior> = {
  match_win: 'enqueue',
  round_win: 'enqueue',
  chip_award: 'enqueue',
  dealer_selected: 'enqueue',
  peg_notice: 'enqueue',
  dealing_next_hand: 'enqueue',
  dealer_configuring: 'ambient',
  dealer_selection_in_progress: 'ambient',
  awaiting_ante: 'ambient',
  awaiting_discards: 'ambient',
  cta_prompt: 'ambient',
  waiting_for_players: 'ambient',
  waiting_for_next_round: 'ambient',
  waiting_for_player: 'ambient',
};

export const DEFAULT_TTL_MS: Partial<Record<AnnouncementType, number>> = {
  match_win: 4500,
  round_win: 3000,
  chip_award: 2200,
  dealer_selected: 2500,
  peg_notice: 1500,
  dealing_next_hand: 1500,
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

/**
 * Actor-directed CTA / ambient helper types.
 *
 * These are PLAYER-DIRECTED prompts ("Your turn", "Discard to crib",
 * "Waiting on Player 1") and belong in the ambient helper text area
 * inside the active content pane — NOT in the shell announcement rail.
 * Keeping them out of the rail prevents UX churn between gameplay
 * announcements and CTA prompts that flip every action.
 */
export const CTA_AMBIENT_TYPES: ReadonlySet<AnnouncementType> = new Set<AnnouncementType>([
  'cta_prompt',
  'waiting_for_player',
]);

export function isCtaAmbientType(t: AnnouncementType | undefined | null): boolean {
  return !!t && CTA_AMBIENT_TYPES.has(t);
}

