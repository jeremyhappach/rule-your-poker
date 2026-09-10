import { useCallback, useReducer, useRef } from 'react';
import type { LiveTerminalPresentationScope } from './liveTerminalPresentationHold';

export type LocalTerminalState<T> = {
  sessionId: string | null;
  observed: LiveTerminalPresentationScope | null;
  pending: { scope: LiveTerminalPresentationScope; snapshot: T } | null;
};
export type LocalTerminalObservation<T> = {
  sessionId: string | null;
  scope: LiveTerminalPresentationScope | null;
  live: boolean;
  terminal: boolean;
  snapshot: T | null;
};
const sameScope = (a: LiveTerminalPresentationScope | null, b: LiveTerminalPresentationScope | null) =>
  !!a && !!b && a.gameId === b.gameId && a.gameType === b.gameType
  && a.dealerGameId === b.dealerGameId && a.roundId === b.roundId && a.handNumber === b.handNumber;

/** A presentation snapshot only. Authority and other clients keep advancing. */
export function observeLocalTerminal<T>(previous: LocalTerminalState<T>, input: LocalTerminalObservation<T>): LocalTerminalState<T> {
  const state = previous.sessionId === input.sessionId ? previous
    : { sessionId: input.sessionId, observed: null, pending: null };
  if (state.pending) return state;
  if (input.terminal && input.snapshot && sameScope(state.observed, input.scope)) {
    return { ...state, pending: { scope: input.scope!, snapshot: input.snapshot } };
  }
  if (input.live && input.scope) return { ...state, observed: input.scope };
  return state;
}

/** A stale callback cannot release another round's retained presentation. */
export function localTerminalTokenMatches(scope: LiveTerminalPresentationScope, token: string): boolean {
  const [gameType, phase, gameId, dealerGameId, handNumber, , roundId] = token.split('|');
  return gameType === scope.gameType && phase === 'winseq' && gameId === scope.gameId
    && dealerGameId === scope.dealerGameId && handNumber === String(scope.handNumber) && roundId === scope.roundId;
}

export function useLocalTerminalPresentation<T>(input: LocalTerminalObservation<T>) {
  const state = useRef<LocalTerminalState<T>>({ sessionId: input.sessionId, observed: null, pending: null });
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  state.current = observeLocalTerminal(state.current, input);
  const complete = useCallback((token: string) => {
    const pending = state.current.pending;
    if (!pending || !localTerminalTokenMatches(pending.scope, token)) return null;
    state.current = { ...state.current, observed: null, pending: null };
    redraw();
    return pending.scope;
  }, []);
  return { pending: state.current.pending, complete };
}
