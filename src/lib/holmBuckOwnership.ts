export interface HolmBuckOwnershipSnapshot {
  buckPosition: number | null | undefined;
  currentTurnPosition: number | null | undefined;
}

/**
 * The physical Holm Buck belongs to the hand, not the action turn. A fold may
 * advance currentTurnPosition inside the same round, but only successor-hand
 * creation may publish a different games.buck_position.
 */
export function getHolmPhysicalBuckPosition({
  buckPosition,
}: HolmBuckOwnershipSnapshot): number | null {
  return buckPosition ?? null;
}
