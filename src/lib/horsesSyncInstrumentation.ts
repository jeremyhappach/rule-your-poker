/**
 * Horses sync framework instrumentation — persisted debug events.
 *
 * Events:
 *   horses-progress-vector     — logged on every accepted/rejected update
 *   horses-presentation-source — logged when presentation state changes source
 *   horses-regression-blocked  — logged when a regressive snapshot is rejected
 */

import { supabase } from '@/integrations/supabase/client';
import type { ProgressVector, AuthoritativeUpdateResult } from './gameStateSync/types';
import type { HorsesStateFromDB } from '@/hooks/useHorsesMobileController';

// Fingerprint-based dedup: only persist when the signature changes
let _lastProgressFingerprint = '';
let _lastPresentationFingerprint = '';

function compactState(state: HorsesStateFromDB | null): Record<string, unknown> {
  if (!state) return { state: null };
  const ps = state.playerStates ?? {};
  const completedCount = Object.values(ps).filter(s => s?.isComplete).length;
  const totalPlayers = Object.keys(ps).length;
  return {
    phase: state.gamePhase,
    turn: state.currentTurnPlayerId?.slice(0, 8) ?? null,
    completed: `${completedCount}/${totalPlayers}`,
    turnOrderLen: state.turnOrder?.length ?? 0,
  };
}

export function persistHorsesProgressVector(
  gameId: string,
  gameType: string,
  handNumber: number,
  roundId: string | null,
  result: AuthoritativeUpdateResult,
  incomingState: HorsesStateFromDB | null,
): void {
  const fingerprint = `${result.reason}|${JSON.stringify(result.incomingProgress)}`;
  if (fingerprint === _lastProgressFingerprint) return;
  _lastProgressFingerprint = fingerprint;

  const severity = result.reason === 'regressive' ? 'warning' : 'info';
  const eventName = result.reason === 'regressive'
    ? 'horses-regression-blocked'
    : 'horses-progress-vector';

  supabase.from('debug_sync_events').insert({
    game_id: gameId,
    game_type: gameType,
    hand_number: handNumber,
    round_id: roundId,
    event_type: 'sync-gate',
    severity,
    event_name: eventName,
    payload: {
      accepted: result.accepted,
      reason: result.reason,
      comparison: result.comparison,
      previousProgress: result.previousProgress,
      incomingProgress: result.incomingProgress,
      incomingState: compactState(incomingState),
    },
  }).then(() => {}).catch(() => {});
}

export function persistHorsesPresentationSource(
  gameId: string,
  gameType: string,
  handNumber: number,
  roundId: string | null,
  source: 'authoritative' | 'optimistic' | 'frozen',
  progress: ProgressVector,
  state: HorsesStateFromDB | null,
): void {
  const fingerprint = `${source}|${JSON.stringify(progress)}`;
  if (fingerprint === _lastPresentationFingerprint) return;
  _lastPresentationFingerprint = fingerprint;

  supabase.from('debug_sync_events').insert({
    game_id: gameId,
    game_type: gameType,
    hand_number: handNumber,
    round_id: roundId,
    event_type: 'transition',
    severity: 'info',
    event_name: 'horses-presentation-source',
    payload: {
      source,
      progress,
      state: compactState(state),
    },
  }).then(() => {}).catch(() => {});
}

export function resetHorsesSyncInstrumentation(): void {
  _lastProgressFingerprint = '';
  _lastPresentationFingerprint = '';
}
