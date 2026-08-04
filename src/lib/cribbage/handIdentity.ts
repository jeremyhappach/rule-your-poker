/**
 * Stable identity for one authoritative Cribbage hand.
 *
 * Presentation artifacts such as cards, discards, and pegged cards must never
 * participate in this key: they change within a hand, while DealRuntime and
 * CardTransport require one immutable identity for the whole hand.
 */
export function getCribbageHandIdentity(
  roundId: string | null | undefined,
  handNumber: number | null | undefined,
): string {
  if (!roundId) return '';
  if (
    typeof handNumber !== 'number' ||
    !Number.isFinite(handNumber) ||
    handNumber < 0
  ) {
    return '';
  }

  return `r:${roundId}|h:${handNumber}`;
}
