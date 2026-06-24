/**
 * Holm actionability contract — canonical deal-presentation duration.
 *
 * Single source of truth shared by:
 *
 *   - client presentation code (HolmDealOrchestrator / HolmDealPhaseHost)
 *     that performs the local deal animation,
 *
 *   - server initial-deal writer (startHolmRound at H4) that stamps the
 *     `presentation_fallback_at` column on the new round so the
 *     deadline-enforcement / recovery edge function can safely
 *     auto-promote a stranded dealing round if the elected
 *     presentation host disconnects before acknowledgement,
 *
 *   - the deadline-enforcement edge function fallback sweep.
 *
 * Units are milliseconds. Numbers are intentionally generous: this is a
 * safety net, not a normal-flow timing target. The normal flow is the
 * host calling `activate_holm_round_after_deal_presentation` the moment
 * the host-visible settle predicate is true.
 */

/**
 * Canonical wall-clock duration of one Holm initial deal presentation
 * from the moment the round row is committed at H4 to the moment the
 * host-visible settle predicate becomes true on the slowest reasonable
 * client (hands wave + community wave + worst-case chucky wave for
 * solo). This bounds the normal-flow presentation window.
 */
export const HOLM_DEAL_PRESENTATION_DURATION_MS = 12_000;

/**
 * Explicit safety margin added on top of the canonical presentation
 * duration before the server-side fallback may promote a still-dealing
 * round. This absorbs realtime / network / clock jitter so the fallback
 * never races a host that is about to acknowledge.
 */
export const HOLM_DEAL_PRESENTATION_FALLBACK_SAFETY_MS = 8_000;

/**
 * Total wall-clock budget after H4 before the fallback path is allowed
 * to auto-promote a stranded dealing round. Server stamps this onto
 * `rounds.presentation_fallback_at` at H4:
 *
 *   presentation_fallback_at = serverNow + HOLM_DEAL_PRESENTATION_FALLBACK_TOTAL_MS
 */
export const HOLM_DEAL_PRESENTATION_FALLBACK_TOTAL_MS =
  HOLM_DEAL_PRESENTATION_DURATION_MS + HOLM_DEAL_PRESENTATION_FALLBACK_SAFETY_MS;
