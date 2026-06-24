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

interface CardTransportContextValue {
  dispatch: (intent: CardTransportIntent, opts?: CardDispatchOptions) => boolean;
  dispatchMany: (intents: CardTransportIntent[], opts?: CardDispatchManyOptions) => number;
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
  const seqRef = useRef(0);
  const onSettledMapRef = useRef<Map<string, (cardId: string) => void>>(new Map());
  const subscribersRef = useRef<Set<(cardId: string) => void>>(new Set());
  const intentSubscribersRef = useRef<Set<(intent: CardTransportIntent) => void>>(new Set());

  const acceptOne = useCallback(
    (intent: CardTransportIntent, opts?: CardDispatchOptions): boolean => {
      if (!intent || !intent.id) {
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
      setActiveIntents((prev) => [
        ...prev,
        { ...intent, enqueueSeq, enqueuedAt: now },
      ]);
      return true;
    },
    [gameId],
  );

  const dispatch = useCallback(
    (intent: CardTransportIntent, opts?: CardDispatchOptions) => acceptOne(intent, opts),
    [acceptOne],
  );

  const dispatchMany = useCallback(
    (intents: CardTransportIntent[], opts?: CardDispatchManyOptions) => {
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
      return accepted;
    },
    [acceptOne, gameId],
  );

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
    intentByIdRef.current.delete(intentId);
  }, []);

  const markSettled = useCallback((intentId: string, cardId: string, source = 'flight_complete') => {
    const intent = intentByIdRef.current.get(intentId);
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
  }, [fireCallbacks, gameId]);

  const markDropped = useCallback(
    (intent: CardTransportIntent, reason: string) => {
      const now = performance.now();
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
      fireCallbacks(intent.id, intent.cardId);
    },
    [fireCallbacks, gameId],
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
      onCardSettled,
      onCardSettledIntent,
      dropIntentsNotMatchingHand,
      __activeIntents: activeIntents,
      __markSettled: markSettled,
      __markDropped: markDropped,
      gameId,
      gameType,
    }),
    [dispatch, dispatchMany, onCardSettled, onCardSettledIntent, dropIntentsNotMatchingHand, activeIntents, markSettled, markDropped, gameId, gameType],
  );

  return (
    <CardTransportContext.Provider value={value}>
      {children}
    </CardTransportContext.Provider>
  );
}

export function useCardTransport(): Pick<
  CardTransportContextValue,
  'dispatch' | 'dispatchMany' | 'onCardSettled' | 'onCardSettledIntent'
> {
  const ctx = useContext(CardTransportContext);
  if (!ctx) {
    return {
      dispatch: () => false,
      dispatchMany: () => 0,
      onCardSettled: () => () => {},
      onCardSettledIntent: () => () => {},
    };
  }
  return {
    dispatch: ctx.dispatch,
    dispatchMany: ctx.dispatchMany,
    onCardSettled: ctx.onCardSettled,
    onCardSettledIntent: ctx.onCardSettledIntent,
  };
}

export function useCardTransportInternal(): CardTransportContextValue | null {
  return useContext(CardTransportContext);
}
