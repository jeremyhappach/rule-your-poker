import { useCallback, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useChipTransferPresentationAdmission } from '@/lib/canonicalShell/ChipTransportProvider';
import type { ChipPresentationBatch } from '@/lib/canonicalShell/ChipPresentationLedger';
import { useAnnouncements } from '@/lib/canonicalShell/announcements';
import { farkleTerminalToken, isFarkleTerminalPayout } from '@/lib/farkle/terminalPresentation';
import type { FarkleScope, FarkleState } from '@/lib/farkle/types';

/** The canonical ledger owns motion and completion; this adapter owns only Farkle admission. */
export function FarkleTerminalPresentation({ scope, state, live, winnerName, winnerIsSelf, onActive, onComplete }: {
  scope: FarkleScope; state: FarkleState; live: boolean; winnerName: string; winnerIsSelf: boolean;
  onActive?: (active: boolean) => void; onComplete?: (token: string) => void;
}) {
  const { emit } = useAnnouncements();
  const completed = useRef<string | null>(null);
  const presented = useRef<string | null>(null);
  const active = useRef(false);
  const token = state.winnerPlayerId ? farkleTerminalToken(scope, state.winnerPlayerId) : null;
  const admit = useCallback((batch: ChipPresentationBatch) => {
    const playerTransfer = batch.reason === 'transfer' && batch.transfers.some(t => t.from.kind === 'player' && t.to.kind === 'player');
    // Action receipts can reach this child before the route captures its live
    // terminal hold. Keep the batch queued until that ownership is established.
    return !playerTransfer || (live && isFarkleTerminalPayout(batch, scope, state));
  }, [live, scope, state]);
  const started = useCallback((batch: ChipPresentationBatch) => {
    if (!live || !token || presented.current === token || !isFarkleTerminalPayout(batch, scope, state)) return;
    presented.current = token;
    emit({ id: token, type: 'match_win', scope: { dealerGameId: scope.gameId, roundId: scope.roundId },
      payload: { text: `${winnerName} wins!`, winnerId: state.winnerPlayerId }, ttlMs: 10000 });
    if (winnerIsSelf) void confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  }, [live, token, scope, state, emit, winnerName, winnerIsSelf]);
  const settled = useCallback((batch: ChipPresentationBatch) => {
    if (!live || !token || completed.current === token || !isFarkleTerminalPayout(batch, scope, state)) return;
    completed.current = token;
    onComplete?.(token);
    active.current = false;
    onActive?.(false);
  }, [live, token, scope, state, onComplete, onActive]);
  useChipTransferPresentationAdmission(admit, settled, started);
  useEffect(() => {
    if (live && token && !active.current && completed.current !== token) { active.current = true; onActive?.(true); }
  }, [live, token, onActive]);
  useEffect(() => () => { if (active.current) { active.current = false; onActive?.(false); } }, [onActive]);
  return null;
}
