/**
 * useSlotIdentityTracker — passive Phase 6 hook.
 *
 * Observes the current PlayfieldSlot identity and fires
 * `slot-identity-changed` telemetry on real transitions. Runs
 * `checkSlotTransition` to enforce INV-shell-2 / INV-shell-3 in
 * observe-only mode (logs/warns; never throws, never gates render).
 *
 * Returns the current identity so future phases can drive a real
 * slot mount; in Phase 6 the return value is informational only.
 */

import { useEffect, useRef } from 'react';
import {
  describeSlotIdentity,
  slotIdentityEquals,
  type PlayfieldSlotIdentity,
} from './PlayfieldSlot';
import { checkSlotTransition, recordShellEvent } from './diagnostics';

export interface SlotIdentityTrackerInputs {
  gameId?: string | null;
  gameType?: string | null;
  dealerGameId?: string | null;
}

export function useSlotIdentityTracker(
  inputs: SlotIdentityTrackerInputs,
): PlayfieldSlotIdentity {
  const { gameId, gameType, dealerGameId } = inputs;

  const current: PlayfieldSlotIdentity =
    gameType && dealerGameId ? { gameType, dealerGameId } : null;

  const prevRef = useRef<PlayfieldSlotIdentity>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;

    // Suppress the initial null→null no-op (covers the pre-dealer-game
    // window where nothing has been assigned yet).
    if (!initializedRef.current && current === null) {
      initializedRef.current = true;
      return;
    }
    initializedRef.current = true;

    if (slotIdentityEquals(prev, current)) return;

    // Observe-only invariant check (INV-shell-2 / INV-shell-3).
    checkSlotTransition(prev, current, gameId ?? undefined);

    recordShellEvent('slot-identity-changed', {
      gameId: gameId ?? null,
      gameType: current?.gameType ?? prev?.gameType ?? null,
      dealerGameId: current?.dealerGameId ?? null,
      detail: {
        prev: prev ? describeSlotIdentity(prev) : null,
        next: current ? describeSlotIdentity(current) : null,
      },
    });

    prevRef.current = current;
  }, [gameId, current?.gameType, current?.dealerGameId, current]);

  return current;
}
