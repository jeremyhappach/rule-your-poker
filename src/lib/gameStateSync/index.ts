/**
 * Multiplayer Anti-Regression Framework
 *
 * Usage:
 *   import { useGameStateSync, compareProgress, type ProgressVector } from '@/lib/gameStateSync';
 */

export { useGameStateSync } from './useGameStateSync';
export { compareProgress, isProgressForwardOrEqual, isProgressStrictlyForward, jsonEqual } from './stateProgress';
export type {
  ProgressVector,
  GetProgressFn,
  GameStateSyncConfig,
  GameStateSyncHandle,
} from './types';
