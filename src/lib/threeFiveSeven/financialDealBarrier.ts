import type { ChipPresentationCursorState } from '@/lib/canonicalShell/ChipPresentationLedger';

type Claim = { roundId: string; transferCursor: number | null } | null | undefined;
const complete = (claim: Claim, state: ChipPresentationCursorState) =>
  claim?.transferCursor == null || state === 'settled' || state === 'reconciled';

/** A peer can advance authority before this viewer's retained flight lands. */
export function isThreeFiveSevenFinancialDealReady(
  roundId: string | null | undefined,
  tax: Claim, taxState: ChipPresentationCursorState,
  ante: Claim, anteState: ChipPresentationCursorState,
) {
  return (tax?.roundId === roundId || complete(tax, taxState))
    && complete(ante, anteState);
}
