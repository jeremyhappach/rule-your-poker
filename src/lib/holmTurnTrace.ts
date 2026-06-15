export type HolmTurnTraceActorKind = 'bot' | 'human';

export interface HolmTurnTraceActionEvent {
  gameId: string;
  timestamp: string;
  handNumber: number | null;
  roundId: string | null;
  dbCurrentTurnPosition: number | null;
  actualActingPlayerId: string;
  actualActingPlayerPosition: number;
  actorKind: HolmTurnTraceActorKind;
  actionTaken: 'stay' | 'fold';
  source: string;
}

export const HOLM_TURN_TRACE_ACTION_EVENT = 'holm-turn-trace-action';

export function emitHolmTurnTraceAction(detail: HolmTurnTraceActionEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<HolmTurnTraceActionEvent>(HOLM_TURN_TRACE_ACTION_EVENT, { detail }));
}
