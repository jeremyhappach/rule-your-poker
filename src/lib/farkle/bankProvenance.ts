import { supabase } from '@/integrations/supabase/client';
import type { FarkleActionRequest } from './authority';
import type { FarkleState } from './types';

declare const __APP_BUILD_SHA__: string;

/** Untrusted diagnostics only: never sent to or consumed by the rule reducer. */
export interface FarkleBankInput {
  eventType: string;
  clientTimestamp: string;
  eventTimestamp: number;
  sequence: number;
  rollNumber: number;
  scoringCycle: number;
  pointerType: string | null;
  key: string | null;
  repeatedKey: boolean;
}

export interface FarkleBankActivation {
  source: 'bank_button';
  clientTimestamp: string;
  eventType: string;
  trusted: boolean;
  webdriver: boolean;
  clickDetail: number;
  pointerType: string | null;
  key: string | null;
  visible: boolean;
  enabled: boolean;
  focused: boolean;
  eventTimestamp: number;
  previousClickTimestamp: number | null;
  input: FarkleBankInput | null;
}

/** One best-effort row per logical Bank request; transport retries keep its ID. */
export function recordFarkleBankIntent(request: FarkleActionRequest, state: FarkleState, activation?: FarkleBankActivation): void {
  if (request.action !== 'bank') return;
  try {
    void Promise.resolve(supabase.from('debug_events').insert({
      game_id: request.scope.gameId,
      round_id: request.scope.roundId,
      event_type: 'farkle_bank_intent',
      client_role: 'actor',
      payload: {
        diagnosticOnly: true,
        buildSha: typeof __APP_BUILD_SHA__ === 'string' ? __APP_BUILD_SHA__ : null,
        requestId: request.requestId,
        dealerGameId: request.scope.dealerGameId,
        playerId: request.playerId,
        handNumber: request.scope.handNumber,
        expectedSequence: request.expectedSequence,
        stage: state.stage,
        gamePhase: state.gamePhase,
        rollNumber: state.rollNumber,
        scoringCycle: state.scoringCycle,
        completedTurns: state.playerStates[request.playerId]?.completedTurns ?? null,
        finalQueue: state.finalQueue,
        thisTurn: state.thisTurn,
        availableDice: state.available.length,
        activation: activation ? { ...activation, input: activation.input ? { ...activation.input } : null }
          : { source: 'unattributed', clientTimestamp: new Date().toISOString() },
      },
    })).catch(() => { /* Diagnostics must never interrupt gameplay. */ });
  } catch { /* Diagnostics must never interrupt gameplay. */ }
}
