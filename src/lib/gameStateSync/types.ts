import type { VisualContractIdentity, VisualContractOptions } from './visualContract';
import type { AuthoritativeIdentity } from './authoritativeIdentity';

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
  /** What happened to the presentation layer during this update */
  presentationAction: 'written' | 'skipped-frozen' | 'not-applicable';
  /** Whether frozen ref was true at the moment of the write decision */
  wasFrozenAtWrite: boolean;
  /** Synchronous presentation value BEFORE the write (from ref) */
  presentationBefore: unknown;
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

  /**
   * Required for visual contract event persistence — identifies the
   * concrete game (e.g. 'cribbage', 'holm', 'horses', 'yahtzee', 'gin-rummy').
   * Falls back to debugLabel when omitted.
   */
  gameType?: string;

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

  /**
   * OPTIONAL identity awareness. When provided, the framework auto-resets
   * presentation on forward identity advancement and exposes
   * `interactionsAllowed` for action gating. Omit to keep legacy
   * manual-reset behavior.
   *
   * A transition from a non-null identity to null is an explicit lifecycle
   * boundary, not a request to keep rendering the prior presentation.
   */
  identity?: AuthoritativeIdentity | null;

  /**
   * Clean state used when an identity-aware surface crosses an explicit
   * null boundary. Defaults to the hook's original initialState.
   */
  identityResetState?: T | (() => T);

  /**
   * Optional identity equality override. Defaults to deep tuple equality
   * on (dealerGameId, handNumber, roundId).
   */
  identityEquals?: (
    a: AuthoritativeIdentity | null,
    b: AuthoritativeIdentity | null,
  ) => boolean;
}

/**
 * Return value of useGameStateSync.
 */
export interface GameStateSyncHandle<T> {
  // ── Read ──────────────────────────────────────────────────────
  /** The state the UI should render. */
  presentationState: T;
  /** Synchronous ref value of presentation (bypasses React async state). */
  presentationRefValue: T;
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

   /**
    * Full reset for hand/round boundaries. Clears all layers
    * (authoritative, optimistic, presentation, frozen) to the
    * given initial state. Cancels any pending optimistic timers.
    */
   reset: (newInitial: T) => void;

   // ── Visual contract API ──────────────────────────────────────
   /**
    * Begin a visual contract: locks presentation against authoritative
    * replacement until completion / identity drift / timeout.
    *
    * Returns the resolved identity (use it to call complete/abort).
    * If a contract is already active and identities differ, the active
    * contract is aborted with reason 'superseded' before the new one starts.
    */
   beginVisualContract: (opts: VisualContractOptions) => VisualContractIdentity;

   /**
    * Complete the active contract. Identity must match the active one
    * (otherwise the call is ignored & logged). Flushes buffered authoritative
    * state into presentation.
    */
   completeVisualContract: (identity: VisualContractIdentity) => boolean;

   /**
    * Abort the active contract (e.g. user navigation, error). Same identity
    * matching as complete. Flushes buffered authoritative state.
    */
   abortVisualContract: (identity: VisualContractIdentity, reason: string) => boolean;

   /** True while any visual contract is active. */
   isVisualContractActive: boolean;

   /** Identity of the active visual contract, or null. */
   activeVisualContract: VisualContractIdentity | null;

   // ── Identity awareness (only meaningful when `config.identity` is wired) ──
   /**
    * Identity attached to the current presentation state. Set on every
    * accepted authoritative update and on reset(). May be null if the
    * framework has not yet observed an identity.
    */
   presentationIdentity: AuthoritativeIdentity | null;

   /**
    * True when the framework has been told about an authoritative identity
    * that differs from `presentationIdentity`. While true, render must
    * fall back to a safe placeholder and action handlers MUST short-circuit.
    */
   isIdentityStale: boolean;

   /**
    * Single framework-owned action-gate. Equivalent to:
    *   !isFrozen && !isVisualContractActive && !isIdentityStale
    * Game tables SHOULD use this instead of reinventing per-game gates.
    */
   interactionsAllowed: boolean;

   /**
    * Synchronous writer-gate predicate. Reads from refs only (frozen,
    * active contract, identity equality) — bypasses React render lag.
    * Use this inside callbacks that may fire in the same tick as
    * unfreezePresentation() or identity advancement, where the
    * state-derived `interactionsAllowed` flag is one render behind.
    */
   canInteractNow: () => boolean;
}
