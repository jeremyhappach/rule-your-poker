import { formatChipValue } from '@/lib/utils';
import { usePresentationPlayerChipBalance } from './ChipTransportProvider';

interface PresentationChipBalanceProps {
  playerId: string | null | undefined;
  rawBalance: number | null | undefined;
  prefix?: string;
  round?: boolean;
}

/**
 * Use for every in-table text representation of a player stack.  The seat
 * disc and supporting HUD/lobby rows must agree while an immutable transfer
 * batch owns the endpoint; this small primitive prevents a raw row from
 * leaking through one of those secondary surfaces.
 */
export function PresentationChipBalance({
  playerId,
  rawBalance,
  prefix = '$',
  round = false,
}: PresentationChipBalanceProps) {
  const balance = usePresentationPlayerChipBalance(playerId, rawBalance ?? 0);
  return <>{prefix}{formatChipValue(round ? Math.round(balance) : balance)}</>;
}
