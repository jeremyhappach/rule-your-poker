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
import { recordGinPhaseTrace } from '@/lib/ginPhaseTrace';

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
  activeIntentsForHand: number;
  dealSettled: boolean;
  readyReleased: boolean;
  releaseEligible: boolean;
  releaseBlockReason: 'wrong_phase' | 'waiting_for_expected_count' | 'waiting_for_settles' | 'waiting_for_intents' | 'release_fired' | 'unknown';
  timerAllowed: boolean;
  isSettled: (cardId: string) => boolean;
  /**
   * Per-recipient settled count. Cumulative across waves within the
   * same hand — consumers clip visible card count to this directly.
   */
  getSettledCountForPlayer: (playerId: string) => number;
  getSettledCardIdsForPlayer: (playerId: string) => string[];
  /**
   * Per-recipient settled card payloads in transport order. Each entry
   * carries the immutable `visibleFace` metadata stamped by the
   * orchestrator at dispatch time (rank/suit for the local player).
   * `visibleFace` is `null` for intents that did not stamp it (e.g.
   * opponent stack recipients whose face is unknown to the transport).
   * Used by DEALING-phase consumers to render local cards purely from
   * transport-owned metadata without reading the authoritative hand.
   */
  getSettledCardsForPlayer: (playerId: string) => Array<{
    cardId: string;
    visibleFace: { rank: string; suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' } | null;
  }>;
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

function getCribbageDealIdentityAmbient(): {
  handContextId: string | null;
  currentHandKey: string | null;
  renderHandKey: string | null;
  roundId: string | null;
  handNumber: number | null;
  dealRuntimeReactKey: string | null;
  durableHandKey: string | null;
  gameId: string | null;
  dealerGameId: string | null;
} {
  return {
    handContextId: null,
    currentHandKey: null,
    renderHandKey: null,
    roundId: null,
    handNumber: null,
    dealRuntimeReactKey: null,
    durableHandKey: null,
    gameId: null,
    dealerGameId: null,
  };
}
function recordCribbageActiveHandContradiction(
  _tag: string,
  _detail: Record<string, unknown>,
  _opts?: Record<string, unknown>,
): void {
  // no-op — temporary Cribbage wartime instrumentation removed.
}
function recordCribbageDealRuntime(
  _tag: string,
  _payload: Record<string, unknown>,
  _opts: { fn: string; key?: string },
): void {
  // no-op — temporary Cribbage wartime instrumentation removed.
}



export interface DealRuntimeProps {
  /** Authoritative hand identity. Remount when this changes. */
  handContextId: string;
  gameType?: string | null;
  /**
   * Contract A (refresh/rejoin) — initial phase for a freshly-mounted
   * runtime. Games pass 'GAMEPLAY' when authoritative state proves the
   * opening deal has already completed for this handContextId, so
   * orchestrators (which gate dispatch on `phase !== 'PRE_DEAL'`)
   * suppress historical replay. Defaults to 'PRE_DEAL' (live-deal path).
   */
  initialPhase?: DealPhase;
  children: ReactNode;
}

/**
 * Mount DealRuntime with a `key={handContextId}` from the host so a new
 * hand naturally resets state via remount.
 */
export function DealRuntime({ handContextId, gameType = null, initialPhase = 'PRE_DEAL', children }: DealRuntimeProps) {
  const [phase, setPhase] = useState<DealPhase>(initialPhase);
  const [expectedCount, setExpectedCount] = useState(0);
  const [settledCardIds, setSettledCardIds] = useState<Set<string>>(() => new Set());
  const [settledByRecipient, setSettledByRecipient] = useState<Map<string, number>>(() => new Map());
  const [settledCardIdsByRecipient, setSettledCardIdsByRecipient] = useState<Map<string, string[]>>(() => new Map());
  // Per-recipient ordered payload ledger — captures the intent's
  // `visibleFace` at settle time so consumers can render local cards
  // purely from transport-owned metadata during DEALING (no authoritative
  // read in the render path). Cleared identically to the other settled
  // ledgers at every hand/wave boundary.
  const [settledCardPayloadsByRecipient, setSettledCardPayloadsByRecipient] = useState<
    Map<string, Array<{ cardId: string; visibleFace: { rank: string; suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' } | null }>>
  >(() => new Map());
  // Latched READY release flag — hand-scoped (DealRuntime is keyed by
  // handContextId at the host) and idempotent. Set exactly once when
  // phase===READY, expectedCount>0, settled>=expected, activeIntents===0.
  // Reset to false on every beginDeal / beginWave / resetForHand /
  // beginDealForHand / beginWaveForHand.
  // `initialPhase="GAMEPLAY"` is the authoritative reconnect/historical
  // contract: this hand has no client-owned transports left to settle. Keep
  // the runtime's terminal flags consistent with that phase so downstream
  // timer owners do not wait forever for a wave that was deliberately not
  // replayed.
  const [readyReleased, setReadyReleased] = useState(() => initialPhase === 'GAMEPLAY');
  const ctx = useCardTransportInternal();
  const expectedCardIdsRef = useRef<Set<string>>(new Set());
  const processedSettledIntentIdsRef = useRef<Set<string>>(new Set());
  const activeIntentsForHand = useMemo(
    () => (ctx?.__activeIntents ?? []).filter((intent) => {
      const intentHand = intent.handContextId?.replace(/#r\d+$/, '') ?? null;
      return intentHand === handContextId;
    }).length,
    [ctx?.__activeIntents, handContextId],
  );

  const expectedRef = useRef(0);
  expectedRef.current = expectedCount;

  // Live refs for enriched mount/unmount + ownership contradictions.
  const phaseRef = useRef<DealPhase>('PRE_DEAL');
  phaseRef.current = phase;
  const settledCountRef = useRef(0);
  settledCountRef.current = settledCardIds.size;
  const activeIntentsRef = useRef(0);
  activeIntentsRef.current = activeIntentsForHand;

  useEffect(() => {
    const identAtMount = getCribbageDealIdentityAmbient();
    ffRecord({
      writerId: 'DealRuntime:mount',
      source: 'DEAL_RUNTIME',
      marker: 'DEAL_RUNTIME_MOUNT',
      identity: { hci: handContextId },
      payload: { gameType },
    });
    if (gameType === 'cribbage') {
      recordCribbageDealRuntime('deal_runtime_mounted', {
        handContextId,
        dealRuntimeReactKey: handContextId,
        gameType,
        initialPhase: 'PRE_DEAL',
        // Ownership enrichment.
        durableHandKey: identAtMount.durableHandKey,
        currentHandKey: identAtMount.currentHandKey,
        gameId: identAtMount.gameId,
        dealerGameId: identAtMount.dealerGameId,
        runtimePhase: 'PRE_DEAL',
        expectedCount: 0,
        settledCount: 0,
        activeIntentsForHand: 0,
      }, { fn: 'mountEffect', key: `mount:${handContextId}` });
    }
    if (gameType === 'gin-rummy') {
      recordGinPhaseTrace({
        kind: 'deal-runtime-mount',
        summary: 'Gin DealRuntime mounted',
        sourceFile: 'src/lib/canonicalShell/cardTransport/DealRuntime.tsx',
        sourceFunction: 'DealRuntime.mountEffect',
        identity: { handContextId },
        detail: { runtimeKey: handContextId, gameType },
      });
    }
    return () => {
      const identAtUnmount = getCribbageDealIdentityAmbient();
      const phaseAtUnmount = phaseRef.current;
      const expectedAtUnmount = expectedRef.current;
      const settledAtUnmount = settledCountRef.current;
      const activeAtUnmount = activeIntentsRef.current;
      ffRecord({
        writerId: 'DealRuntime:unmount',
        source: 'DEAL_RUNTIME',
        marker: 'DEAL_RUNTIME_UNMOUNT',
        identity: { hci: handContextId },
        payload: { gameType },
      });
      if (gameType === 'cribbage') {
        const enrichedPayload = {
          handContextId,
          dealRuntimeReactKey: handContextId,
          gameType,
          durableHandKey: identAtUnmount.durableHandKey,
          currentHandKey: identAtUnmount.currentHandKey,
          gameId: identAtUnmount.gameId,
          dealerGameId: identAtUnmount.dealerGameId,
          roundId: identAtUnmount.roundId,
          handNumber: identAtUnmount.handNumber,
          runtimePhase: phaseAtUnmount,
          expectedCount: expectedAtUnmount,
          settledCount: settledAtUnmount,
          activeIntentsForHand: activeAtUnmount,
        };
        recordCribbageDealRuntime('deal_runtime_unmounted', enrichedPayload, {
          fn: 'unmountEffect',
          key: `unmount:${handContextId}`,
        });

        // Ownership contradiction: DealRuntime is unmounting while the
        // ambient identity still points at this same durable hand and
        // no different valid canonical hand key has arrived. This
        // captures the exact regression the durable latch was
        // introduced to prevent (published trace: runtime destroyed
        // between beginDeal and settlement while CardTransportProvider
        // retained the accepted deterministic intent IDs).
        //
        // Deferred via queueMicrotask so the check runs AFTER React
        // finishes tearing down children in the same commit. If the
        // parent CribbageMobileGameTable is also unmounting, its
        // cleanup effect will have cleared the ambient by the time
        // this microtask runs, and the contradiction will not fire.
        const runtimeKey = handContextId;
        queueMicrotask(() => {
          const identNow = getCribbageDealIdentityAmbient();
          const sameDurable = !!identNow.durableHandKey &&
            identNow.durableHandKey === runtimeKey;
          const currentEmptyOrSame = !identNow.currentHandKey ||
            identNow.currentHandKey === runtimeKey;
          if (sameDurable && currentEmptyOrSame) {
            recordCribbageActiveHandContradiction(
              'deal_runtime_unmounted_with_same_durable_hand',
              {
                ...enrichedPayload,
                ambientAfterUnmount: {
                  durableHandKey: identNow.durableHandKey,
                  currentHandKey: identNow.currentHandKey,
                  renderHandKey: identNow.renderHandKey,
                  gameId: identNow.gameId,
                  dealerGameId: identNow.dealerGameId,
                },
              },
              {
                producer: 'DealRuntime',
                fn: 'unmountEffect.postCleanupCheck',
                key: `runtimeUnmountSameDurable:${runtimeKey}`,
              },
            );
          }
        });
      }
      if (gameType === 'gin-rummy') {
        recordGinPhaseTrace({
          kind: 'deal-runtime-unmount',
          summary: 'Gin DealRuntime unmounted',
          sourceFile: 'src/lib/canonicalShell/cardTransport/DealRuntime.tsx',
          sourceFunction: 'DealRuntime.unmountEffect',
          identity: { handContextId },
          detail: { runtimeKey: handContextId, gameType },
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
    if (gameType === 'cribbage') {
      recordCribbageDealRuntime('deal_runtime_phase_snapshot', {
        handContextId,
        dealRuntimeReactKey: handContextId,
        gameType,
        phase,
        expectedCount,
        settledCardIds: Array.from(settledCardIds),
        settledCount: settledCardIds.size,
        settledByRecipient: Array.from(settledByRecipient.entries()).map(([playerId, count]) => ({ playerId, count })),
        settledCardIdsByRecipient: Array.from(settledCardIdsByRecipient.entries()).map(([playerId, ids]) => ({ playerId, ids })),
        activeIntentsForHand,
      }, { fn: 'phaseEffect', key: `phase:${handContextId}:${phase}:${expectedCount}:${settledCardIds.size}:${activeIntentsForHand}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, handContextId, gameType, expectedCount, settledCardIds, settledByRecipient, settledCardIdsByRecipient, activeIntentsForHand]);

  // Subscribe to card-transport settle events with full intent metadata.
  useEffect(() => {
    if (!ctx) return;
    const off = ctx.onCardSettledIntent((intent) => {
      const cardId = intent.cardId;
      if (gameType === 'holm-game') {
        const intentHand = intent.handContextId?.replace(/#r\d+$/, '') ?? null;
        const activeIdentity = holmHandIdentityRef.current;
        const generationMatches = activeIdentity?.handContextId === handContextId
          && intent.handGeneration === activeIdentity.handGeneration;
        if (
          intentHand !== handContextId
          || !generationMatches
          || !expectedCardIdsRef.current.has(cardId)
          || ctx.getIntentLifecycle(intent.id)?.state !== 'settled'
          || processedSettledIntentIdsRef.current.has(intent.id)
        ) return;
        processedSettledIntentIdsRef.current.add(intent.id);
      }
      if (gameType === 'cribbage') {
        recordCribbageDealRuntime('deal_runtime_settle_intent_received', {
          handContextId,
          dealRuntimeReactKey: handContextId,
          gameType,
          phase,
          expectedCount: expectedRef.current,
          intentId: intent.id,
          cardId,
          intentHandContextId: intent.handContextId ?? null,
          recipientPlayerId: intent.recipientPlayerId ?? null,
          settledCountBefore: settledCardIds.size,
          settledForRecipientBefore: intent.recipientPlayerId ? (settledByRecipient.get(intent.recipientPlayerId) ?? 0) : null,
        }, { fn: 'onCardSettledIntent', key: `settleIntent:${handContextId}:${intent.id}` });
      }
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
          recordGinPhaseTrace({
            kind: ready ? 'deal-runtime-complete' : 'card-transport-settle',
            summary: ready ? 'Gin DealRuntime completed expected settles' : 'Gin DealRuntime accepted settled card',
            sourceFile: 'src/lib/canonicalShell/cardTransport/DealRuntime.tsx',
            sourceFunction: 'DealRuntime.onCardSettledIntent',
            identity: { handContextId },
            detail: {
              cardId,
              intentId: intent.id,
              recipientPlayerId: intent.recipientPlayerId ?? null,
              settledSize: next.size,
              expectedCount: expected,
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
          const nextCount = (next.get(pid) ?? 0) + 1;
          next.set(pid, nextCount);
          if (gameType === 'cribbage') {
            recordCribbageDealRuntime('deal_runtime_recipient_settled_count_changed', {
              handContextId,
              dealRuntimeReactKey: handContextId,
              gameType,
              playerId: pid,
              intentId: intent.id,
              cardId,
              nextCount,
            }, { fn: 'setSettledByRecipient', key: `recipientSettled:${handContextId}:${pid}:${nextCount}:${intent.id}` });
          }
          return next;
        });
        setSettledCardIdsByRecipient((prev) => {
          const next = new Map(prev);
          const list = next.get(pid) ?? [];
          next.set(pid, list.includes(cardId) ? list : list.concat(cardId));
          return next;
        });
        // Immutable payload ledger — append the intent's visibleFace
        // (or null for hidden opponent flights) in transport order.
        setSettledCardPayloadsByRecipient((prev) => {
          const next = new Map(prev);
          const list = next.get(pid) ?? [];
          if (list.some((e) => e.cardId === cardId)) return prev;
          next.set(pid, list.concat({
            cardId,
            visibleFace: intent.visibleFace ?? null,
          }));
          return next;
        });
      }
    });
    return off;
  }, [ctx, handContextId, gameType, phase, settledCardIds, settledByRecipient]);

  // Provider lifecycle outlives DealRuntime. Re-emit exact settled metadata
  // whenever a manifest is declared or its lifecycle advances so remounts can
  // rebuild the same hand without redispatching or waiting for a lost edge.
  useEffect(() => {
    if (gameType !== 'holm-game' || !ctx || expectedCount <= 0) return;
    ctx.replaySettledIntents(handContextId);
  }, [ctx, ctx?.__lifecycleVersion, expectedCount, gameType, handContextId]);

  const beginDeal = useCallback((count: number) => {
    if (gameType === 'cribbage') {
      recordCribbageDealRuntime('deal_runtime_beginDeal_called', {
        handContextId,
        dealRuntimeReactKey: handContextId,
        gameType,
        expectedCount: count,
        previousPhase: phase,
        previousExpectedCount: expectedCount,
        previousSettledCardIds: Array.from(settledCardIds),
        previousSettledCount: settledCardIds.size,
        codePath: 'DealRuntime.beginDeal -> setExpectedCount(count); clear settled ledgers; setPhase(DEALING)',
      }, { fn: 'beginDeal', key: `beginDeal:${handContextId}:${count}:${phase}:${expectedCount}:${settledCardIds.size}` });
    }
    if (gameType === 'gin-rummy') {
      recordGinPhaseTrace({
        kind: 'deal-runtime-start',
        summary: 'Gin DealRuntime beginDeal',
        sourceFile: 'src/lib/canonicalShell/cardTransport/DealRuntime.tsx',
        sourceFunction: 'DealRuntime.beginDeal',
        identity: { handContextId },
        detail: {
          expectedCount: count,
          runtimeKey: handContextId,
          previousPhase: phase,
          previousExpectedCount: expectedCount,
          previousSettledCount: settledCardIds.size,
        },
      });
    }
    setExpectedCount(count);
    setSettledCardIds(new Set());
    setSettledByRecipient(new Map());
    setSettledCardIdsByRecipient(new Map());
    setSettledCardPayloadsByRecipient(new Map());
    setPhase('DEALING');
    setReadyReleased(false);
    dealDbgUpsert(handContextId, {
      phase: 'DEALING',
      expectedCount: count,
      cardsDispatched: count,
      cardsSettled: 0,
      readyReleased: false,
      dealSettled: false,
      enterGameplayCalledAt: null,
    });
  }, [handContextId, gameType, phase, expectedCount, settledCardIds.size]);

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
    setReadyReleased(false);
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
    expectedCardIdsRef.current = new Set();
    processedSettledIntentIdsRef.current = new Set();
    setHolmHandGeneration(args.handGeneration);
    setExpectedCount(0);
    expectedRef.current = 0;
    setSettledCardIds(new Set());
    setSettledByRecipient(new Map());
    setSettledCardIdsByRecipient(new Map());
    setSettledCardPayloadsByRecipient(new Map());
    setPhase('PRE_DEAL');
    setReadyReleased(false);
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
    const runtimeIdentityBreach = args.handContextId !== handContextId;
    if (breach || runtimeIdentityBreach) {
      holmDealDbgRecordViolation({
        type: 'HAND_RUNTIME_IDENTITY_BREACH',
        cardId: breach?.cardId ?? args.expectedCards[0]?.cardId ?? 'missing-card',
        handContextId: args.handContextId,
        handGeneration: args.handGeneration,
        phase: 'PRE_DEAL',
        detail: {
          runtimeHandContextId: handContextId,
          offendingHandContextId: breach?.handContextId ?? args.handContextId,
        },
      });
      // Leave ledger reset; do not count anything dispatched.
      return;
    }
    holmHandIdentityRef.current = { handContextId: args.handContextId, handGeneration: args.handGeneration };
    setHolmHandGeneration(args.handGeneration);
    expectedCardIdsRef.current = new Set(args.expectedCards.map((card) => card.cardId));
    processedSettledIntentIdsRef.current = new Set();
    if (ctx) {
      try { ctx.dropIntentsNotMatchingHand(args.handContextId, 'holm_beginDealForHand'); } catch { /* noop */ }
    }
    const count = args.expectedCards.length;
    setExpectedCount(count);
    expectedRef.current = count;
    setSettledCardIds(new Set());
    setSettledByRecipient(new Map());
    setSettledCardIdsByRecipient(new Map());
    setSettledCardPayloadsByRecipient(new Map());
    setPhase('DEALING');
    setReadyReleased(false);
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
    const activeIdentity = holmHandIdentityRef.current;
    const runtimeIdentityBreach = args.handContextId !== handContextId
      || activeIdentity?.handContextId !== args.handContextId
      || activeIdentity?.handGeneration !== args.handGeneration;
    if (breach || runtimeIdentityBreach) {
      holmDealDbgRecordViolation({
        type: 'HAND_RUNTIME_IDENTITY_BREACH',
        cardId: breach?.cardId ?? args.addedExpectedCards[0]?.cardId ?? 'missing-card',
        handContextId: args.handContextId,
        handGeneration: args.handGeneration,
        phase,
        detail: {
          runtimeHandContextId: handContextId,
          activeIdentity,
          offendingHandContextId: breach?.handContextId ?? args.handContextId,
          source: 'beginWaveForHand',
        },
      });
      return;
    }
    const added = args.addedExpectedCards.length;
    for (const card of args.addedExpectedCards) expectedCardIdsRef.current.add(card.cardId);
    setExpectedCount((prev) => {
      const next = prev + added;
      expectedRef.current = next;
      return next;
    });
    setPhase('DEALING');
    setReadyReleased(false);
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
  }, [gameType, handContextId, phase, expectedCount, settledCardIds.size, activeIntentsForHand]);

  useEffect(() => {
    if (gameType !== 'holm-game') return;
    // A fresh mount on an already-actionable authoritative hand deliberately
    // skips historical card replay. It is therefore ready immediately and
    // must open the same shared timer/action barrier as a completed live deal.
    if (initialPhase === 'GAMEPLAY') markHolmHandReady(handContextId);
    return () => { clearHolmHandReady(handContextId); };
  }, [gameType, handContextId, initialPhase]);

  // Deterministic READY release latch. Hand-scoped (DealRuntime keyed
  // by handContextId at host), idempotent (setReadyReleased guard +
  // useState identity), no animation callbacks, no closures over stale
  // state — depends only on currently-rendered values.
  const dealSettledNow =
    (initialPhase === 'GAMEPLAY' && phase === 'GAMEPLAY')
    || (expectedCount > 0 && settledCardIds.size >= expectedCount);
  const releaseEligible =
    phase === 'READY' &&
    dealSettledNow &&
    activeIntentsForHand === 0;
  const releaseBlockReason: 'wrong_phase' | 'waiting_for_expected_count' | 'waiting_for_settles' | 'waiting_for_intents' | 'release_fired' | 'unknown' =
    readyReleased
      ? 'release_fired'
      : phase !== 'READY'
        ? 'wrong_phase'
        : expectedCount === 0
          ? 'waiting_for_expected_count'
          : settledCardIds.size < expectedCount
            ? 'waiting_for_settles'
            : activeIntentsForHand > 0
              ? 'waiting_for_intents'
              : 'unknown';

  useEffect(() => {
    if (!releaseEligible) return;
    if (readyReleased) return;
    setReadyReleased(true);
    dealDbgUpsert(handContextId, { readyReleased: true, dealSettled: true });
    if (gameType === 'gin-rummy') {
    }
  }, [releaseEligible, readyReleased, handContextId, gameType, phase, expectedCount, settledCardIds.size, activeIntentsForHand]);

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
      dealSettled: dealSettledNow,
      readyReleased,
      activeIntentCount: activeIntentsForHand,
    });
  }, [gameType, handContextId, phase, expectedCount, settledCardIds, dealSettledNow, readyReleased, activeIntentsForHand]);

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

  const getSettledCardsForPlayer = useCallback(
    (playerId: string) => settledCardPayloadsByRecipient.get(playerId) ?? [],
    [settledCardPayloadsByRecipient],
  );

  const value = useMemo<DealContextValue>(
    () => ({
      handContextId,
      gameType,
      phase,
      expectedCount,
      settledCardIds,
      activeIntentsForHand,
      dealSettled: dealSettledNow,
      readyReleased,
      releaseEligible,
      releaseBlockReason,
      timerAllowed: gameType !== 'three-five-seven' || (phase === 'GAMEPLAY' && dealSettledNow && activeIntentsForHand === 0),
      isSettled,
      getSettledCountForPlayer,
      getSettledCardIdsForPlayer,
      getSettledCardsForPlayer,
      beginDeal,
      beginWave,
      enterGameplay,
      holmHandGeneration,
      resetForHand,
      beginDealForHand,
      beginWaveForHand,
    }),
    [handContextId, gameType, phase, expectedCount, settledCardIds, dealSettledNow, readyReleased, releaseEligible, releaseBlockReason, activeIntentsForHand, isSettled, getSettledCountForPlayer, getSettledCardIdsForPlayer, getSettledCardsForPlayer, beginDeal, beginWave, enterGameplay, holmHandGeneration, resetForHand, beginDealForHand, beginWaveForHand],
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
