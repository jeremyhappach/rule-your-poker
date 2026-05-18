/**
 * ChipTransportProvider — P8.1 shell-owned chip transport dispatch surface.
 *
 * Scope (infrastructure only — NO existing animator is migrated in P8.1):
 *   - Exposes a single `useChipTransport()` hook returning `dispatch()` /
 *     `dispatchMany()`.
 *   - Provides a queue of active intents to the shell-mounted
 *     `ChipTransportRuntime`, which renders flying chips inside the
 *     shell-owned overlay root (NOT document.body — see plan adjustment 1).
 *   - Dedupes on `intent.id`. Repeat dispatches of the same id while an
 *     intent is in-flight or already settled are dropped silently — this
 *     mirrors existing `triggerId` guards in legacy animators.
 *
 * Diagnostics (plan adjustment 2 — surface loudly):
 *   - `chip-transport-dispatched` on accepted intents.
 *   - `chip-transport-dropped` with reason='missing-endpoint' or
 *     reason='no-runtime' when an intent cannot be resolved. A missing
 *     endpoint during gameplay likely indicates a lifecycle bug; we do
 *     NOT silently swallow.
 *   - `chip-transport-settled` when the runtime marks an intent complete.
 *
 * Explicitly NOT in scope:
 *   lifecycle/sync changes, visual redesign, migration of any legacy
 *   animator, overlay consolidation.
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

interface ChipTransportContextValue {
  dispatch: (intent: ChipTransportIntent) => boolean;
  dispatchMany: (intents: ChipTransportIntent[]) => number;
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

  const acceptOne = useCallback(
    (intent: ChipTransportIntent): boolean => {
      if (!intent || !intent.id) return false;
      if (seenIdsRef.current.has(intent.id)) return false;
      seenIdsRef.current.add(intent.id);
      const enqueueSeq = ++seqRef.current;
      setActiveIntents((prev) => [...prev, { ...intent, enqueueSeq }]);
      recordShellEvent('chip-transport-dispatched', {
        gameId,
        gameType,
        detail: {
          intentId: intent.id,
          reason: intent.reason,
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
    (intent: ChipTransportIntent) => acceptOne(intent),
    [acceptOne],
  );

  const dispatchMany = useCallback(
    (intents: ChipTransportIntent[]) => {
      let accepted = 0;
      for (const i of intents) {
        if (acceptOne(i)) accepted += 1;
      }
      return accepted;
    },
    [acceptOne],
  );

  const markSettled = useCallback(
    (intentId: string, durationMs: number) => {
      setActiveIntents((prev) => prev.filter((i) => i.id !== intentId));
      recordShellEvent('chip-transport-settled', {
        gameId,
        gameType,
        detail: { intentId, durationMs },
      });
    },
    [gameId, gameType],
  );

  const markDropped = useCallback(
    (intent: ChipTransportIntent, reason: 'missing-endpoint' | 'no-runtime') => {
      setActiveIntents((prev) => prev.filter((i) => i.id !== intent.id));
      // Loud diagnostic — a drop during gameplay is suspicious.
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
    },
    [gameId, gameType],
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
 * this hook. Returns no-op functions when called outside the provider so
 * that pre-migration consumers don't crash if accidentally wired.
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

/** Internal hook used only by ChipTransportRuntime. */
export function useChipTransportInternal(): ChipTransportContextValue | null {
  return useContext(ChipTransportContext);
}
