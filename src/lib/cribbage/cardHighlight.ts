/**
 * Canonical Cribbage card-highlight geometry.
 *
 * Every Cribbage card highlight (discard selection, scoring emphasis,
 * winning-card outline, hover affordance) MUST use these class strings
 * so the ring/shadow hugs the exact card silhouette.
 *
 * Geometry rules — the highlight wrapper MUST:
 *   - be sized exactly to the card it wraps
 *   - live inside the same transformed/rotated container as the card
 *   - use `rounded-[10%]` (matches PlayingCard's face radius)
 *   - never re-declare width/height/rotation independently
 *
 * Semantic color may vary; the shape contract does not.
 */
export const CRIBBAGE_CARD_HIGHLIGHT_RADIUS = 'rounded-[10%]';

/** Full selected/scored treatment: gold ring + soft glow, canonical radius. */
export const CRIBBAGE_CARD_HIGHLIGHT_GOLD =
  'ring-2 ring-poker-gold rounded-[10%] shadow-lg shadow-poker-gold/50';

/** Hover affordance (playable card) — same radius, lighter ring. */
export const CRIBBAGE_CARD_HIGHLIGHT_HOVER_GOLD =
  'ring-1 ring-poker-gold/50 rounded-[10%]';
