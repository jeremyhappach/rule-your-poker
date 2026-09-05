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
import { snapshotRevisionRejection } from './snapshotRevision';
import {
  identityEquals,
  type VisualContractIdentity,
  type VisualContractOptions,
} from './visualContract';
import { logVisualContractEvent } from './visualContractEvents';
import {
  authoritativeIdentityEquals as defaultIdentityEquals,
  isIdentityForward,
  identityKey,
  type AuthoritativeIdentity,
} from './authoritativeIdentityPure';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { recordStartupFlight, recordStartupValue } from '@/lib/startupFlightRecorder';

const DEFAULT_OPTIMISTIC_TIMEOUT = 3000;
const DEFAULT_VISUAL_CONTRACT_TIMEOUT = 10000;

function clonePresentationState<T>(state: T): T {
  if (Array.isArray(state)) {
    return [...state] as T;
  }

  if (state && typeof state === 'object') {
    return { ...(state as Record<string, unknown>) } as T;
  }

  return state;
}

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
    gameType,
    identity: identityProp = null,
    identityResetState,
    identityEquals: identityEqualsFn = defaultIdentityEquals,
  } = config;
  const logPrefix = debugLabel ? `[GameStateSync:${debugLabel}]` : '[GameStateSync]';
  const resolvedGameType = gameType ?? debugLabel ?? 'unknown';

  // ── Core state layers ────────────────────────────────────────
  const [authoritative, setAuthoritative] = useState<T>(initialState);
  const [optimistic, setOptimistic] = useState<T | null>(null);
  const [presentation, setPresentation] = useState<T>(initialState);
  const [frozen, setFrozen] = useState(false);

  // Refs for synchronous access inside callbacks
  const authRef = useRef<T>(initialState);
  const optRef = useRef<T | null>(null);
  const frozenRef = useRef(false);
  const presentationRef = useRef<T>(initialState);
  const optimisticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPostResetHydrationRef = useRef(false);
  // P0 #2 FIX: capture the user-supplied initialState so identity-advance
  // auto-reset can seed authoritative back to a TRUE clean baseline instead
  // of the stale terminal prior-hand state (which would otherwise dominate
  // every fresh next-hand snapshot as "regressive" on lower progress dims).
  const initialStateRef = useRef<T>(initialState);
  const identityResetStateRef = useRef<GameStateSyncConfig<T>['identityResetState']>(identityResetState);
  identityResetStateRef.current = identityResetState;

  // ── Visual contract refs ─────────────────────────────────────
  const contractRef = useRef<VisualContractIdentity | null>(null);
  const contractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contractBufferRef = useRef<T | null>(null);
  const [activeContract, setActiveContract] = useState<VisualContractIdentity | null>(null);

  // ── Identity awareness refs ──────────────────────────────────
  // presentationIdentity = identity attached to the current presentation.
  // It is updated on every accepted authoritative update and on reset().
  //
  // IMPORTANT: do NOT seed with `identityProp` at mount. Seeding here causes
  // the auto-reset effect to early-return when its `prev` already equals the
  // first observed identity, even though presentation has not yet been
  // hydrated for it. The effect itself adopts the first observation silently
  // (no reset needed when there is nothing stale to clear); subsequent forward
  // advances then trigger reset deterministically.
  const presentationIdentityRef = useRef<AuthoritativeIdentity | null>(null);
  const [presentationIdentity, setPresentationIdentity] = useState<AuthoritativeIdentity | null>(null);
  const identityPropRef = useRef<AuthoritativeIdentity | null>(identityProp);
  identityPropRef.current = identityProp;

  const getIdentityResetSeed = useCallback((): T => {
    const resetState = identityResetStateRef.current;
    if (resetState === undefined) return initialStateRef.current;
    return typeof resetState === 'function'
      ? (resetState as () => T)()
      : resetState;
  }, []);

  // Keep refs in sync
  useEffect(() => { authRef.current = authoritative; }, [authoritative]);
  useEffect(() => { optRef.current = optimistic; }, [optimistic]);
  useEffect(() => { frozenRef.current = frozen; }, [frozen]);
  useEffect(() => { presentationRef.current = presentation; }, [presentation]);

  // The "effective" state: optimistic if active, else authoritative
  const effective = optimistic ?? authoritative;

  // ── Auto-propagate to presentation when not frozen ───────────
  useEffect(() => {
    if (!frozen && contractRef.current === null) {
      const nextPresentation = pendingPostResetHydrationRef.current
        ? clonePresentationState(effective)
        : effective;

      presentationRef.current = nextPresentation;
      setPresentation(nextPresentation);
    } else if (contractRef.current !== null) {
      // Contract active: buffer the latest effective for post-contract flush.
      contractBufferRef.current = effective;
    }
  }, [effective, frozen]);

  // Helper: presentation may be written only if not frozen and no active contract.
  const canWritePresentation = (): boolean =>
    !frozenRef.current && contractRef.current === null;

  const stampAcceptedIdentity = () => {
    const currentIdentity = identityPropRef.current;
    if (!currentIdentity) return;
    presentationIdentityRef.current = currentIdentity;
    setPresentationIdentity(currentIdentity);
  };

  // ── Receive authoritative update (from realtime / poll) ──────
  const receiveAuthoritativeUpdate = useCallback((incoming: T): AuthoritativeUpdateResult => {
    recordStartupFlight('SYNC TIMELINE', 'receiveAuthoritativeUpdate entered', {
      file: 'src/lib/gameStateSync/useGameStateSync.ts',
      function: 'receiveAuthoritativeUpdate',
      gameType: resolvedGameType,
      identity: identityPropRef.current,
    });
    const currentAuth = authRef.current;
    const presPre = presentationRef.current;

    const currentProgress = getProgress(currentAuth);
    const incomingProgress = getProgress(incoming);
    const writable = canWritePresentation();
    const shouldForcePostResetHydration = pendingPostResetHydrationRef.current && writable;

    // Skip identical snapshots
    if (isEqual(currentAuth, incoming) || jsonEqual(currentAuth, incoming)) {
      if (shouldForcePostResetHydration) {
        const hydratedPresentation = clonePresentationState(incoming);
        presentationRef.current = hydratedPresentation;
        setPresentation(hydratedPresentation);
        pendingPostResetHydrationRef.current = false;
        stampAcceptedIdentity();

        const result: AuthoritativeUpdateResult = {
          accepted: true,
          reason: 'equal',
          previousProgress: currentProgress,
          incomingProgress,
          comparison: 0,
          presentationAction: 'written',
          wasFrozenAtWrite: false,
          presentationBefore: presPre,
        };
        recordStartupFlight('SYNC TIMELINE', 'receiveAuthoritativeUpdate exited', {
          file: 'src/lib/gameStateSync/useGameStateSync.ts',
          function: 'receiveAuthoritativeUpdate',
          gameType: resolvedGameType,
          oldValue: presPre as any,
          newValue: incoming as any,
          result,
        });
        return result;
      }

      const result: AuthoritativeUpdateResult = { accepted: false, reason: 'identical', previousProgress: currentProgress, incomingProgress, comparison: 0, presentationAction: 'not-applicable', wasFrozenAtWrite: frozenRef.current, presentationBefore: presPre };
      recordStartupFlight('SYNC TIMELINE', 'receiveAuthoritativeUpdate exited', {
        file: 'src/lib/gameStateSync/useGameStateSync.ts',
        function: 'receiveAuthoritativeUpdate',
        gameType: resolvedGameType,
        result,
      });
      return result;
    }

    const cmp = compareProgress(currentProgress, incomingProgress);

    // Reject regressive updates
    if (cmp === -1) {
      const result: AuthoritativeUpdateResult = { accepted: false, reason: 'regressive', previousProgress: currentProgress, incomingProgress, comparison: cmp, presentationAction: 'not-applicable', wasFrozenAtWrite: frozenRef.current, presentationBefore: presPre };
      recordStartupFlight('SYNC TIMELINE', 'receiveAuthoritativeUpdate exited', {
        file: 'src/lib/gameStateSync/useGameStateSync.ts',
        function: 'receiveAuthoritativeUpdate',
        gameType: resolvedGameType,
        result,
      });
      return result;
    }

    // Accept: update authoritative
    const revisionRejection = snapshotRevisionRejection(currentAuth, incoming, cmp);
    if (revisionRejection) {
      return { accepted: false, reason: revisionRejection, previousProgress: currentProgress, incomingProgress,
        comparison: cmp, presentationAction: 'not-applicable', wasFrozenAtWrite: frozenRef.current, presentationBefore: presPre };
    }
    authRef.current = incoming;
    setAuthoritative(incoming);
    stampAcceptedIdentity();

    // If contract active, buffer and log — never write presentation here.
    if (contractRef.current !== null) {
      contractBufferRef.current = optRef.current ?? incoming;
      logVisualContractEvent('visual-contract-buffered-authoritative', contractRef.current, resolvedGameType, {
        incomingProgress,
        currentProgress,
      });
      const result: AuthoritativeUpdateResult = { accepted: true, reason: cmp === 1 ? 'forward' : 'equal', previousProgress: currentProgress, incomingProgress, comparison: cmp, presentationAction: 'skipped-frozen', wasFrozenAtWrite: true, presentationBefore: presPre };
      recordStartupFlight('SYNC TIMELINE', 'receiveAuthoritativeUpdate exited', {
        file: 'src/lib/gameStateSync/useGameStateSync.ts',
        function: 'receiveAuthoritativeUpdate',
        gameType: resolvedGameType,
        result,
      });
      return result;
    }

    let presentationAction: 'written' | 'skipped-frozen' = 'skipped-frozen';

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
        // Immediately propagate to presentation — effective is now authoritative (incoming)
        if (!frozenRef.current) {
          presentationRef.current = incoming;
          setPresentation(incoming);
          pendingPostResetHydrationRef.current = false;
          presentationAction = 'written';
        }
      }
    } else {
      // No optimistic active — effective is authoritative, propagate immediately
      if (!frozenRef.current) {
        presentationRef.current = incoming;
        setPresentation(incoming);
        pendingPostResetHydrationRef.current = false;
        presentationAction = 'written';
      }
    }

    const result: AuthoritativeUpdateResult = { accepted: true, reason: cmp === 1 ? 'forward' : 'equal', previousProgress: currentProgress, incomingProgress, comparison: cmp, presentationAction, wasFrozenAtWrite: frozenRef.current, presentationBefore: presPre };
    recordStartupFlight('SYNC TIMELINE', 'receiveAuthoritativeUpdate exited', {
      file: 'src/lib/gameStateSync/useGameStateSync.ts',
      function: 'receiveAuthoritativeUpdate',
      gameType: resolvedGameType,
      oldValue: presPre as any,
      newValue: presentationAction === 'written' ? incoming as any : presPre as any,
      result,
    });
    return result;
  }, [getProgress, isEqual, resolvedGameType]);

  // ── Apply optimistic local state ─────────────────────────────
  const applyOptimistic = useCallback((localState: T) => {
    optRef.current = localState;
    setOptimistic(localState);

    // CRITICAL: Immediately propagate to presentation when not frozen.
    // Without this, presentation only updates via useEffect (runs AFTER render),
    // creating a 1-render gap where other state changes (e.g. scoringInProgress=false)
    // are visible but presentation still shows the OLD state — causing brief flashes
    // like "my roll" after turn advance.
    if (!frozenRef.current && contractRef.current === null) {
      setPresentation(localState);
    } else if (contractRef.current !== null) {
      contractBufferRef.current = localState;
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
    presentationRef.current = latest;
    setPresentation(latest);
  }, []);

  const commitToPresentation = useCallback((state: T) => {
    presentationRef.current = state;
    setPresentation(state);
  }, []);

  // ── Visual contract API ──────────────────────────────────────
  // Internal: flush buffered effective into presentation (post-contract).
  const flushContractBuffer = useCallback((identity: VisualContractIdentity) => {
    const buffered = contractBufferRef.current ?? optRef.current ?? authRef.current;
    contractBufferRef.current = null;
    if (!frozenRef.current) {
      presentationRef.current = buffered;
      setPresentation(buffered);
    }
    logVisualContractEvent('visual-contract-flushed-buffer', identity, resolvedGameType);
  }, [resolvedGameType]);

  const clearContract = useCallback(() => {
    contractRef.current = null;
    setActiveContract(null);
    if (contractTimerRef.current) {
      clearTimeout(contractTimerRef.current);
      contractTimerRef.current = null;
    }
  }, []);

  const beginVisualContract = useCallback((opts: VisualContractOptions): VisualContractIdentity => {
    const identity: VisualContractIdentity = {
      ...opts.identity,
      contractType: opts.type,
    };

    // Supersede any existing contract of differing identity.
    if (contractRef.current && !identityEquals(contractRef.current, identity)) {
      logVisualContractEvent('visual-contract-aborted-identity-drift', contractRef.current, resolvedGameType, {
        reason: 'superseded',
        nextIdentity: identity,
      });
      const prev = contractRef.current;
      clearContract();
      // Don't flush here — new contract will lock again immediately.
      // But the previous contract's buffer is dropped to the new lock.
      contractBufferRef.current = null;
      void prev;
    }

    contractRef.current = identity;
    setActiveContract(identity);
    contractBufferRef.current = null;

    const timeoutMs = opts.timeoutMs ?? DEFAULT_VISUAL_CONTRACT_TIMEOUT;
    if (contractTimerRef.current) clearTimeout(contractTimerRef.current);
    contractTimerRef.current = setTimeout(() => {
      const active = contractRef.current;
      if (active && identityEquals(active, identity)) {
        logVisualContractEvent('visual-contract-timeout', active, resolvedGameType, { timeoutMs });
        clearContract();
        flushContractBuffer(active);
      }
    }, timeoutMs);

    logVisualContractEvent('visual-contract-started', identity, resolvedGameType, {
      expectedSteps: opts.expectedSteps ?? null,
      timeoutMs,
    });

    return identity;
  }, [clearContract, flushContractBuffer, resolvedGameType]);

  const completeVisualContract = useCallback((identity: VisualContractIdentity): boolean => {
    const active = contractRef.current;
    if (!active || !identityEquals(active, identity)) {
      logVisualContractEvent('visual-contract-aborted-identity-drift', identity, resolvedGameType, {
        reason: 'complete-identity-mismatch',
        active,
      });
      return false;
    }
    logVisualContractEvent('visual-contract-completed', active, resolvedGameType);
    clearContract();
    flushContractBuffer(active);
    return true;
  }, [clearContract, flushContractBuffer, resolvedGameType]);

  const abortVisualContract = useCallback((identity: VisualContractIdentity, reason: string): boolean => {
    const active = contractRef.current;
    if (!active || !identityEquals(active, identity)) return false;
    logVisualContractEvent('visual-contract-aborted-identity-drift', active, resolvedGameType, { reason });
    clearContract();
    flushContractBuffer(active);
    return true;
  }, [clearContract, flushContractBuffer, resolvedGameType]);

  // ── Full reset (hand/round boundary) ─────────────────────────
  const reset = useCallback((newInitial: T) => {
    const presPre = presentationRef.current;
    const freshPresentation = clonePresentationState(newInitial);
    // Abort any in-flight contract — boundary change supersedes.
    if (contractRef.current) {
      logVisualContractEvent('visual-contract-aborted-identity-drift', contractRef.current, resolvedGameType, {
        reason: 'reset-boundary',
      });
      contractRef.current = null;
      setActiveContract(null);
      if (contractTimerRef.current) {
        clearTimeout(contractTimerRef.current);
        contractTimerRef.current = null;
      }
      contractBufferRef.current = null;
    }
    authRef.current = newInitial;
    optRef.current = null;
    frozenRef.current = false;
    presentationRef.current = freshPresentation;
    pendingPostResetHydrationRef.current = true;
    setAuthoritative(newInitial);
    setOptimistic(null);
    setPresentation(freshPresentation);
    setFrozen(false);
    // Adopt the latest known authoritative identity as the new presentation
    // identity (it will be re-stamped on the next accepted update too).
    presentationIdentityRef.current = identityPropRef.current;
    setPresentationIdentity(identityPropRef.current);
    if (optimisticTimerRef.current) {
      clearTimeout(optimisticTimerRef.current);
      optimisticTimerRef.current = null;
    }
    // Expose pre-reset presentation for diagnostics (via ref accessible to callers)
    (reset as any)._lastResetPresentationBefore = presPre;
  }, [resolvedGameType]);

  // ── Identity advancement auto-reset ──────────────────────────
  // Reset fires on first actionable divergence between presentation identity
  // and authoritative identity. The very first observation (prev=null) is
  // adopted silently — there is no stale presentation to clear and no peer
  // has advanced past us yet. Every subsequent forward divergence triggers
  // reset() and emits `framework-identity-reset-fired`.
  useEffect(() => {
    const prev = presentationIdentityRef.current;

    if (!identityProp) {
      if (!prev) return;

      const preAuthForReset = authRef.current;
      const preProgress = getProgress(preAuthForReset);
      const seed = getIdentityResetSeed();
      const seedProgress = getProgress(seed);

      persistSyncDebugEvent({
        gameId: prev.dealerGameId ?? null,
        gameType: resolvedGameType,
        handNumber: prev.handNumber ?? null,
        roundId: prev.roundId ?? null,
        eventType: 'transition',
        severity: 'info',
        eventName: 'framework-identity-null-boundary',
        payload: {
          prevIdentity: identityKey(prev),
          hadActiveContract: contractRef.current !== null,
          wasFrozen: frozenRef.current,
          preResetAuthProgress: preProgress,
          resetSeedProgress: seedProgress,
        },
      });
      reset(seed);
      presentationIdentityRef.current = null;
      setPresentationIdentity(null);
      pendingPostResetHydrationRef.current = false;
      return;
    }

    if (identityEqualsFn(prev, identityProp)) return;

    if (!prev) {
      // First observation — adopt silently. No reset needed.
      presentationIdentityRef.current = identityProp;
      setPresentationIdentity(identityProp);
      return;
    }

    if (!isIdentityForward(prev, identityProp)) {
      // Non-forward identity change (e.g. dealerGameId churn during init) —
      // adopt silently without triggering a reset cascade.
      presentationIdentityRef.current = identityProp;
      setPresentationIdentity(identityProp);
      return;
    }

    // Actionable forward divergence.
    // P0 #2 FIX: capture pre/post progress vectors and identity transition for
    // forensic validation that the boundary reset clears stale terminal state.
    const preAuthForReset = authRef.current;
    const preProgress = getProgress(preAuthForReset);
    const seed = getIdentityResetSeed();
    const seedProgress = getProgress(seed);
    persistSyncDebugEvent({
      gameId: identityProp.dealerGameId ?? null,
      gameType: resolvedGameType,
      handNumber: identityProp.handNumber ?? null,
      roundId: identityProp.roundId ?? null,
      eventType: 'transition',
      severity: 'info',
      eventName: 'framework-identity-advanced',
      payload: {
        prevIdentity: identityKey(prev),
        nextIdentity: identityKey(identityProp),
        hadActiveContract: contractRef.current !== null,
        wasFrozen: frozenRef.current,
        preResetAuthProgress: preProgress,
        resetSeedProgress: seedProgress,
      },
    });
    // P0 #2 FIX: reset to the original initialState, NOT authRef.current.
    // authRef.current may still hold the prior-hand terminal snapshot whose
    // lower-dim progress (gamePhase=complete, completedCount=N, turnIdx=len)
    // strictly dominates a fresh next-hand snapshot (gamePhase=playing,
    // completedCount=0, turnIdx=0). Reseeding with the stale snapshot makes
    // every subsequent incoming forward update look "regressive" and the UI
    // deadlocks on a fresh hand even though the DB row is correct.
    reset(seed);
    persistSyncDebugEvent({
      gameId: identityProp.dealerGameId ?? null,
      gameType: resolvedGameType,
      handNumber: identityProp.handNumber ?? null,
      roundId: identityProp.roundId ?? null,
      eventType: 'transition',
      severity: 'info',
      eventName: 'framework-identity-reset-fired',
      payload: {
        prevIdentity: identityKey(prev),
        nextIdentity: identityKey(identityProp),
        seededWith: 'identityResetState',
        postResetAuthProgress: getProgress(seed),
      },
    });
  }, [identityProp, identityEqualsFn, reset, resolvedGameType, getProgress, getIdentityResetSeed]);



  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (optimisticTimerRef.current) clearTimeout(optimisticTimerRef.current);
      if (contractTimerRef.current) clearTimeout(contractTimerRef.current);
    };
  }, []);

  const isIdentityStale = !!(
    identityProp &&
    !identityEqualsFn(presentationIdentityRef.current, identityProp)
  );
  const interactionsAllowed = !frozen && activeContract === null && !isIdentityStale;
  useEffect(() => {
    recordStartupValue('SYNC TIMELINE', `${resolvedGameType}.presentationState`, presentation as any, {
      file: 'src/lib/gameStateSync/useGameStateSync.ts',
      identity: identityProp ?? null,
    });
  }, [presentation, resolvedGameType, identityProp]);

  /**
   * Synchronous writer-gate predicate. Reads from refs only — bypasses React
   * render lag so that callers invoking unfreezePresentation() followed
   * immediately by a write in the same tick are not incorrectly suppressed.
   */
  const canInteractNow = useCallback((): boolean => {
    if (frozenRef.current) return false;
    if (contractRef.current !== null) return false;
    const currentIdentity = identityPropRef.current;
    if (currentIdentity && !identityEqualsFn(presentationIdentityRef.current, currentIdentity)) {
      return false;
    }
    return true;
  }, [identityEqualsFn]);

  return {
    presentationState: presentation,
    presentationRefValue: presentationRef.current,
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
    beginVisualContract,
    completeVisualContract,
    abortVisualContract,
    isVisualContractActive: activeContract !== null,
    activeVisualContract: activeContract,
    presentationIdentity,
    isIdentityStale,
    interactionsAllowed,
    canInteractNow,
  };
}
