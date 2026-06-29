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
import { holmDealDbgRecordRuntime, holmDealDbgRecordViolation } from './holmDealDbg';
import { holmTimelineRecordSettle } from './holmCardTimeline';
import { markHolmHandReady, clearHolmHandReady } from './holmDealBarrier';
import { ffRecord } from './holmFullForensics';
import {
  notifyCommunitySettleToSampler,
  recordCommunitySettle,
} from './holmCommunityLandingForensics';
import { recordGinRunbackTrace } from '@/lib/ginRunbackTrace';

export interface HolmExpectedCardManifestEntry {
  cardId: string;
  handContextId: string;
}

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
  // ── Holm v3 hand-boundary transaction APIs (Holm-only consumers) ──
  /** Holm-only — current ledger hand generation, incremented by resetForHand. */
  holmHandGeneration: number;
  /**
   * Holm-only — replace the entire ledger with a fresh empty one keyed
   * to (handContextId, handGeneration). Phase → PRE_DEAL. Does NOT set
   * expectedCount. Drops any active intents whose handContextId differs.
   */
  resetForHand: (args: { handContextId: string; handGeneration: number }) => void;
  /**
   * Holm-only — begin DEALING for the active hand with an explicit
   * manifest of expected cards. Validates every cardId carries the
   * matching handContextId. Mismatch → records
   * HAND_RUNTIME_IDENTITY_BREACH, leaves ledger reset, returns.
   */
  beginDealForHand: (args: {
    handContextId: string;
    handGeneration: number;
    expectedCards: HolmExpectedCardManifestEntry[];
  }) => void;
  /** Holm-only — additive wave, same identity rules as beginDealForHand. */
  beginWaveForHand: (args: {
    handContextId: string;
    handGeneration: number;
    addedExpectedCards: HolmExpectedCardManifestEntry[];
  }) => void;
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
  // Latched READY release flag — hand-scoped (DealRuntime is keyed by
  // handContextId at the host) and idempotent. Set exactly once when
  // phase===READY, expectedCount>0, settled>=expected, activeIntents===0.
  // Reset to false on every beginDeal / beginWave / resetForHand /
  // beginDealForHand / beginWaveForHand.
  const [readyReleased, setReadyReleased] = useState(false);
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

  useEffect(() => {
    ffRecord({
      writerId: 'DealRuntime:mount',
      source: 'DEAL_RUNTIME',
      marker: 'DEAL_RUNTIME_MOUNT',
      identity: { hci: handContextId },
      payload: { gameType },
    });
    if (gameType === 'gin-rummy') {
      recordGinRunbackTrace('DealRuntime mount', {
        dealRuntime: { handContextId, gameType, phase: 'PRE_DEAL', expectedCount: 0, settledCount: 0 },
      });
    }
    return () => {
      ffRecord({
        writerId: 'DealRuntime:unmount',
        source: 'DEAL_RUNTIME',
        marker: 'DEAL_RUNTIME_UNMOUNT',
        identity: { hci: handContextId },
        payload: { gameType },
      });
      if (gameType === 'gin-rummy') {
        recordGinRunbackTrace('DealRuntime unmount', {
          dealRuntime: { handContextId, gameType },
        });
      }
    };
  }, [handContextId, gameType]);

  useEffect(() => {
    ffRecord({
      writerId: 'DealRuntime:phaseEffect',
      source: 'DEAL_RUNTIME',
      marker: 'DEAL_RUNTIME_SETPHASE',
      identity: { hci: handContextId },
      payload: {
        phase,
        expectedCount,
        settledSize: settledCardIds.size,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, handContextId]);

  // Subscribe to card-transport settle events with full intent metadata.
  useEffect(() => {
    if (!ctx) return;
    const off = ctx.onCardSettledIntent((intent) => {
      const cardId = intent.cardId;
      if (gameType === 'holm-game') holmTimelineRecordSettle(cardId, performance.now());
      if (gameType === 'holm-game' && cardId.includes('#community-')) {
        const slotMatch = cardId.match(/#community-(\d+)$/);
        const slotIndex = slotMatch ? Number(slotMatch[1]) : -1;
        recordCommunitySettle({
          writerId: 'DealRuntime.tsx:onCardSettledIntent',
          handContextId,
          slotIndex,
          cardId,
          arrivalAt: performance.now(),
          markSettledSource: 'CardTransport.onCardSettledIntent',
          dealPhase: 'DEALING/READY',
          waveStatus: 'settled',
          slotRenderEligible: true,
        });
        notifyCommunitySettleToSampler(handContextId);
      }
      setSettledCardIds((prev) => {
        if (prev.has(cardId)) return prev;
        const next = new Set(prev);
        next.add(cardId);
        const expected = expectedRef.current;
        const ready = expected > 0 && next.size >= expected;
        if (gameType === 'gin-rummy') {
          recordGinRunbackTrace('DealRuntime settle', {
            dealRuntime: {
              handContextId,
              gameType,
              cardId,
              phase,
              expectedCount: expected,
              settledCount: next.size,
              recipientPlayerId: intent.recipientPlayerId ?? null,
              ready,
            },
          });
        }
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
    if (gameType === 'gin-rummy') {
      recordGinRunbackTrace('DealRuntime dispatch/beginDeal', {
        dealRuntime: { handContextId, gameType, phase: 'DEALING', expectedCount: count, settledCount: 0 },
      });
    }
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
  }, [handContextId, gameType]);

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

  // ── Holm v3 hand-boundary transaction state ──
  const [holmHandGeneration, setHolmHandGeneration] = useState(0);
  const holmHandIdentityRef = useRef<{ handContextId: string; handGeneration: number } | null>(null);

  const resetForHand = useCallback((args: { handContextId: string; handGeneration: number }) => {
    holmHandIdentityRef.current = { handContextId: args.handContextId, handGeneration: args.handGeneration };
    setHolmHandGeneration(args.handGeneration);
    setExpectedCount(0);
    expectedRef.current = 0;
    setSettledCardIds(new Set());
    setSettledByRecipient(new Map());
    setSettledCardIdsByRecipient(new Map());
    setPhase('PRE_DEAL');
    if (ctx) {
      try { ctx.dropIntentsNotMatchingHand(args.handContextId, 'holm_resetForHand'); } catch { /* noop */ }
    }
    dealDbgUpsert(handContextId, {
      phase: 'PRE_DEAL',
      expectedCount: 0,
      cardsDispatched: 0,
      cardsSettled: 0,
      readyReleased: false,
      dealSettled: false,
      enterGameplayCalledAt: null,
    });
  }, [ctx, handContextId]);

  const beginDealForHand = useCallback((args: {
    handContextId: string;
    handGeneration: number;
    expectedCards: HolmExpectedCardManifestEntry[];
  }) => {
    // Identity validation: every expected cardId must carry the matching handContextId.
    const breach = args.expectedCards.find((c) => c.handContextId !== args.handContextId);
    if (breach) {
      holmDealDbgRecordViolation({
        type: 'HAND_RUNTIME_IDENTITY_BREACH',
        cardId: breach.cardId,
        handContextId: args.handContextId,
        handGeneration: args.handGeneration,
        phase: 'PRE_DEAL',
        detail: { offendingHandContextId: breach.handContextId },
      });
      // Leave ledger reset; do not count anything dispatched.
      return;
    }
    holmHandIdentityRef.current = { handContextId: args.handContextId, handGeneration: args.handGeneration };
    if (ctx) {
      try { ctx.dropIntentsNotMatchingHand(args.handContextId, 'holm_beginDealForHand'); } catch { /* noop */ }
    }
    const count = args.expectedCards.length;
    setExpectedCount(count);
    expectedRef.current = count;
    setSettledCardIds(new Set());
    setSettledByRecipient(new Map());
    setSettledCardIdsByRecipient(new Map());
    setPhase('DEALING');
    dealDbgUpsert(handContextId, {
      phase: 'DEALING',
      expectedCount: count,
      // Note: dispatched = 0 here. Increments only when CardTransportProvider
      // accepts a current-hand intent — never just because expected.
      cardsDispatched: 0,
      cardsSettled: 0,
      readyReleased: false,
      dealSettled: false,
      enterGameplayCalledAt: null,
    });
  }, [ctx, handContextId]);

  const beginWaveForHand = useCallback((args: {
    handContextId: string;
    handGeneration: number;
    addedExpectedCards: HolmExpectedCardManifestEntry[];
  }) => {
    const breach = args.addedExpectedCards.find((c) => c.handContextId !== args.handContextId);
    if (breach) {
      holmDealDbgRecordViolation({
        type: 'HAND_RUNTIME_IDENTITY_BREACH',
        cardId: breach.cardId,
        handContextId: args.handContextId,
        handGeneration: args.handGeneration,
        phase,
        detail: { offendingHandContextId: breach.handContextId, source: 'beginWaveForHand' },
      });
      return;
    }
    const added = args.addedExpectedCards.length;
    setExpectedCount((prev) => {
      const next = prev + added;
      expectedRef.current = next;
      return next;
    });
    setPhase('DEALING');
    dealDbgUpsert(handContextId, {
      phase: 'DEALING',
      // dispatched = 0 added; transport accept events drive increments.
      cardsDispatched: 0,
      readyReleased: false,
      dealSettled: false,
      enterGameplayCalledAt: null,
    });
  }, [handContextId, phase]);

  const enterGameplay = useCallback(() => {
    if (gameType === 'gin-rummy') {
      recordGinRunbackTrace('DealRuntime enterGameplay', {
        dealRuntime: { handContextId, gameType, phase: 'GAMEPLAY', expectedCount, settledCount: settledCardIds.size },
      });
    }
    setPhase((p) => (p === 'READY' ? 'GAMEPLAY' : p));
    if (gameType === 'holm-game') {
      holmDealDbgRecordRuntime({ enterGameplayAt: performance.now(), phase: 'GAMEPLAY' });
      markHolmHandReady(handContextId);
    }
    dealDbgUpsert(handContextId, { phase: 'GAMEPLAY', enterGameplayCalledAt: performance.now() });
  }, [gameType, handContextId, expectedCount, settledCardIds.size]);

  useEffect(() => {
    if (gameType !== 'gin-rummy') return;
    recordGinRunbackTrace('DealRuntime phase', {
      dealRuntime: {
        handContextId,
        gameType,
        phase,
        expectedCount,
        settledCount: settledCardIds.size,
        activeIntentsForHand,
        dealSettled: expectedCount > 0 && settledCardIds.size >= expectedCount,
        readyReleased: expectedCount > 0 && settledCardIds.size >= expectedCount && activeIntentsForHand === 0,
      },
    });
  }, [gameType, handContextId, phase, expectedCount, settledCardIds.size, activeIntentsForHand]);

  useEffect(() => {
    if (gameType !== 'holm-game') return;
    return () => { clearHolmHandReady(handContextId); };
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
      holmHandGeneration,
      resetForHand,
      beginDealForHand,
      beginWaveForHand,
    }),
    [handContextId, gameType, phase, expectedCount, settledCardIds, activeIntentsForHand, isSettled, getSettledCountForPlayer, getSettledCardIdsForPlayer, beginDeal, beginWave, enterGameplay, holmHandGeneration, resetForHand, beginDealForHand, beginWaveForHand],
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
