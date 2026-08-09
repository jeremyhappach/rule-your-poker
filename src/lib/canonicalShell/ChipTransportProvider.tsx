/**
 * ChipTransportProvider — P8.1 shell-owned chip transport dispatch surface.
 *
 * Wave 3B additions:
 *   - dispatch() / dispatchMany() accept an optional `onSettled` /
 *     `onAllSettled` callback so games can advance lifecycle off
 *     transport completion without re-implementing geometry.
 *   - useChipTransportSuppressedSeats() exposes the set of seat
 *     positions currently referenced as an intent `from`-endpoint, so
 *     CanonicalSeatCluster can hide the static chip while a fly is in
 *     flight. Shell-owned suppression replaces the legacy game-side
 *     `hideChipBubble` pattern.
 *
 * Diagnostics: `chip-transport-dispatched`, `chip-transport-dropped`,
 * `chip-transport-settled` events are emitted via `recordShellEvent`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ChipTransportIntent } from './GameplaySlotContract';
import { recordShellEvent } from './diagnostics';
import { describeEndpoint } from './chipEndpoints';
import {
  useChipPresentationLedger,
  type ChipPresentationAdmission,
  type ChipPresentationBatch,
  type ChipPresentationBatchSettled,
  type LedgerDispatchOptions,
} from './ChipPresentationLedger';

export interface ActiveChipIntent extends ChipTransportIntent {
  /** Monotonic enqueue counter for stable React keys. */
  enqueueSeq: number;
}

export interface DispatchOptions {
  /** Fires when this specific intent settles (or is dropped). */
  onSettled?: () => void;
  /** Shell runtime lifecycle hooks. Used by the database-owned ledger only. */
  onDeparted?: () => void;
  onArrived?: () => void;
  onDropped?: () => void;
}

export interface DispatchManyOptions {
  /** Fires after every dispatched intent has settled or been dropped. */
  onAllSettled?: () => void;
  /** Fires per-intent. */
  onSettled?: (intentId: string) => void;
}

interface ChipTransportContextValue {
  dispatch: (intent: ChipTransportIntent, opts?: DispatchOptions) => boolean;
  dispatchMany: (intents: ChipTransportIntent[], opts?: DispatchManyOptions) => number;
  /** Runtime-internal: consumed by ChipTransportRuntime. */
  __activeIntents: ActiveChipIntent[];
  /** Runtime-internal: signal that an intent has finished animating. */
  __markSettled: (intentId: string, durationMs: number) => void;
  /** Runtime-internal: source has visibly released the chip. */
  __markDeparted: (intentId: string) => void;
  /** Runtime-internal: chip has visibly landed at its destination. */
  __markArrived: (intentId: string) => void;
  /** Runtime-internal: signal that an intent could not be resolved. */
  __markDropped: (
    intent: ChipTransportIntent,
    reason: 'missing-endpoint' | 'no-runtime',
  ) => void;
  /** Runtime-internal: abandon a presentation that lost its endpoint. */
  __cancel: (intentId: string) => void;
  /** Sole presentation owner for a player endpoint while its batch is active. */
  presentationPlayerBalance: (playerId: string | null | undefined, fallback: number) => number;
  /** Sole presentation owner for the pot endpoint while its batch is active. */
  presentationPotBalance: (fallback: number) => number;
  /** Runtime registration for a game presentation prerequisite. */
  __setPresentationAdmission: (
    admission: ChipPresentationAdmission | null,
    onBatchSettled?: ChipPresentationBatchSettled | null,
  ) => void;
  /** Diagnostics scoping. */
  gameId?: string | null;
  gameType?: string | null;
}

const ChipTransportContext = createContext<ChipTransportContextValue | null>(null);

export interface ChipTransportProviderProps {
  gameId?: string | null;
  gameType?: string | null;
  children: ReactNode;
}

export function ChipTransportProvider({
  gameId = null,
  gameType = null,
  children,
}: ChipTransportProviderProps) {
  const [activeIntents, setActiveIntents] = useState<ActiveChipIntent[]>([]);
  // Track every id we've ever accepted (active + settled) for dedupe.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seqRef = useRef(0);
  const lifecycleSignalsRef = useRef<Set<string>>(new Set());
  // A game may gate a committed transfer on a prior *visual* phase. This is
  // presentation-only: queued batches still retain the ledger's opening
  // balances and all authoritative financial state is already committed.
  const presentationAdmissionRef = useRef<ChipPresentationAdmission | null>(null);
  const [presentationAdmissionVersion, setPresentationAdmissionVersion] = useState(0);
  // Per-intent runtime callbacks.  The presentation ledger consumes the
  // departure/arrival boundaries; ordinary game callers continue to use only
  // onSettled through the public dispatch API.
  const callbacksRef = useRef<Map<string, DispatchOptions>>(new Map());

  const acceptOne = useCallback(
    (intent: ChipTransportIntent, opts?: DispatchOptions): boolean => {
      if (!intent || !intent.id) return false;
      if (seenIdsRef.current.has(intent.id)) return false;
      seenIdsRef.current.add(intent.id);
      const enqueueSeq = ++seqRef.current;
      if (opts) {
        callbacksRef.current.set(intent.id, opts);
      }
      setActiveIntents((prev) => [...prev, { ...intent, enqueueSeq }]);
      recordShellEvent('chip-transport-dispatched', {
        gameId,
        gameType,
        detail: {
          intentId: intent.id,
          reason: intent.reason,
          variant: intent.variant ?? 'default',
          amount: intent.amount,
          from: describeEndpoint(intent.from),
          to: describeEndpoint(intent.to),
        },
      });
      return true;
    },
    [gameId, gameType],
  );

  const dispatch = useCallback(
    (intent: ChipTransportIntent, opts?: DispatchOptions) => acceptOne(intent, opts),
    [acceptOne],
  );

  const dispatchMany = useCallback(
    (intents: ChipTransportIntent[], opts?: DispatchManyOptions) => {
      let accepted = 0;
      const expected = intents.length;
      let settledCount = 0;
      const perIntentSettled = (id: string) => {
        opts?.onSettled?.(id);
        settledCount += 1;
        if (settledCount >= expected) {
          opts?.onAllSettled?.();
        }
      };
      for (const i of intents) {
        if (acceptOne(i, { onSettled: () => perIntentSettled(i.id) })) {
          accepted += 1;
        } else {
          // Already-seen dedupe still counts toward completion so
          // onAllSettled fires deterministically.
          perIntentSettled(i.id);
        }
      }
      return accepted;
    },
    [acceptOne],
  );

  const fireCallback = useCallback((intentId: string, kind: keyof LedgerDispatchOptions) => {
    const callbacks = callbacksRef.current.get(intentId);
    const cb = callbacks?.[kind];
    if (cb) {
      if (kind === 'onSettled') {
        callbacksRef.current.delete(intentId);
      }
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[canonical-shell] chip-transport ${kind} threw`, e);
      }
    }
  }, []);

  const markSettled = useCallback(
    (intentId: string, durationMs: number) => {
      setActiveIntents((prev) => prev.filter((i) => i.id !== intentId));
      recordShellEvent('chip-transport-settled', {
        gameId,
        gameType,
        detail: { intentId, durationMs },
      });
      fireCallback(intentId, 'onSettled');
    },
    [gameId, gameType, fireCallback],
  );

  const markDeparted = useCallback((intentId: string) => {
    const signal = `${intentId}:departed`;
    if (lifecycleSignalsRef.current.has(signal)) return;
    lifecycleSignalsRef.current.add(signal);
    fireCallback(intentId, 'onDeparted');
  }, [fireCallback]);

  const markArrived = useCallback((intentId: string) => {
    const signal = `${intentId}:arrived`;
    if (lifecycleSignalsRef.current.has(signal)) return;
    lifecycleSignalsRef.current.add(signal);
    fireCallback(intentId, 'onArrived');
  }, [fireCallback]);

  const markDropped = useCallback(
    (intent: ChipTransportIntent, reason: 'missing-endpoint' | 'no-runtime') => {
      setActiveIntents((prev) => prev.filter((i) => i.id !== intent.id));
      // eslint-disable-next-line no-console
      console.warn(
        `[canonical-shell] chip-transport-dropped reason=${reason} ` +
          `id=${intent.id} from=${describeEndpoint(intent.from)} ` +
          `to=${describeEndpoint(intent.to)} reason_tag=${intent.reason}`,
      );
      recordShellEvent('chip-transport-dropped', {
        gameId,
        gameType,
        detail: {
          intentId: intent.id,
          reason,
          intentReason: intent.reason,
          from: describeEndpoint(intent.from),
          to: describeEndpoint(intent.to),
        },
      });
      fireCallback(intent.id, 'onDropped');
      // Honor onSettled for dropped intents so legacy lifecycle waiters don't hang.
      fireCallback(intent.id, 'onSettled');
    },
    [gameId, gameType, fireCallback],
  );

  const cancel = useCallback((intentId: string) => {
    setActiveIntents((prev) => prev.filter((intent) => intent.id !== intentId));
    callbacksRef.current.delete(intentId);
  }, []);

  const ledgerTransport = useMemo(() => ({ dispatch, cancel }), [dispatch, cancel]);
  const canStartPresentationBatch = useCallback((batch: ChipPresentationBatch) => (
    presentationAdmissionRef.current?.(batch) ?? true
  ), []);
  const presentationBatchSettledRef = useRef<ChipPresentationBatchSettled | null>(null);
  const onPresentationBatchSettled = useCallback((batch: ChipPresentationBatch) => {
    presentationBatchSettledRef.current?.(batch);
  }, []);
  const setPresentationAdmission = useCallback((
    admission: ChipPresentationAdmission | null,
    onBatchSettled: ChipPresentationBatchSettled | null = null,
  ) => {
    if (
      presentationAdmissionRef.current === admission &&
      presentationBatchSettledRef.current === onBatchSettled
    ) return;
    presentationAdmissionRef.current = admission;
    presentationBatchSettledRef.current = onBatchSettled;
    setPresentationAdmissionVersion((version) => version + 1);
  }, []);
  const presentationLedger = useChipPresentationLedger(
    gameId,
    ledgerTransport,
    canStartPresentationBatch,
    presentationAdmissionVersion,
    onPresentationBatchSettled,
  );

  const value = useMemo<ChipTransportContextValue>(
    () => ({
      dispatch,
      dispatchMany,
      __activeIntents: activeIntents,
      __markSettled: markSettled,
      __markDeparted: markDeparted,
      __markArrived: markArrived,
      __markDropped: markDropped,
      __cancel: cancel,
      presentationPlayerBalance: presentationLedger.playerBalance,
      presentationPotBalance: presentationLedger.potBalance,
      __setPresentationAdmission: setPresentationAdmission,
      gameId,
      gameType,
    }),
    [dispatch, dispatchMany, activeIntents, markSettled, markDeparted, markArrived, markDropped, cancel, presentationLedger, setPresentationAdmission, gameId, gameType],
  );

  return (
    <ChipTransportContext.Provider value={value}>
      {children}
    </ChipTransportContext.Provider>
  );
}

/**
 * Public hook: gameplay surfaces dispatch chip transport intents through
 * this hook.
 */
export function useChipTransport(): Pick<
  ChipTransportContextValue,
  'dispatch' | 'dispatchMany'
> {
  const ctx = useContext(ChipTransportContext);
  if (!ctx) {
    return {
      dispatch: () => false,
      dispatchMany: () => 0,
    };
  }
  return { dispatch: ctx.dispatch, dispatchMany: ctx.dispatchMany };
}

/**
 * Raw database balances are passed only as a fallback.  Once the matching
 * database transfer cursor is observed, this returns the ledger-owned value
 * until departure/arrival/reconciliation completes.
 */
export function usePresentationPlayerChipBalance(
  playerId: string | null | undefined,
  rawBalance: number,
): number {
  const ctx = useContext(ChipTransportContext);
  return ctx?.presentationPlayerBalance(playerId, rawBalance) ?? rawBalance;
}

/** See usePresentationPlayerChipBalance for the ownership contract. */
export function usePresentationPotChipBalance(rawBalance: number): number {
  const ctx = useContext(ChipTransportContext);
  return ctx?.presentationPotBalance(rawBalance) ?? rawBalance;
}

/**
 * Registers the current game's prerequisite for launching a committed chip
 * batch.  The transport owns queueing and balances; games provide only a
 * presentation-readiness predicate derived from their canonical stage.
 */
export function useChipTransferPresentationAdmission(
  admission: ChipPresentationAdmission,
  onBatchSettled?: ChipPresentationBatchSettled,
): void {
  const ctx = useContext(ChipTransportContext);
  const setAdmission = ctx?.__setPresentationAdmission;

  useLayoutEffect(() => {
    if (!setAdmission) return;
    setAdmission(admission, onBatchSettled ?? null);
    return () => setAdmission(null, null);
  }, [admission, onBatchSettled, setAdmission]);
}

/**
 * Shell-owned chip suppression hook (Wave 3B).
 *
 * Returns the set of seat positions currently referenced as a `from`
 * endpoint of an active intent. Consumers (CanonicalSeatCluster) hide
 * the static chip disc while the position is in the set so the fly
 * chip is the sole visible disc at that seat.
 *
 * `to` endpoints are intentionally NOT suppressed — the winner's
 * static disc stays visible throughout the transfer.
 */
export function useChipTransportSuppressedSeats(): Set<number> {
  const ctx = useContext(ChipTransportContext);
  return useMemo(() => {
    const set = new Set<number>();
    if (!ctx) return set;
    for (const intent of ctx.__activeIntents) {
      if (intent.from.kind === 'seat') set.add(intent.from.position);
    }
    return set;
  }, [ctx?.__activeIntents]);
}

/** Internal hook used only by ChipTransportRuntime. */
export function useChipTransportInternal(): ChipTransportContextValue | null {
  return useContext(ChipTransportContext);
}
