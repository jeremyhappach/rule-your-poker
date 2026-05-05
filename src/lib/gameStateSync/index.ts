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
export { getHorsesProgress } from './horsesProgress';
export { getCribbageProgress } from './cribbageProgress';
export { getHolmProgress } from './holmProgress';
export type { HolmAuthoritativeSnapshot, HolmPlayerSnapshot } from './holmProgress';
export { getThreeFiveSevenProgress } from './threeFiveSevenProgress';
export type { ThreeFiveSevenAuthoritativeSnapshot, ThreeFiveSevenPlayerSnapshot } from './threeFiveSevenProgress';
export type {
  ProgressVector,
  AuthoritativeUpdateResult,
  GetProgressFn,
  GameStateSyncConfig,
  GameStateSyncHandle,
} from './types';
export { identityEquals } from './visualContract';
export type {
  VisualContractIdentity,
  VisualContractOptions,
  VisualContractEventName,
  VisualContractEvent,
} from './visualContract';
export { logVisualContractEvent } from './visualContractEvents';
export { reportMissingVisualContract } from './missingContractInvariant';
export type { MissingContractReport } from './missingContractInvariant';
