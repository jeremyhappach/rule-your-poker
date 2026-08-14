/**
 * CardTransportProvider — shell-owned dispatch surface for card flights.
 *
 * Mirrors ChipTransportProvider. Games call useCardTransport().dispatch /
 * dispatchMany. The runtime (CardTransportRuntime) consumes
 * __activeIntents and signals __markSettled / __markDropped.
 *
 * NO global counters. NO phase state. Deal lifecycle lives in
 * DealRuntime, which subscribes to settle events.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CardTransportIntent } from './types';
import { describeCardEndpoint } from './types';
import { cardTransportDbgUpsert } from './cardTransportDbg';
import { ffRecord } from './holmFullForensics';
import { recordGinPhaseTrace } from '@/lib/ginPhaseTrace';

function recordCribbageCardTransportProvider(
  _tag: string,
  _payload: Record<string, unknown>,
  _opts: { fn: string; key?: string },
): void {
  // Temporary Cribbage deal-transport wartime instrumentation removed.
}


export interface ActiveCardIntent extends CardTransportIntent {
  enqueueSeq: number;
  enqueuedAt: number;
}

export interface CardDispatchOptions {
  onSettled?: (cardId: string) => void;
}

export interface CardDispatchManyOptions {
  onSettled?: (cardId: string) => void;
  onAllSettled?: () => void;
}

export type CardIntentLifecycleState = 'active' | 'settled' | 'dropped';

export interface CardIntentLifecycleSnapshot {
  intent: CardTransportIntent;
  state: CardIntentLifecycleState;
  settledSource?: string;
  droppedReason?: string;
}

export interface CardManifestReconciliation {
  total: number;
  accepted: number;
  active: number;
  settled: number;
  dropped: number;
  conflicts: number;
  allOwned: boolean;
}

function isSameManifestIdentity(
  existing: CardTransportIntent,
  incoming: CardTransportIntent,
): boolean {
  return existing.cardId === incoming.cardId
    && (existing.handContextId ?? null) === (incoming.handContextId ?? null)
    && (existing.handGeneration ?? null) === (incoming.handGeneration ?? null)
    && (existing.recipientPlayerId ?? null) === (incoming.recipientPlayerId ?? null)
    && existing.face === incoming.face
    && describeCardEndpoint(existing.from) === describeCardEndpoint(incoming.from)
    && describeCardEndpoint(existing.to) === describeCardEndpoint(incoming.to)
    && (existing.visibleFace?.rank ?? null) === (incoming.visibleFace?.rank ?? null)
    && (existing.visibleFace?.suit ?? null) === (incoming.visibleFace?.suit ?? null);
}

interface CardTransportContextValue {
  dispatch: (intent: CardTransportIntent, opts?: CardDispatchOptions) => boolean;
  dispatchMany: (intents: CardTransportIntent[], opts?: CardDispatchManyOptions) => number;
  /** Holm presentation manifests reconcile unseen, active, and settled IDs. */
  reconcileMany: (intents: CardTransportIntent[]) => CardManifestReconciliation;
  getIntentLifecycle: (intentId: string) => CardIntentLifecycleSnapshot | null;
  getHandIntentLifecycles: (handContextId: string) => CardIntentLifecycleSnapshot[];
  /** Re-emit settled metadata so a remounted DealRuntime can reconstruct. */
  replaySettledIntents: (handContextId: string) => number;
  /** Subscribe to per-card settle events (cardId emitted). */
  onCardSettled: (handler: (cardId: string) => void) => () => void;
  /** Subscribe to settle events with full intent metadata. */
  onCardSettledIntent: (handler: (intent: CardTransportIntent) => void) => () => void;
  /**
   * Holm v3 — synchronously drop every active intent whose
   * `handContextId` does not match `handContextId`. Each dropped intent
   * fires its onSettled / settled-subscribers as `dropped` so deal
   * runtimes never hang. Non-Holm callers do not invoke this.
   */
  dropIntentsNotMatchingHand: (handContextId: string, reason: string) => number;
  __activeIntents: ActiveCardIntent[];
  __lifecycleVersion: number;
  __markSettled: (intentId: string, cardId: string, source?: string) => void;
  __markDropped: (intent: CardTransportIntent, reason: string) => void;
  gameId?: string | null;
  gameType?: string | null;
}

const CardTransportContext = createContext<CardTransportContextValue | null>(null);

export interface CardTransportProviderProps {
  gameId?: string | null;
  gameType?: string | null;
  children: ReactNode;
}

export function CardTransportProvider({
  gameId = null,
  gameType = null,
  children,
}: CardTransportProviderProps) {
  const [activeIntents, setActiveIntents] = useState<ActiveCardIntent[]>([]);
  const activeIntentsRef = useRef<ActiveCardIntent[]>([]);
  activeIntentsRef.current = activeIntents;
  const seenRef = useRef<Set<string>>(new Set());
  const intentByIdRef = useRef<Map<string, CardTransportIntent>>(new Map());
  const lifecycleByIdRef = useRef<Map<string, CardIntentLifecycleSnapshot>>(new Map());
  const [lifecycleVersion, setLifecycleVersion] = useState(0);
  const seqRef = useRef(0);
  const onSettledMapRef = useRef<Map<string, (cardId: string) => void>>(new Map());
  const subscribersRef = useRef<Set<(cardId: string) => void>>(new Set());
  const intentSubscribersRef = useRef<Set<(intent: CardTransportIntent) => void>>(new Set());

  const publishLifecycle = useCallback((snapshot: CardIntentLifecycleSnapshot) => {
    if (gameType !== 'holm-game') return;
    lifecycleByIdRef.current.set(snapshot.intent.id, snapshot);
    setLifecycleVersion((version) => version + 1);
  }, [gameType]);

  const acceptOne = useCallback(
    (intent: CardTransportIntent, opts?: CardDispatchOptions): boolean => {
      if (!intent || !intent.id) {
        recordCribbageCardTransportProvider('card_transport_intent_rejected', {
          gameId,
          gameType,
          reason: 'missing-id',
          intentPresent: !!intent,
          intentIdPresent: !!intent?.id,
          activeCount: activeIntentsRef.current.length,
        }, { fn: 'acceptOne.missingId', key: `reject-missing:${gameId ?? 'no-game'}` });
        ffRecord({
          writerId: 'CardTransportProvider.tsx:acceptOne:L86',
          source: 'CARD_TRANSPORT',
          marker: 'CT_INTENT_REJECTED',
          identity: { gameId, ownerInstanceId: 'CardTransportProvider' },
          payload: {
            reason: 'missing-id',
            intentIdPresent: !!intent?.id,
            intentPresent: !!intent,
            activeCount: activeIntentsRef.current.length,
          },
        });
        return false;
      }
      if (seenRef.current.has(intent.id)) {
        recordCribbageCardTransportProvider('card_transport_intent_rejected', {
          gameId,
          gameType,
          reason: 'duplicate-id',
          intentId: intent.id,
          cardId: intent.cardId,
          handContextId: intent.handContextId ?? null,
          activeCount: activeIntentsRef.current.length,
        }, { fn: 'acceptOne.duplicateId', key: `reject-duplicate:${intent.id}` });
        ffRecord({
          writerId: 'CardTransportProvider.tsx:acceptOne:L99',
          source: 'CARD_TRANSPORT',
          marker: 'CT_INTENT_REJECTED',
          identity: { gameId, ownerInstanceId: 'CardTransportProvider' },
          payload: {
            reason: 'duplicate-id',
            intentId: intent.id,
            cardId: intent.cardId,
            handContextId: intent.handContextId ?? null,
            activeCount: activeIntentsRef.current.length,
          },
        });
        return false;
      }
      const now = performance.now();
      seenRef.current.add(intent.id);
      intentByIdRef.current.set(intent.id, intent);
      publishLifecycle({ intent, state: 'active' });
      const enqueueSeq = ++seqRef.current;
      if (opts?.onSettled) onSettledMapRef.current.set(intent.id, opts.onSettled);
      cardTransportDbgUpsert(intent.id, {
        cardId: intent.cardId,
        face: intent.face,
        from: intent.from,
        to: intent.to,
        handContextId: intent.handContextId ?? null,
        providerReceivedAt: now,
        activeIntentVisibleAt: now,
        lifecycleState: 'active_visible',
        droppedReason: null,
      });
      recordCribbageCardTransportProvider('card_transport_intent_accepted', {
        gameId,
        gameType,
        intentId: intent.id,
        cardId: intent.cardId,
        handContextId: intent.handContextId ?? null,
        recipientPlayerId: intent.recipientPlayerId ?? null,
        from: describeCardEndpoint(intent.from),
        to: describeCardEndpoint(intent.to),
        enqueueSeq,
        enqueuedAt: now,
        priorActiveCount: activeIntentsRef.current.length,
        nextActiveCount: activeIntentsRef.current.length + 1,
      }, { fn: 'acceptOne.accepted', key: `accepted:${intent.id}` });
      ffRecord({
        writerId: 'CardTransportProvider.tsx:acceptOne:L119',
        source: 'CARD_TRANSPORT',
        marker: 'CT_INTENT_ACCEPTED',
        identity: {
          gameId,
          ownerInstanceId: 'CardTransportProvider',
          segmentId: intent.handContextId ?? null,
        },
        payload: {
          intentId: intent.id,
          cardId: intent.cardId,
          face: intent.face,
          from: describeCardEndpoint(intent.from),
          to: describeCardEndpoint(intent.to),
          handContextId: intent.handContextId ?? null,
          enqueueSeq,
          enqueuedAt: now,
          priorActiveCount: activeIntentsRef.current.length,
          nextActiveCount: activeIntentsRef.current.length + 1,
        },
      });
      if (gameType === 'gin-rummy') {
        recordGinPhaseTrace({
          kind: 'card-transport-dispatch',
          summary: 'Gin card transport accepted intent',
          sourceFile: 'src/lib/canonicalShell/cardTransport/CardTransportProvider.tsx',
          sourceFunction: 'CardTransportProvider.acceptOne',
          identity: { gameId, handContextId: intent.handContextId ?? null },
          detail: {
            intentId: intent.id,
            cardId: intent.cardId,
            face: intent.face,
            from: describeCardEndpoint(intent.from),
            to: describeCardEndpoint(intent.to),
            recipientPlayerId: intent.recipientPlayerId ?? null,
            enqueueSeq,
            priorActiveCount: activeIntentsRef.current.length,
          },
        });
      }
      setActiveIntents((prev) => [
        ...prev,
        { ...intent, enqueueSeq, enqueuedAt: now },
      ]);
      return true;
    },
    [gameId, gameType, publishLifecycle],
  );

  const dispatch = useCallback(
    (intent: CardTransportIntent, opts?: CardDispatchOptions) => acceptOne(intent, opts),
    [acceptOne],
  );

  const dispatchMany = useCallback(
    (intents: CardTransportIntent[], opts?: CardDispatchManyOptions) => {
      recordCribbageCardTransportProvider('card_transport_dispatchMany_init', {
        gameId,
        gameType,
        incoming: intents.length,
        intentIds: intents.map((i) => i.id),
        cardIds: intents.map((i) => i.cardId),
        handContextIds: Array.from(new Set(intents.map((i) => i.handContextId ?? null))),
        recipientPlayerIds: intents.map((i) => i.recipientPlayerId ?? null),
        priorActiveCount: activeIntentsRef.current.length,
      }, { fn: 'dispatchMany.init', key: `dispatchMany:init:${intents.map((i) => i.id).join('|')}` });
      ffRecord({
        writerId: 'CardTransportProvider.tsx:dispatchMany:L170',
        source: 'CARD_TRANSPORT',
        marker: 'CT_DISPATCH_MANY_INIT',
        identity: { gameId, ownerInstanceId: 'CardTransportProvider' },
        payload: {
          incoming: intents.length,
          ids: intents.map((i) => i.id),
          handContextIds: Array.from(new Set(intents.map((i) => i.handContextId ?? null))),
          priorActiveCount: activeIntentsRef.current.length,
        },
      });
      let accepted = 0;
      const expected = intents.length;
      let settledCount = 0;
      const tick = (cardId: string) => {
        opts?.onSettled?.(cardId);
        settledCount += 1;
        if (settledCount >= expected) opts?.onAllSettled?.();
      };
      for (const i of intents) {
        if (acceptOne(i, { onSettled: tick })) accepted += 1;
        else tick(i.cardId);
      }
      ffRecord({
        writerId: 'CardTransportProvider.tsx:dispatchMany:L194',
        source: 'CARD_TRANSPORT',
        marker: 'CT_DISPATCH_MANY_DONE',
        identity: { gameId, ownerInstanceId: 'CardTransportProvider' },
        payload: {
          incoming: intents.length,
          accepted,
          rejectedAsDuplicateOrEmpty: intents.length - accepted,
          nextActiveCount: activeIntentsRef.current.length,
        },
      });
      recordCribbageCardTransportProvider('card_transport_dispatchMany_done', {
        gameId,
        gameType,
        incoming: intents.length,
        accepted,
        rejectedAsDuplicateOrEmpty: intents.length - accepted,
        intentIds: intents.map((i) => i.id),
        cardIds: intents.map((i) => i.cardId),
        handContextIds: Array.from(new Set(intents.map((i) => i.handContextId ?? null))),
        activeCountBeforeStateCommit: activeIntentsRef.current.length,
      }, { fn: 'dispatchMany.done', key: `dispatchMany:done:${intents.map((i) => i.id).join('|')}:${accepted}` });
      if (gameType === 'gin-rummy') {
        recordGinPhaseTrace({
          kind: 'card-transport-dispatch',
          summary: 'Gin card transport dispatchMany complete',
          sourceFile: 'src/lib/canonicalShell/cardTransport/CardTransportProvider.tsx',
          sourceFunction: 'CardTransportProvider.dispatchMany',
          identity: { gameId, handContextId: intents[0]?.handContextId ?? null },
          detail: {
            incoming: intents.length,
            accepted,
            rejectedAsDuplicateOrEmpty: intents.length - accepted,
            handContextIds: Array.from(new Set(intents.map((i) => i.handContextId ?? null))),
          },
        });
      }
      return accepted;
    },
    [acceptOne, gameId, gameType],
  );

  const getIntentLifecycle = useCallback((intentId: string) =>
    lifecycleByIdRef.current.get(intentId) ?? null, []);

  const getHandIntentLifecycles = useCallback((handContextId: string) =>
    Array.from(lifecycleByIdRef.current.values()).filter((snapshot) => {
      const snapshotHand = snapshot.intent.handContextId?.replace(/#r\d+$/, '') ?? null;
      return snapshotHand === handContextId;
    }), []);

  const replaySettledIntents = useCallback((handContextId: string) => {
    const settled = Array.from(lifecycleByIdRef.current.values()).filter((snapshot) => {
      const snapshotHand = snapshot.intent.handContextId?.replace(/#r\d+$/, '') ?? null;
      return snapshot.state === 'settled' && snapshotHand === handContextId;
    });
    for (const snapshot of settled) {
      for (const subscriber of intentSubscribersRef.current) {
        try { subscriber(snapshot.intent); } catch { /* ignore */ }
      }
    }
    return settled.length;
  }, []);

  const reconcileMany = useCallback((intents: CardTransportIntent[]): CardManifestReconciliation => {
    let accepted = 0;
    let active = 0;
    let settled = 0;
    let dropped = 0;
    let conflicts = 0;

    for (const intent of intents) {
      if (!intent?.id) {
        conflicts += 1;
        continue;
      }
      const existing = lifecycleByIdRef.current.get(intent.id);
      if (existing) {
        const sameIdentity = isSameManifestIdentity(existing.intent, intent);
        if (!sameIdentity) {
          conflicts += 1;
        } else if (existing.state === 'settled') {
          settled += 1;
        } else if (existing.state === 'active') {
          active += 1;
        } else {
          dropped += 1;
        }
        continue;
      }
      if (acceptOne(intent)) {
        accepted += 1;
        active += 1;
      } else {
        conflicts += 1;
      }
    }

    return {
      total: intents.length,
      accepted,
      active,
      settled,
      dropped,
      conflicts,
      allOwned: intents.length > 0
        && active + settled === intents.length
        && dropped === 0
        && conflicts === 0,
    };
  }, [acceptOne]);

  const fireCallbacks = useCallback((intentId: string, cardId: string) => {
    const cb = onSettledMapRef.current.get(intentId);
    if (cb) {
      onSettledMapRef.current.delete(intentId);
      try { cb(cardId); } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[card-transport] onSettled threw', e);
      }
    }
    const intent = intentByIdRef.current.get(intentId);
    for (const sub of subscribersRef.current) {
      try { sub(cardId); } catch { /* ignore */ }
    }
    if (intent) {
      for (const sub of intentSubscribersRef.current) {
        try { sub(intent); } catch { /* ignore */ }
      }
    }
    // Exact lifecycle retention is Holm-only. Preserve the established
    // release behavior and memory profile for every other card game.
    if (gameType !== 'holm-game') intentByIdRef.current.delete(intentId);
  }, [gameType]);

  const markSettled = useCallback((intentId: string, cardId: string, source = 'flight_complete') => {
    const intent = intentByIdRef.current.get(intentId);
    const lifecycle = lifecycleByIdRef.current.get(intentId);
    if (!intent || lifecycle?.state === 'settled' || lifecycle?.state === 'dropped') return;
    recordCribbageCardTransportProvider('card_transport_markSettled_called', {
      gameId,
      gameType,
      intentId,
      cardId,
      source,
      intentFound: !!intent,
      handContextId: intent?.handContextId ?? null,
      recipientPlayerId: intent?.recipientPlayerId ?? null,
      priorActiveCount: activeIntentsRef.current.length,
      nextActiveCount: Math.max(0, activeIntentsRef.current.length - 1),
    }, { fn: 'markSettled', key: `markSettled:${intentId}:${source}` });
    ffRecord({
      writerId: 'CardTransportProvider.tsx:markSettled:L235',
      source: 'CARD_TRANSPORT',
      marker: 'CT_INTENT_SETTLED',
      identity: {
        gameId,
        ownerInstanceId: 'CardTransportProvider',
        segmentId: intent?.handContextId ?? null,
      },
      payload: {
        intentId,
        cardId,
        source,
        priorActiveCount: activeIntentsRef.current.length,
        nextActiveCount: Math.max(0, activeIntentsRef.current.length - 1),
        from: intent ? describeCardEndpoint(intent.from) : null,
        to: intent ? describeCardEndpoint(intent.to) : null,
        handContextId: intent?.handContextId ?? null,
      },
    });
    if (gameType === 'gin-rummy') {
      recordGinPhaseTrace({
        kind: 'card-transport-settle',
        summary: 'Gin card transport settled intent',
        sourceFile: 'src/lib/canonicalShell/cardTransport/CardTransportProvider.tsx',
        sourceFunction: 'CardTransportProvider.markSettled',
        identity: { gameId, handContextId: intent?.handContextId ?? null },
        detail: {
          intentId,
          cardId,
          source,
          from: intent ? describeCardEndpoint(intent.from) : null,
          to: intent ? describeCardEndpoint(intent.to) : null,
          recipientPlayerId: intent?.recipientPlayerId ?? null,
        },
      });
    }
    publishLifecycle({ intent, state: 'settled', settledSource: source });
    fireCallbacks(intentId, cardId);
    cardTransportDbgUpsert(intentId, {
      cardId,
      settled: true,
      markSettledAt: performance.now(),
      markSettledSource: source,
      lifecycleState: 'settled',
    });
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setActiveIntents((prev) => prev.filter((i) => i.id !== intentId));
        });
      });
    } else {
      setActiveIntents((prev) => prev.filter((i) => i.id !== intentId));
    }
  }, [fireCallbacks, gameId, gameType, publishLifecycle]);

  const markDropped = useCallback(
    (intent: CardTransportIntent, reason: string) => {
      const lifecycle = lifecycleByIdRef.current.get(intent.id);
      if (lifecycle?.state === 'settled' || lifecycle?.state === 'dropped') return;
      const now = performance.now();
      recordCribbageCardTransportProvider('card_transport_markDropped_called', {
        gameId,
        gameType,
        intentId: intent.id,
        cardId: intent.cardId,
        reason,
        handContextId: intent.handContextId ?? null,
        recipientPlayerId: intent.recipientPlayerId ?? null,
        from: describeCardEndpoint(intent.from),
        to: describeCardEndpoint(intent.to),
        priorActiveCount: activeIntentsRef.current.length,
        droppedAt: now,
      }, { fn: 'markDropped', key: `markDropped:${intent.id}:${reason}` });
      ffRecord({
        writerId: 'CardTransportProvider.tsx:markDropped:L278',
        source: 'CARD_TRANSPORT',
        marker: 'CT_INTENT_DROPPED',
        identity: {
          gameId,
          ownerInstanceId: 'CardTransportProvider',
          segmentId: intent.handContextId ?? null,
        },
        payload: {
          intentId: intent.id,
          cardId: intent.cardId,
          reason,
          from: describeCardEndpoint(intent.from),
          to: describeCardEndpoint(intent.to),
          handContextId: intent.handContextId ?? null,
          priorActiveCount: activeIntentsRef.current.length,
        },
      });
      setActiveIntents((prev) => prev.filter((i) => i.id !== intent.id));
      // eslint-disable-next-line no-console
      console.warn(
        `[card-transport] dropped id=${intent.id} cardId=${intent.cardId} ` +
          `from=${describeCardEndpoint(intent.from)} to=${describeCardEndpoint(intent.to)} ` +
          `reason=${reason}`,
      );
      cardTransportDbgUpsert(intent.id, {
        cardId: intent.cardId,
        droppedAt: now,
        droppedReason: reason,
        settled: true,
        markSettledAt: now,
        markSettledSource: 'dropped',
        lifecycleState: 'dropped',
      });
      publishLifecycle({ intent, state: 'dropped', droppedReason: reason });
      fireCallbacks(intent.id, intent.cardId);
    },
    [fireCallbacks, gameId, gameType, publishLifecycle],
  );

  const dropIntentsNotMatchingHand = useCallback(
    (handContextId: string, reason: string) => {
      const stale = activeIntentsRef.current.filter(
        (i) => (i.handContextId ?? null) !== handContextId,
      );
      ffRecord({
        writerId: 'CardTransportProvider.tsx:dropIntentsNotMatchingHand:L321',
        source: 'CARD_TRANSPORT',
        marker: 'CT_HAND_MISMATCH_SWEEP',
        identity: { gameId, ownerInstanceId: 'CardTransportProvider', segmentId: handContextId },
        payload: {
          reason,
          targetHandContextId: handContextId,
          priorActiveCount: activeIntentsRef.current.length,
          staleCount: stale.length,
          staleIds: stale.map((i) => i.id),
          staleHandContextIds: Array.from(new Set(stale.map((i) => i.handContextId ?? null))),
        },
      });
      let dropped = 0;
      for (const intent of stale) {
        markDropped(intent, reason);
        dropped += 1;
      }
      return dropped;
    },
    [markDropped, gameId],
  );


  const onCardSettled = useCallback((handler: (cardId: string) => void) => {
    subscribersRef.current.add(handler);
    return () => { subscribersRef.current.delete(handler); };
  }, []);

  const onCardSettledIntent = useCallback((handler: (intent: CardTransportIntent) => void) => {
    intentSubscribersRef.current.add(handler);
    return () => { intentSubscribersRef.current.delete(handler); };
  }, []);

  const value = useMemo<CardTransportContextValue>(
    () => ({
      dispatch,
      dispatchMany,
      reconcileMany,
      getIntentLifecycle,
      getHandIntentLifecycles,
      replaySettledIntents,
      onCardSettled,
      onCardSettledIntent,
      dropIntentsNotMatchingHand,
      __activeIntents: activeIntents,
      __lifecycleVersion: lifecycleVersion,
      __markSettled: markSettled,
      __markDropped: markDropped,
      gameId,
      gameType,
    }),
    [dispatch, dispatchMany, reconcileMany, getIntentLifecycle, getHandIntentLifecycles, replaySettledIntents, onCardSettled, onCardSettledIntent, dropIntentsNotMatchingHand, activeIntents, lifecycleVersion, markSettled, markDropped, gameId, gameType],
  );

  return (
    <CardTransportContext.Provider value={value}>
      {children}
    </CardTransportContext.Provider>
  );
}

export function useCardTransport(): Pick<
  CardTransportContextValue,
  'dispatch' | 'dispatchMany' | 'reconcileMany' | 'getIntentLifecycle' | 'getHandIntentLifecycles' | 'onCardSettled' | 'onCardSettledIntent'
> {
  const ctx = useContext(CardTransportContext);
  if (!ctx) {
    return {
      dispatch: () => false,
      dispatchMany: () => 0,
      reconcileMany: (intents) => ({
        total: intents.length,
        accepted: 0,
        active: 0,
        settled: 0,
        dropped: 0,
        conflicts: intents.length,
        allOwned: false,
      }),
      getIntentLifecycle: () => null,
      getHandIntentLifecycles: () => [],
      onCardSettled: () => () => {},
      onCardSettledIntent: () => () => {},
    };
  }
  return {
    dispatch: ctx.dispatch,
    dispatchMany: ctx.dispatchMany,
    reconcileMany: ctx.reconcileMany,
    getIntentLifecycle: ctx.getIntentLifecycle,
    getHandIntentLifecycles: ctx.getHandIntentLifecycles,
    onCardSettled: ctx.onCardSettled,
    onCardSettledIntent: ctx.onCardSettledIntent,
  };
}

export function useCardTransportInternal(): CardTransportContextValue | null {
  return useContext(CardTransportContext);
}
