/**
 * Yahtzee held-row committed order resolver.
 *
 * Single source of truth for the visual ordering of the held-dice row.
 * All render paths (normal held row, freeze/frozen path, fly-in landing,
 * category preview/selection, result/announcement) must consume the
 * output of this function — never `.filter(d => d.isHeld)` in physical /
 * insertion / registry order directly.
 *
 * Sort policy (intentional, observer-legible):
 *   1. die value ASC
 *   2. stable physical dieId ASC as tie-breaker
 *
 * The caller controls when to recompute (typically on held-set signature
 * change or held-die value change). This function is pure — given the
 * same input it always returns the same output.
 */

export interface HeldOrderInputDie {
  originalIndex: number;
  value: number;
}

export interface HeldOrderInputItem<T> {
  item: T;
  originalIndex: number;
  value: number;
}

/** Compute the deterministic committed held-row order for a set of held dice. */
export function resolveCommittedHeldOrder<T>(
  heldItems: readonly HeldOrderInputItem<T>[],
): T[] {
  return heldItems
    .slice()
    .sort((a, b) =>
      a.value !== b.value ? a.value - b.value : a.originalIndex - b.originalIndex,
    )
    .map((entry) => entry.item);
}

/** Held-set signature: sorted physical dieIds joined. Used to gate recompute. */
export function heldSetSignature(originalIndices: readonly number[]): string {
  return originalIndices.slice().sort((a, b) => a - b).join(',');
}
