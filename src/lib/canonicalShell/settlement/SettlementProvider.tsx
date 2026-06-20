/**
 * SettlementProvider — shell-owned canonical settlement state.
 *
 * STATE-ONLY contract (per Wave 1 architecture):
 *   - Provider owns: phase, activeIntent, economySettled,
 *     celebrationComplete, barrier.
 *   - Consumers observe state. There is no onComplete callback. There
 *     is no event registration. PlayfieldSlotController (W2+) will
 *     observe phase === 'SETTLEMENT_COMPLETE' and advance normally.
 *
 * Transitions are driven by SettlementRuntime (a sibling component
 * that consumes this context and dispatches economy / celebration).
 * The provider exposes the setters used by the runtime; games only
 * call submit() and reset().
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { SettlementIntent, SettlementPhase } from './types';
import { recordSettlementDbg } from './settlementDbg';

interface SettlementState {
  phase: SettlementPhase;
  activeIntent: SettlementIntent | null;
  economySettled: boolean;
  celebrationComplete: boolean;
}

type Action =
  | { type: 'submit'; intent: SettlementIntent }
  | { type: 'phase'; phase: SettlementPhase; caller: string }
  | { type: 'flag'; flag: 'economySettled' | 'celebrationComplete'; value: boolean; caller: string }
  | { type: 'reset'; caller: string };

const INITIAL: SettlementState = {
  phase: 'IDLE',
  activeIntent: null,
  economySettled: false,
  celebrationComplete: false,
};

function reducer(s: SettlementState, a: Action): SettlementState {
  switch (a.type) {
    case 'submit': {
      const startPhase: SettlementPhase = a.intent.prelude ? 'PRELUDE' : 'SETTLEMENT';
      recordSettlementDbg({
        kind: 'submit',
        caller: 'SettlementProvider.submit',
        intent: a.intent,
      });
      recordSettlementDbg({
        kind: 'phase',
        caller: 'SettlementProvider.submit',
        fromPhase: s.phase,
        toPhase: startPhase,
      });
      return {
        phase: startPhase,
        activeIntent: a.intent,
        economySettled: false,
        celebrationComplete: false,
      };
    }
    case 'phase': {
      if (s.phase === a.phase) return s;
      recordSettlementDbg({
        kind: 'phase',
        caller: a.caller,
        fromPhase: s.phase,
        toPhase: a.phase,
      });
      return { ...s, phase: a.phase };
    }
    case 'flag': {
      if (s[a.flag] === a.value) return s;
      recordSettlementDbg({
        kind: 'flag',
        caller: a.caller,
        flag: a.flag,
        value: a.value,
      });
      const next = { ...s, [a.flag]: a.value };
      // Barrier: both flags true while SETTLEMENT → SETTLEMENT_COMPLETE.
      if (
        next.phase === 'SETTLEMENT' &&
        next.economySettled &&
        next.celebrationComplete
      ) {
        recordSettlementDbg({
          kind: 'phase',
          caller: 'SettlementProvider.barrier',
          fromPhase: 'SETTLEMENT',
          toPhase: 'SETTLEMENT_COMPLETE',
        });
        return { ...next, phase: 'SETTLEMENT_COMPLETE' };
      }
      return next;
    }
    case 'reset': {
      if (s.phase === 'IDLE' && s.activeIntent === null) return s;
      recordSettlementDbg({
        kind: 'phase',
        caller: a.caller,
        fromPhase: s.phase,
        toPhase: 'IDLE',
      });
      return INITIAL;
    }
    default:
      return s;
  }
}

interface SettlementContextValue extends SettlementState {
  submit: (intent: SettlementIntent) => void;
  reset: (caller?: string) => void;
  /** Runtime-internal: phase setter. */
  __setPhase: (phase: SettlementPhase, caller: string) => void;
  /** Runtime-internal: flag setter. */
  __setFlag: (
    flag: 'economySettled' | 'celebrationComplete',
    value: boolean,
    caller: string,
  ) => void;
}

const SettlementContext = createContext<SettlementContextValue | null>(null);

export function SettlementProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const submit = useCallback((intent: SettlementIntent) => {
    dispatch({ type: 'submit', intent });
  }, []);
  const reset = useCallback((caller: string = 'external') => {
    dispatch({ type: 'reset', caller });
  }, []);
  const __setPhase = useCallback((phase: SettlementPhase, caller: string) => {
    dispatch({ type: 'phase', phase, caller });
  }, []);
  const __setFlag = useCallback(
    (flag: 'economySettled' | 'celebrationComplete', value: boolean, caller: string) => {
      dispatch({ type: 'flag', flag, value, caller });
    },
    [],
  );

  const value = useMemo<SettlementContextValue>(
    () => ({ ...state, submit, reset, __setPhase, __setFlag }),
    [state, submit, reset, __setPhase, __setFlag],
  );

  return (
    <SettlementContext.Provider value={value}>
      {children}
    </SettlementContext.Provider>
  );
}

/**
 * Public hook — games submit() or read phase to observe the barrier.
 * Returns a stable null-shaped value when no provider is mounted so
 * games can be written defensively during the W1→W2 transition.
 */
export function useSettlement(): SettlementContextValue {
  const ctx = useContext(SettlementContext);
  if (ctx) return ctx;
  return {
    phase: 'IDLE',
    activeIntent: null,
    economySettled: false,
    celebrationComplete: false,
    submit: () => {},
    reset: () => {},
    __setPhase: () => {},
    __setFlag: () => {},
  };
}

/** Read-only helper for observers (PlayfieldSlotController, debug). */
export function useSettlementPhase(): SettlementPhase {
  return useSettlement().phase;
}
