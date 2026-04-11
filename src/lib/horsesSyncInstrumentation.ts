/**
 * Horses sync framework instrumentation — persisted debug events.
 *
 * Events:
 *   horses-progress-vector     — logged on every accepted update
 *   horses-presentation-source — logged when presentation state source changes
 *   horses-regression-blocked  — logged when a regressive snapshot is rejected
 */

import { persistSyncDebugEvent } from './persistSyncDebugEvent';
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

  const isRegressive = result.reason === 'regressive';

  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber,
    roundId,
    eventType: 'sync-gate',
    severity: isRegressive ? 'warn' : 'info',
    eventName: isRegressive ? 'horses-regression-blocked' : 'horses-progress-vector',
    payload: {
      accepted: result.accepted,
      reason: result.reason,
      comparison: result.comparison,
      previousProgress: result.previousProgress,
      incomingProgress: result.incomingProgress,
      incomingState: compactState(incomingState),
    },
  });
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

  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber,
    roundId,
    eventType: 'transition',
    severity: 'info',
    eventName: 'horses-presentation-source',
    payload: {
      source,
      progress,
      state: compactState(state),
    },
  });
}

export function resetHorsesSyncInstrumentation(): void {
  _lastProgressFingerprint = '';
  _lastPresentationFingerprint = '';
}
