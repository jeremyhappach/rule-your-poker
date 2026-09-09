import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { DealerSelectionState } from './useHighCardDealerSelection';
import {
  deriveSessionDealerDrawPresentationReceipt,
  type SessionDealerDrawPresentationReceipt,
} from '@/lib/sessionDealerDrawPresentation';

type AcceptedSession = {
  id: string;
  status: string | null;
  dealer_selection_state?: unknown;
};

/** Presentation only. Both HTTP and Realtime must pass through the game's
 * authoritative merge before reaching this single admission owner. */
export function useSessionDealerDrawReceipt(
  sessionId: string | null | undefined,
  game: AcceptedSession | null | undefined,
) {
  const cursor = useRef({
    sessionId: sessionId ?? null,
    status: null as string | null,
    completed: new Set<string>(),
  });
  const [held, setHeld] = useState<{
    sessionId: string;
    receipt: SessionDealerDrawPresentationReceipt;
  } | null>(null);
  const sameSession = cursor.current.sessionId === (sessionId ?? null);
  const accepted = !!sessionId && game?.id === sessionId;
  const incoming = accepted ? deriveSessionDealerDrawPresentationReceipt({
    previousStatus: sameSession ? cursor.current.status : null,
    nextStatus: game.status,
    incomingState: game.dealer_selection_state as DealerSelectionState | null | undefined,
    completedReceiptKeys: sameSession ? cursor.current.completed : new Set<string>(),
  }) : null;

  // Gate the very first render, not just a later effect: setup must never mount
  // (or start its defaults/configuration effects) ahead of this completed draw.
  const receipt = accepted
    ? (held?.sessionId === sessionId ? held.receipt : null) ?? incoming
    : null;

  useLayoutEffect(() => {
    if (!sameSession) {
      cursor.current = { sessionId: sessionId ?? null, status: null, completed: new Set() };
      setHeld(null);
    }
    if (!accepted) return;
    cursor.current.status = game.status;
    if (incoming) {
      setHeld(current => current?.sessionId === sessionId && current.receipt.key === incoming.key
        ? current : { sessionId, receipt: incoming });
    }
  });

  const completeReceipt = useCallback((key: string) => {
    if (!sessionId || cursor.current.sessionId !== sessionId) return;
    cursor.current.completed.add(key);
    setHeld(current => current?.sessionId === sessionId && current.receipt.key === key
      ? null : current);
  }, [sessionId]);

  return { receipt, completeReceipt };
}
