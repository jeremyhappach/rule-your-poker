/**
 * useSlotIdentityTracker — passive Phase 6 hook.
 *
 * Observes the current PlayfieldSlot identity and fires
 * `slot-identity-changed` telemetry on real transitions. Runs
 * `checkSlotTransition` to enforce INV-shell-2 / INV-shell-3 in
 * observe-only mode (logs/warns; never throws, never gates render).
 *
 * RULES OF HOOKS: this hook MUST be called unconditionally in stable
 * order. Use the `enabled` flag (or simply pass null inputs) to make
 * it a runtime no-op without changing hook call order.
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
  /**
   * When false, the hook is a complete no-op (no telemetry, no
   * invariant checks, no ref mutation). Hook call order is preserved.
   * Defaults to true.
   */
  enabled?: boolean;
}

export function useSlotIdentityTracker(
  inputs: SlotIdentityTrackerInputs,
): PlayfieldSlotIdentity {
  const { gameId, gameType, dealerGameId, enabled = true } = inputs;

  const effectiveActive =
    enabled && !!gameType && !!dealerGameId;

  const current: PlayfieldSlotIdentity =
    effectiveActive ? { gameType: gameType as string, dealerGameId: dealerGameId as string } : null;

  const prevRef = useRef<PlayfieldSlotIdentity>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Hard no-op when disabled — preserves hook order but skips all work.
    if (!enabled) return;

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
  }, [enabled, gameId, current?.gameType, current?.dealerGameId, current]);

  return current;
}
