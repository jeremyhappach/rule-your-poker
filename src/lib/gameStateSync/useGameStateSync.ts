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
import type { GameStateSyncConfig, GameStateSyncHandle } from './types';
import { compareProgress, jsonEqual } from './stateProgress';

const DEFAULT_OPTIMISTIC_TIMEOUT = 3000;

export function useGameStateSync<T>(
  initialState: T,
  config: GameStateSyncConfig<T>,
): GameStateSyncHandle<T> {
  const { getProgress, optimisticTimeoutMs = DEFAULT_OPTIMISTIC_TIMEOUT, isEqual = jsonEqual } = config;

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
  const receiveAuthoritativeUpdate = useCallback((incoming: T): boolean => {
    const currentAuth = authRef.current;

    // Skip identical snapshots
    if (isEqual(currentAuth, incoming)) return false;

    const currentProgress = getProgress(currentAuth);
    const incomingProgress = getProgress(incoming);
    const cmp = compareProgress(currentProgress, incomingProgress);

    // Reject regressive updates
    if (cmp === -1) {
      return false;
    }

    // Accept: update authoritative
    authRef.current = incoming;
    setAuthoritative(incoming);

    // If optimistic is active, check if DB has caught up
    if (optRef.current !== null) {
      const optProgress = getProgress(optRef.current);
      const incomingVsOpt = compareProgress(optProgress, incomingProgress);

      // DB caught up or surpassed optimistic → clear optimistic
      if (incomingVsOpt >= 0) {
        optRef.current = null;
        setOptimistic(null);
        if (optimisticTimerRef.current) {
          clearTimeout(optimisticTimerRef.current);
          optimisticTimerRef.current = null;
        }
      }
    }

    return true;
  }, [getProgress, isEqual]);

  // ── Apply optimistic local state ─────────────────────────────
  const applyOptimistic = useCallback((localState: T) => {
    optRef.current = localState;
    setOptimistic(localState);

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
  };
}
