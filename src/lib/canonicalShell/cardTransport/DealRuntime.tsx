/**
 * DealRuntime — shell-owned deal phase state, keyed by handContextId.
 *
 * Mirrors ChipTransport + Settlement: there is NO mutable provider
 * shared across hands. State is held in a context whose effective key
 * is `handContextId`. When the host remounts DealRuntime with a new
 * handContextId, prior state is dropped — natural lifecycle.
 *
 * State (per handContextId):
 *   - phase:           PRE_DEAL | DEALING | READY | GAMEPLAY
 *   - expectedCount:   number of cards the game declared up front
 *   - settledCardIds:  Set<string> of cardIds whose flight settled
 *
 * Public API:
 *   - beginDeal(expectedCount)
 *   - enterGameplay()
 *   - phase
 *   - settledCardIds
 *   - isSettled(cardId)
 *   - dealSettled                   (all expected cards have arrived)
 *
 * Visibility rule for consumers:
 *   render real card ⇔ isSettled(cardId)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DealPhase } from './types';
import { dealDbgUpsert } from './cardTransportDbg';
import { useCardTransportInternal } from './CardTransportProvider';

interface DealContextValue {
  handContextId: string;
  phase: DealPhase;
  expectedCount: number;
  settledCardIds: ReadonlySet<string>;
  dealSettled: boolean;
  isSettled: (cardId: string) => boolean;
  beginDeal: (expectedCount: number) => void;
  enterGameplay: () => void;
}

const DealContext = createContext<DealContextValue | null>(null);

export interface DealRuntimeProps {
  /** Authoritative hand identity. Remount when this changes. */
  handContextId: string;
  children: ReactNode;
}

/**
 * Mount DealRuntime with a `key={handContextId}` from the host so a new
 * hand naturally resets state via remount.
 */
export function DealRuntime({ handContextId, children }: DealRuntimeProps) {
  const [phase, setPhase] = useState<DealPhase>('PRE_DEAL');
  const [expectedCount, setExpectedCount] = useState(0);
  const [settledCardIds, setSettledCardIds] = useState<Set<string>>(() => new Set());
  const ctx = useCardTransportInternal();

  // Track expected count in a ref for the settle subscriber.
  const expectedRef = useRef(0);
  expectedRef.current = expectedCount;

  // Subscribe to card-transport settle events for the lifetime of this
  // hand's DealRuntime. Each settle adds to settledCardIds and, when
  // we reach expectedCount, transitions DEALING → READY.
  useEffect(() => {
    if (!ctx) return;
    const off = ctx.onCardSettled((cardId) => {
      setSettledCardIds((prev) => {
        if (prev.has(cardId)) return prev;
        const next = new Set(prev);
        next.add(cardId);
        const expected = expectedRef.current;
        const ready = expected > 0 && next.size >= expected;
        dealDbgUpsert(handContextId, {
          cardsSettled: next.size,
          ...(ready ? { phase: 'READY', readyReleased: true } : {}),
        });
        if (ready) {
          // Defer setPhase to next tick to avoid setState-during-setState.
          queueMicrotask(() => setPhase((p) => (p === 'DEALING' ? 'READY' : p)));
        }
        return next;
      });
    });
    return off;
  }, [ctx, handContextId]);

  const beginDeal = useCallback((count: number) => {
    setExpectedCount(count);
    setSettledCardIds(new Set());
    setPhase('DEALING');
    dealDbgUpsert(handContextId, {
      phase: 'DEALING',
      expectedCount: count,
      cardsDispatched: count,
      cardsSettled: 0,
      readyReleased: false,
    });
  }, [handContextId]);

  const enterGameplay = useCallback(() => {
    setPhase((p) => (p === 'READY' ? 'GAMEPLAY' : p));
    dealDbgUpsert(handContextId, { phase: 'GAMEPLAY' });
  }, [handContextId]);

  const isSettled = useCallback(
    (cardId: string) => settledCardIds.has(cardId),
    [settledCardIds],
  );

  const value = useMemo<DealContextValue>(
    () => ({
      handContextId,
      phase,
      expectedCount,
      settledCardIds,
      dealSettled: expectedCount > 0 && settledCardIds.size >= expectedCount,
      isSettled,
      beginDeal,
      enterGameplay,
    }),
    [handContextId, phase, expectedCount, settledCardIds, isSettled, beginDeal, enterGameplay],
  );

  return <DealContext.Provider value={value}>{children}</DealContext.Provider>;
}

/**
 * Consumer hook. Returns null when no DealRuntime ancestor is mounted —
 * games that have not yet adopted the canonical deal sequence MUST treat
 * null as "render cards as before" (legacy instant path).
 */
export function useDealRuntime(): DealContextValue | null {
  return useContext(DealContext);
}
