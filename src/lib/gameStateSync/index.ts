/**
 * Multiplayer Anti-Regression Framework
 *
 * Usage:
 *   import { useGameStateSync, compareProgress, type ProgressVector } from '@/lib/gameStateSync';
 */

export { useGameStateSync } from './useGameStateSync';
export { compareProgress, isProgressForwardOrEqual, isProgressStrictlyForward, jsonEqual } from './stateProgress';
export { getYahtzeeProgress } from './yahtzeeProgress';
export { getGinRummyProgress } from './ginRummyProgress';
export type {
  ProgressVector,
  GetProgressFn,
  GameStateSyncConfig,
  GameStateSyncHandle,
} from './types';
