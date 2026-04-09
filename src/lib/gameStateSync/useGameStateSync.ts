/**
 * useGameStateSync — Reusable three-layer multiplayer state hook.
 *
 * Manages:
 *   Authoritative  →  the latest DB snapshot
 *   Optimistic      →  local intent (draw, discard, roll) before DB confirms
 *   Presentation    →  what the UI actually renders; frozen during animations
 *
 * Incoming snapshots are gated by progress-vector comparison so that
 * stale realtime / poll updates cannot regress the UI.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { GameStateSyncConfig, GameStateSyncHandle, AuthoritativeUpdateResult } from './types';
import { compareProgress, jsonEqual } from './stateProgress';

const DEFAULT_OPTIMISTIC_TIMEOUT = 3000;

export function useGameStateSync<T>(
  initialState: T,
  config: GameStateSyncConfig<T>,
): GameStateSyncHandle<T> {
  const {
    getProgress,
    optimisticTimeoutMs = DEFAULT_OPTIMISTIC_TIMEOUT,
    isEqual = jsonEqual,
    debugLabel,
    describeState,
  } = config;
  const logPrefix = debugLabel ? `[GameStateSync:${debugLabel}]` : '[GameStateSync]';

  // ── Core state layers ────────────────────────────────────────
  const [authoritative, setAuthoritative] = useState<T>(initialState);
  const [optimistic, setOptimistic] = useState<T | null>(null);
  const [presentation, setPresentation] = useState<T>(initialState);
  const [frozen, setFrozen] = useState(false);

  // Refs for synchronous access inside callbacks
  const authRef = useRef<T>(initialState);
  const optRef = useRef<T | null>(null);
  const frozenRef = useRef(false);
  const optimisticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => { authRef.current = authoritative; }, [authoritative]);
  useEffect(() => { optRef.current = optimistic; }, [optimistic]);
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);

  // The "effective" state: optimistic if active, else authoritative
  const effective = optimistic ?? authoritative;

  // ── Auto-propagate to presentation when not frozen ───────────
  useEffect(() => {
    if (!frozen) {
      setPresentation(effective);
    }
  }, [effective, frozen]);

  // ── Receive authoritative update (from realtime / poll) ──────
  const receiveAuthoritativeUpdate = useCallback((incoming: T): AuthoritativeUpdateResult => {
    const currentAuth = authRef.current;

    const currentProgress = getProgress(currentAuth);
    const incomingProgress = getProgress(incoming);

    // Skip identical snapshots
    if (isEqual(currentAuth, incoming)) {
      return { accepted: false, reason: 'identical', previousProgress: currentProgress, incomingProgress, comparison: 0 };
    }

    const cmp = compareProgress(currentProgress, incomingProgress);

    // Reject regressive updates
    if (cmp === -1) {
      console.log(`${logPrefix} ❌ Rejected regressive update`, {
        current: currentProgress,
        incoming: incomingProgress,
        currentState: describeState?.(currentAuth),
        incomingState: describeState?.(incoming),
      });
      return { accepted: false, reason: 'regressive', previousProgress: currentProgress, incomingProgress, comparison: cmp };
    }

    console.log(`${logPrefix} ✅ Accepted update`, {
      current: currentProgress,
      incoming: incomingProgress,
      relation: cmp === 1 ? 'forward' : 'equal',
      currentState: describeState?.(currentAuth),
      incomingState: describeState?.(incoming),
    });

    // Accept: update authoritative
    authRef.current = incoming;
    setAuthoritative(incoming);

    // If optimistic is active, check if DB has caught up
    if (optRef.current !== null) {
      const optProgress = getProgress(optRef.current);
      const incomingVsOpt = compareProgress(optProgress, incomingProgress);

      // DB caught up or surpassed optimistic → clear optimistic
      if (incomingVsOpt >= 0) {
        console.log(`${logPrefix} Optimistic cleared — DB caught up`, {
          opt: optProgress,
          incoming: incomingProgress,
          optimisticState: describeState?.(optRef.current),
          incomingState: describeState?.(incoming),
        });
        optRef.current = null;
        setOptimistic(null);
        if (optimisticTimerRef.current) {
          clearTimeout(optimisticTimerRef.current);
          optimisticTimerRef.current = null;
        }
      }
    }

    return { accepted: true, reason: cmp === 1 ? 'forward' : 'equal', previousProgress: currentProgress, incomingProgress, comparison: cmp };
  }, [getProgress, isEqual]);

  // ── Apply optimistic local state ─────────────────────────────
  const applyOptimistic = useCallback((localState: T) => {
    optRef.current = localState;
    setOptimistic(localState);

    // CRITICAL: Immediately propagate to presentation when not frozen.
    // Without this, presentation only updates via useEffect (runs AFTER render),
    // creating a 1-render gap where other state changes (e.g. scoringInProgress=false)
    // are visible but presentation still shows the OLD state — causing brief flashes
    // like "my roll" after turn advance.
    if (!frozenRef.current) {
      setPresentation(localState);
    }

    // Clear any existing timer
    if (optimisticTimerRef.current) {
      clearTimeout(optimisticTimerRef.current);
    }

    // Safety timeout: fall back to authoritative if DB never catches up
    optimisticTimerRef.current = setTimeout(() => {
      optRef.current = null;
      setOptimistic(null);
      optimisticTimerRef.current = null;
    }, optimisticTimeoutMs);
  }, [optimisticTimeoutMs]);

  // ── Clear optimistic ─────────────────────────────────────────
  const clearOptimistic = useCallback(() => {
    optRef.current = null;
    setOptimistic(null);
    if (optimisticTimerRef.current) {
      clearTimeout(optimisticTimerRef.current);
      optimisticTimerRef.current = null;
    }
  }, []);

  // ── Freeze / unfreeze presentation ───────────────────────────
  const freezePresentation = useCallback(() => {
    frozenRef.current = true;
    setFrozen(true);
  }, []);

  const unfreezePresentation = useCallback(() => {
    frozenRef.current = false;
    setFrozen(false);
    // Commit latest effective to presentation
    const latest = optRef.current ?? authRef.current;
    setPresentation(latest);
  }, []);

  const commitToPresentation = useCallback((state: T) => {
    setPresentation(state);
  }, []);

  // ── Full reset (hand/round boundary) ─────────────────────────
  const reset = useCallback((newInitial: T) => {
    authRef.current = newInitial;
    optRef.current = null;
    frozenRef.current = false;
    setAuthoritative(newInitial);
    setOptimistic(null);
    setPresentation(newInitial);
    setFrozen(false);
    if (optimisticTimerRef.current) {
      clearTimeout(optimisticTimerRef.current);
      optimisticTimerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (optimisticTimerRef.current) {
        clearTimeout(optimisticTimerRef.current);
      }
    };
  }, []);

  return {
    presentationState: presentation,
    authoritativeState: authoritative,
    effectiveState: effective,
    isFrozen: frozen,
    isOptimistic: optimistic !== null,
    receiveAuthoritativeUpdate,
    applyOptimistic,
    clearOptimistic,
    freezePresentation,
    unfreezePresentation,
    commitToPresentation,
    reset,
  };
}
