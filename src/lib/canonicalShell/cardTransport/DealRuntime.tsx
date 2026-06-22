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
import { holmDealDbgRecordRuntime } from './holmDealDbg';
import { holmTimelineRecordSettle } from './holmCardTimeline';

interface DealContextValue {
  handContextId: string;
  gameType: string | null;
  phase: DealPhase;
  expectedCount: number;
  settledCardIds: ReadonlySet<string>;
  dealSettled: boolean;
  readyReleased: boolean;
  timerAllowed: boolean;
  isSettled: (cardId: string) => boolean;
  /**
   * Per-recipient settled count. Cumulative across waves within the
   * same hand — consumers clip visible card count to this directly.
   */
  getSettledCountForPlayer: (playerId: string) => number;
  getSettledCardIdsForPlayer: (playerId: string) => string[];
  beginDeal: (expectedCount: number) => void;
  /**
   * Begin an additional wave of cards in the SAME hand without dropping
   * previously settled cards. Used by staged-deal games (e.g. 3-5-7).
   */
  beginWave: (addedExpectedCount: number) => void;
  enterGameplay: () => void;
}

const DealContext = createContext<DealContextValue | null>(null);

export interface DealRuntimeProps {
  /** Authoritative hand identity. Remount when this changes. */
  handContextId: string;
  gameType?: string | null;
  children: ReactNode;
}

/**
 * Mount DealRuntime with a `key={handContextId}` from the host so a new
 * hand naturally resets state via remount.
 */
export function DealRuntime({ handContextId, gameType = null, children }: DealRuntimeProps) {
  const [phase, setPhase] = useState<DealPhase>('PRE_DEAL');
  const [expectedCount, setExpectedCount] = useState(0);
  const [settledCardIds, setSettledCardIds] = useState<Set<string>>(() => new Set());
  const [settledByRecipient, setSettledByRecipient] = useState<Map<string, number>>(() => new Map());
  const [settledCardIdsByRecipient, setSettledCardIdsByRecipient] = useState<Map<string, string[]>>(() => new Map());
  const ctx = useCardTransportInternal();
  const activeIntentsForHand = useMemo(
    () => (ctx?.__activeIntents ?? []).filter((intent) => {
      const intentHand = intent.handContextId?.replace(/#r\d+$/, '') ?? null;
      return intentHand === handContextId;
    }).length,
    [ctx?.__activeIntents, handContextId],
  );

  const expectedRef = useRef(0);
  expectedRef.current = expectedCount;

  // Subscribe to card-transport settle events with full intent metadata.
  useEffect(() => {
    if (!ctx) return;
    const off = ctx.onCardSettledIntent((intent) => {
      const cardId = intent.cardId;
      if (gameType === 'holm-game') holmTimelineRecordSettle(cardId, performance.now());
      setSettledCardIds((prev) => {
        if (prev.has(cardId)) return prev;
        const next = new Set(prev);
        next.add(cardId);
        const expected = expectedRef.current;
        const ready = expected > 0 && next.size >= expected;
        dealDbgUpsert(handContextId, {
          cardsSettled: next.size,
          dealSettled: ready,
          ...(ready ? { phase: 'READY', readyReleased: false, dealSettled: true } : {}),
        });
        if (ready) {
          queueMicrotask(() => setPhase((p) => (p === 'DEALING' ? 'READY' : p)));
        }
        return next;
      });
      if (intent.recipientPlayerId) {
        const pid = intent.recipientPlayerId;
        setSettledByRecipient((prev) => {
          const next = new Map(prev);
          next.set(pid, (next.get(pid) ?? 0) + 1);
          return next;
        });
        setSettledCardIdsByRecipient((prev) => {
          const next = new Map(prev);
          const list = next.get(pid) ?? [];
          next.set(pid, list.includes(cardId) ? list : list.concat(cardId));
          return next;
        });
      }
    });
    return off;
  }, [ctx, handContextId, gameType]);

  const beginDeal = useCallback((count: number) => {
    setExpectedCount(count);
    setSettledCardIds(new Set());
    setSettledByRecipient(new Map());
    setSettledCardIdsByRecipient(new Map());
    setPhase('DEALING');
    dealDbgUpsert(handContextId, {
      phase: 'DEALING',
      expectedCount: count,
      cardsDispatched: count,
      cardsSettled: 0,
      readyReleased: false,
      dealSettled: false,
      enterGameplayCalledAt: null,
    });
  }, [handContextId]);

  const beginWave = useCallback((addedCount: number) => {
    // Preserve settledCardIds / settledByRecipient — ownership is
    // cumulative across waves within the same hand. We just grow
    // expectedCount and re-enter DEALING.
    setExpectedCount((prev) => {
      const next = prev + addedCount;
      expectedRef.current = next;
      return next;
    });
    setPhase('DEALING');
    dealDbgUpsert(handContextId, {
      phase: 'DEALING',
      cardsDispatched: addedCount,
      readyReleased: false,
      dealSettled: false,
      enterGameplayCalledAt: null,
    });
  }, [handContextId]);

  const enterGameplay = useCallback(() => {
    setPhase((p) => (p === 'READY' ? 'GAMEPLAY' : p));
    if (gameType === 'holm-game') {
      holmDealDbgRecordRuntime({ enterGameplayAt: performance.now(), phase: 'GAMEPLAY' });
    }
    dealDbgUpsert(handContextId, { phase: 'GAMEPLAY', enterGameplayCalledAt: performance.now() });
  }, [gameType, handContextId]);

  useEffect(() => {
    if (phase !== 'READY') return;
    if (!(expectedCount > 0 && settledCardIds.size >= expectedCount)) return;
    if (activeIntentsForHand !== 0) return;
    dealDbgUpsert(handContextId, { readyReleased: true, dealSettled: true });
  }, [phase, expectedCount, settledCardIds.size, activeIntentsForHand, handContextId]);

  useEffect(() => {
    if (gameType !== 'holm-game') return;
    const ids = Array.from(settledCardIds);
    holmDealDbgRecordRuntime({
      handContextId,
      gameType,
      dealRuntimeMounted: true,
      phase,
      expectedCount,
      settledIds: ids,
      cardsSettled: ids.filter((id) => id.includes('#hand-')).length,
      communitySettled: ids.filter((id) => id.includes('#community-')).length,
      chuckySettled: ids.filter((id) => id.includes('#chucky-')).length,
      dealSettled: expectedCount > 0 && ids.length >= expectedCount,
      readyReleased: expectedCount > 0 && ids.length >= expectedCount && activeIntentsForHand === 0,
      activeIntentCount: activeIntentsForHand,
    });
  }, [gameType, handContextId, phase, expectedCount, settledCardIds, activeIntentsForHand]);

  const isSettled = useCallback(
    (cardId: string) => settledCardIds.has(cardId),
    [settledCardIds],
  );

  const getSettledCountForPlayer = useCallback(
    (playerId: string) => settledByRecipient.get(playerId) ?? 0,
    [settledByRecipient],
  );

  const getSettledCardIdsForPlayer = useCallback(
    (playerId: string) => settledCardIdsByRecipient.get(playerId) ?? [],
    [settledCardIdsByRecipient],
  );

  const value = useMemo<DealContextValue>(
    () => ({
      handContextId,
      gameType,
      phase,
      expectedCount,
      settledCardIds,
      dealSettled: expectedCount > 0 && settledCardIds.size >= expectedCount,
      readyReleased: expectedCount > 0 && settledCardIds.size >= expectedCount && activeIntentsForHand === 0,
      timerAllowed: gameType !== 'three-five-seven' || (phase === 'GAMEPLAY' && expectedCount > 0 && settledCardIds.size >= expectedCount && activeIntentsForHand === 0),
      isSettled,
      getSettledCountForPlayer,
      getSettledCardIdsForPlayer,
      beginDeal,
      beginWave,
      enterGameplay,
    }),
    [handContextId, gameType, phase, expectedCount, settledCardIds, activeIntentsForHand, isSettled, getSettledCountForPlayer, getSettledCardIdsForPlayer, beginDeal, beginWave, enterGameplay],
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
