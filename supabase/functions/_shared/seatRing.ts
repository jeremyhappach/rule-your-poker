/**
 * Canonical Seat Ring — Deno mirror (Holm timeout enforcement only).
 *
 * MUST stay byte-equivalent in semantics to the client
 * `src/lib/canonicalShell/seatRing.ts`. "Clockwise" here means poker
 * action-passing order = nearest LOWER occupied position, wrapping to the
 * highest. The legacy enforce-deadlines code used ascending position order
 * and skipped eligible seats; this module is the single corrective resolver.
 *
 * Only the helpers actually needed by timeout enforcement are exported.
 * Do NOT expand this file with rendering / slot-projection logic — that
 * belongs in the client where seatAnchors lives.
 */

export function getOccupiedSeatRing(occupied: readonly number[]): number[] {
  return [...occupied].sort((a, b) => a - b);
}

export function nextClockwise(
  position: number,
  occupied: readonly number[],
): number {
  const ring = getOccupiedSeatRing(occupied);
  if (ring.length === 0) {
    throw new Error("[seatRing] nextClockwise: empty occupied ring");
  }
  if (ring.length === 1) return ring[0];
  const idx = ring.indexOf(position);
  if (idx === -1) {
    // Position not currently in the ring (e.g. just removed). Synthesize
    // its slot using the same descending-clockwise rule: pick the nearest
    // LOWER occupied (wrap to highest if none lower exists).
    let candidate: number | null = null;
    for (const p of ring) if (p < position && (candidate === null || p > candidate)) candidate = p;
    if (candidate !== null) return candidate;
    return ring[ring.length - 1];
  }
  const nextIdx = (idx - 1 + ring.length) % ring.length;
  return ring[nextIdx];
}

/**
 * Walks clockwise from `currentPos` and returns the next position that is
 * present in `undecided`. Returns null when no undecided seat remains.
 *
 * Unified resolver for both Holm timeout branches:
 *   - "current actor already locked, pick next undecided"
 *   - "current actor just timed out, pick next undecided"
 *
 * `occupied` is the active+!sitting_out seat ring; `undecided` is the
 * subset whose decision is not yet locked.
 */
export function nextEligibleUndecided(
  currentPos: number,
  undecided: readonly number[],
  occupied: readonly number[],
): number | null {
  const undecidedSet = new Set(undecided);
  if (undecidedSet.size === 0) return null;
  const ring = getOccupiedSeatRing(occupied);
  if (ring.length === 0) return null;

  let pos = currentPos;
  for (let i = 0; i < ring.length; i++) {
    pos = nextClockwise(pos, ring);
    if (undecidedSet.has(pos)) return pos;
  }
  return null;
}
