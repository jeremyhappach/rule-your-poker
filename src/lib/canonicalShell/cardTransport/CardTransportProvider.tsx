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
  __activeIntents: ActiveCardIntent[];
  __markSettled: (intentId: string, cardId: string) => void;
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
  const seenRef = useRef<Set<string>>(new Set());
  const seqRef = useRef(0);
  const onSettledMapRef = useRef<Map<string, (cardId: string) => void>>(new Map());
  const subscribersRef = useRef<Set<(cardId: string) => void>>(new Set());

  const acceptOne = useCallback(
    (intent: CardTransportIntent, opts?: CardDispatchOptions): boolean => {
      if (!intent || !intent.id) return false;
      if (seenRef.current.has(intent.id)) return false;
      seenRef.current.add(intent.id);
      const enqueueSeq = ++seqRef.current;
      if (opts?.onSettled) onSettledMapRef.current.set(intent.id, opts.onSettled);
      setActiveIntents((prev) => [
        ...prev,
        { ...intent, enqueueSeq, enqueuedAt: performance.now() },
      ]);
      return true;
    },
    [],
  );

  const dispatch = useCallback(
    (intent: CardTransportIntent, opts?: CardDispatchOptions) => acceptOne(intent, opts),
    [acceptOne],
  );

  const dispatchMany = useCallback(
    (intents: CardTransportIntent[], opts?: CardDispatchManyOptions) => {
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
      return accepted;
    },
    [acceptOne],
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
    for (const sub of subscribersRef.current) {
      try { sub(cardId); } catch { /* ignore */ }
    }
  }, []);

  const markSettled = useCallback((intentId: string, cardId: string) => {
    setActiveIntents((prev) => prev.filter((i) => i.id !== intentId));
    fireCallbacks(intentId, cardId);
  }, [fireCallbacks]);

  const markDropped = useCallback(
    (intent: CardTransportIntent, reason: string) => {
      setActiveIntents((prev) => prev.filter((i) => i.id !== intent.id));
      // eslint-disable-next-line no-console
      console.warn(
        `[card-transport] dropped id=${intent.id} cardId=${intent.cardId} ` +
          `from=${describeCardEndpoint(intent.from)} to=${describeCardEndpoint(intent.to)} ` +
          `reason=${reason}`,
      );
      // Honor settle waiters so deal phase never hangs.
      fireCallbacks(intent.id, intent.cardId);
    },
    [fireCallbacks],
  );

  const onCardSettled = useCallback((handler: (cardId: string) => void) => {
    subscribersRef.current.add(handler);
    return () => { subscribersRef.current.delete(handler); };
  }, []);

  const value = useMemo<CardTransportContextValue>(
    () => ({
      dispatch,
      dispatchMany,
      onCardSettled,
      __activeIntents: activeIntents,
      __markSettled: markSettled,
      __markDropped: markDropped,
      gameId,
      gameType,
    }),
    [dispatch, dispatchMany, onCardSettled, activeIntents, markSettled, markDropped, gameId, gameType],
  );

  return (
    <CardTransportContext.Provider value={value}>
      {children}
    </CardTransportContext.Provider>
  );
}

export function useCardTransport(): Pick<
  CardTransportContextValue,
  'dispatch' | 'dispatchMany' | 'onCardSettled'
> {
  const ctx = useContext(CardTransportContext);
  if (!ctx) {
    return {
      dispatch: () => false,
      dispatchMany: () => 0,
      onCardSettled: () => () => {},
    };
  }
  return { dispatch: ctx.dispatch, dispatchMany: ctx.dispatchMany, onCardSettled: ctx.onCardSettled };
}

export function useCardTransportInternal(): CardTransportContextValue | null {
  return useContext(CardTransportContext);
}
