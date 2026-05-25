/**
 * participantStatus — canonical shell shared participant presence
 * status language.
 *
 * One vocabulary, one palette, consumed by every surface that paints a
 * participant chip/seat anywhere in the app (legacy MobileGameTable,
 * canonical CanonicalSeatCluster, the waiting surface, hand-history
 * mini-renders, debug panels, etc.).
 *
 * The four canonical states are intentionally narrow:
 *
 *   active      → white   — seated, in an active hand, no decision yet
 *   waiting     → yellow  — seated and ready, but the hand/game hasn't
 *                            committed them yet (waiting-room rosters,
 *                            mid-game "joining next hand", etc.)
 *   sitting_out → red     — seated but inactive (auto-folded, sat out,
 *                            forced inactive by enforcement)
 *   stayed      → green   — committed "stay" decision in Holm / 3-5-7
 *                            style games (replaces the legacy stay glow
 *                            ring with a chip fill so the state reads
 *                            from a single source).
 *
 * Anything outside these four states is a smell — extend this module
 * (not the consuming components) so the palette stays single-sourced.
 */

export type ParticipantStatus =
  | 'active'
  | 'waiting'
  | 'sitting_out'
  | 'stayed';

/**
 * Minimal player shape consumed by `derivePlayerStatus`. Intentionally
 * narrow so the helper can be called from both the legacy
 * `MobileGameTable` Player type and the canonical waiting-surface
 * Player type without forcing a shared type import.
 */
export interface ParticipantStatusInput {
  waiting?: boolean | null;
  sitting_out?: boolean | null;
  auto_fold?: boolean | null;
}

/**
 * Derive the canonical participant status from authoritative player
 * fields + the current decision. Decision precedence:
 *
 *   waiting takes precedence over sitting_out, because a player marked
 *   `waiting=true` is explicitly "ready next hand" even if they are
 *   transiently `sitting_out` between hands. This matches the existing
 *   legacy precedence in MobileGameTable.getPlayerChipBgColor.
 *
 *   `stayed` is only ever surfaced for games that have stay/fold
 *   decisions (`hasStayDecision=true`); dice games (Horses / SCC) have
 *   no stay/fold semantics and must never resolve to 'stayed'.
 */
export function derivePlayerStatus(
  player: ParticipantStatusInput,
  decision: string | null | undefined,
  options?: { hasStayDecision?: boolean },
): ParticipantStatus {
  if (player.waiting) return 'waiting';
  if (player.sitting_out || player.auto_fold) return 'sitting_out';
  if (decision === 'stay' && options?.hasStayDecision !== false) return 'stayed';
  return 'active';
}

/**
 * Canonical Tailwind background class for the chip bubble. Pale-enough
 * fills so negative chip values stay readable on top of every state
 * (the legacy poker surface relied on this for sitting-out negatives).
 */
export function getParticipantChipBgClass(
  status: ParticipantStatus,
): string {
  switch (status) {
    case 'waiting':
      return 'bg-yellow-300';
    case 'sitting_out':
      return 'bg-red-400';
    case 'stayed':
      return 'bg-green-400';
    case 'active':
    default:
      return 'bg-white';
  }
}

/**
 * Canonical Tailwind foreground class for label text rendered on top
 * of the chip bubble. All four states render dark text — the palette
 * is intentionally light so chip values + names stay legible without
 * per-state foreground overrides.
 */
export function getParticipantChipFgClass(
  _status: ParticipantStatus,
): string {
  return 'text-slate-900';
}
