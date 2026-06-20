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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ChipTransportIntent } from './GameplaySlotContract';
import { recordShellEvent } from './diagnostics';
import { describeEndpoint } from './chipEndpoints';

export interface ActiveChipIntent extends ChipTransportIntent {
  /** Monotonic enqueue counter for stable React keys. */
  enqueueSeq: number;
}

export interface DispatchOptions {
  /** Fires when this specific intent settles (or is dropped). */
  onSettled?: () => void;
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
  /** Runtime-internal: signal that an intent could not be resolved. */
  __markDropped: (
    intent: ChipTransportIntent,
    reason: 'missing-endpoint' | 'no-runtime',
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
  // Per-intent settlement callbacks.
  const onSettledMapRef = useRef<Map<string, () => void>>(new Map());

  const acceptOne = useCallback(
    (intent: ChipTransportIntent, opts?: DispatchOptions): boolean => {
      if (!intent || !intent.id) return false;
      if (seenIdsRef.current.has(intent.id)) return false;
      seenIdsRef.current.add(intent.id);
      const enqueueSeq = ++seqRef.current;
      if (opts?.onSettled) {
        onSettledMapRef.current.set(intent.id, opts.onSettled);
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

  const fireOnSettled = useCallback((intentId: string) => {
    const cb = onSettledMapRef.current.get(intentId);
    if (cb) {
      onSettledMapRef.current.delete(intentId);
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[canonical-shell] chip-transport onSettled threw', e);
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
      fireOnSettled(intentId);
    },
    [gameId, gameType, fireOnSettled],
  );

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
      // Honor onSettled for dropped intents so lifecycle waiters don't hang.
      fireOnSettled(intent.id);
    },
    [gameId, gameType, fireOnSettled],
  );

  const value = useMemo<ChipTransportContextValue>(
    () => ({
      dispatch,
      dispatchMany,
      __activeIntents: activeIntents,
      __markSettled: markSettled,
      __markDropped: markDropped,
      gameId,
      gameType,
    }),
    [dispatch, dispatchMany, activeIntents, markSettled, markDropped, gameId, gameType],
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
