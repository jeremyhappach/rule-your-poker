/**
 * Multiplayer Anti-Regression Framework — Core Types
 *
 * Three-layer state model:
 *   1. Authoritative  — latest snapshot from DB (never rendered directly)
 *   2. Optimistic      — local intent merged ahead of DB confirmation
 *   3. Presentation    — frozen copy used by the UI; only advances via commit()
 *
 * Each game provides a `getProgress` function that extracts a comparable
 * progress vector from its state, enabling the framework to reject
 * regressive snapshots without game-specific timer hacks.
 */

/** Numeric progress vector — compared element by element, left to right. */
export type ProgressVector = number[];

/** Result of receiveAuthoritativeUpdate with diagnostic details. */
export interface AuthoritativeUpdateResult {
  accepted: boolean;
  /** 'forward' | 'equal' | 'regressive' | 'identical' */
  reason: string;
  previousProgress: ProgressVector;
  incomingProgress: ProgressVector;
  /** -1 regressive, 0 equal, 1 forward */
  comparison: number;
}

/**
 * Game-specific function that extracts a progress vector from state.
 * The vector must be monotonically non-decreasing as the game advances
 * across the ENTIRE match lifecycle, not just a single hand/round.
 *
 * For multi-hand games, the highest-priority (leftmost) dimension MUST be
 * the hand/round number so that new-hand resets are always forward progress.
 *
 * Example for Yahtzee (single continuous game):
 *   [phaseOrd, totalCategoriesFilled, handoffPhase, rollsUsed]
 *
 * Example for Gin Rummy (multi-hand match):
 *   [handNumber, phaseOrdinal, actionCount]
 */
export type GetProgressFn<T> = (state: T) => ProgressVector;

/**
 * Configuration passed to useGameStateSync.
 */
export interface GameStateSyncConfig<T> {
  /** Extract a progress vector from a game state snapshot. */
  getProgress: GetProgressFn<T>;

  /** Optional label used in debug logging. */
  debugLabel?: string;

  /** Optional lightweight snapshot description for debug logging. */
  describeState?: (state: T) => unknown;

  /**
   * Maximum time (ms) an optimistic override stays active before falling
   * back to authoritative state. Default: 3000.
   */
  optimisticTimeoutMs?: number;

  /**
   * Optional equality check. When true the incoming snapshot is treated
   * as identical to the current authoritative state (skipped).
   * Defaults to JSON.stringify comparison.
   */
  isEqual?: (a: T, b: T) => boolean;
}

/**
 * Return value of useGameStateSync.
 */
export interface GameStateSyncHandle<T> {
  // ── Read ──────────────────────────────────────────────────────
  /** The state the UI should render. */
  presentationState: T;
  /** Latest authoritative state from DB. */
  authoritativeState: T;
  /** Current optimistic state (if any), else authoritative. */
  effectiveState: T;
  /** True while presentation is frozen (animation in progress). */
  isFrozen: boolean;
  /** True while an optimistic override is active. */
  isOptimistic: boolean;

  // ── Write ─────────────────────────────────────────────────────
  /**
   * Feed an incoming DB snapshot (from realtime or poll).
   * The framework decides whether to accept, reject, or queue it.
   * Returns a result with accepted flag and progress vector details.
   */
  receiveAuthoritativeUpdate: (incoming: T) => AuthoritativeUpdateResult;

  /**
   * Apply a local optimistic state. The framework will prefer this
   * over authoritative state until the DB catches up or the timeout
   * expires.
   */
  applyOptimistic: (localState: T) => void;

  /**
   * Clear any active optimistic override immediately.
   * Useful after confirming the DB write succeeded.
   */
  clearOptimistic: () => void;

  /**
   * Freeze presentation state at its current value.
   * Incoming updates accumulate in authoritative but don't
   * propagate to presentation until unfreeze().
   */
  freezePresentation: () => void;

  /**
   * Unfreeze and commit the latest effective state to presentation.
   */
  unfreezePresentation: () => void;

  /**
   * Force-commit a specific state to presentation (e.g., after
   * an animation sequence completes and you want a specific frame).
   */
  commitToPresentation: (state: T) => void;
}
