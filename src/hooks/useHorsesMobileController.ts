import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";
import { snapshotPlayerChips } from "@/lib/gameLogic";
import { logSitOutNextHandSet } from "@/lib/sittingOutDebugLog";
import { getHorsesProgress } from "@/lib/gameStateSync/horsesProgress";
import { useGameStateSync } from "@/lib/gameStateSync/useGameStateSync";
import { useAuthoritativeIdentity } from "@/lib/gameStateSync/authoritativeIdentity";
import { isIdentityForward, type AuthoritativeIdentity } from "@/lib/gameStateSync/authoritativeIdentityPure";
import { persistSyncDebugEvent } from "@/lib/persistSyncDebugEvent";
import { newTraceId } from "@/lib/debugEventLogger";
import type { ProgressVector, GameStateSyncConfig } from "@/lib/gameStateSync/types";
import {
  HorsesHand,
  HorsesHandResult,
  HorsesDie as HorsesDieType,
  createInitialHand,
  rollDice,
  toggleHold,
  lockInHand,
  evaluateHand,
  determineWinners,
} from "@/lib/horsesGameLogic";
import {
  SCCHand,
  SCCHandResult,
  SCCDie as SCCDieType,
  createInitialSCCHand,
  reconstructSCCHand,
  rollSCCDice,
  lockInSCCHand,
  evaluateSCCHand,
  determineSCCWinners,
  isQualified,
} from "@/lib/sccGameLogic";
import {
  getBotHoldDecision,
  shouldBotStopRolling,
  applyHoldDecision,
} from "@/lib/horsesBotLogic";
import { shouldSCCBotStopRolling } from "@/lib/sccBotLogic";
import { getRollNumber } from "@/lib/diceAudit";
import { startHorsesRound } from "@/lib/horsesRoundLogic";
import { startSCCRound } from "@/lib/sccRoundLogic";

export interface HorsesPlayerForController {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot: boolean;
  sitting_out: boolean;
  auto_fold?: boolean; // For dice games, auto_fold means "auto-roll" mode
  profiles?: {
    username: string;
  };
}

// Database state structure - supports both Horses and SCC dice types
export interface HorsesPlayerDiceState {
  dice: HorsesDieType[] | SCCDieType[];
  rollsRemaining: number;
  isComplete: boolean;
  result?: HorsesHandResult | SCCHandResult;
  /** Per-die mask of what was held BEFORE the last roll started (freeze layout on completion) */
  heldMaskBeforeComplete?: boolean[];
  /** Convenience count (legacy fallback for layouts that can't map exact dice) */
  heldCountBeforeComplete?: number;
  /** Changes every roll so all clients can trigger the fly-in animation deterministically */
  rollKey?: number;
  /** Monotonically increasing counter for hold/unhold actions within a roll - used for ordering realtime updates */
  holdSeq?: number;
  /** ISO timestamp when the roll started — observers use this to derive animation position */
  rollStartedAt?: string;
  /** ISO timestamp — active roller may not proceed to next action until this time has passed */
  rollAnimationMinEndAt?: string;
}
export interface HorsesStateFromDB {
  currentTurnPlayerId: string | null;
  playerStates: Record<string, HorsesPlayerDiceState>;
  gamePhase: "waiting" | "playing" | "complete";
  turnOrder: string[]; // Player IDs in turn order
  /**
   * Single-client bot driver to prevent multiple clients from re-playing bot turns and fighting over state.
   * Chosen deterministically at round init.
   */
  botControllerUserId?: string | null;
  /**
   * ISO timestamp deadline for the current turn. Player times out if not acted by this time.
   */
  turnDeadline?: string | null;
}

export type DiceDebugEvent = {
  t: number;
  tag: string;
  message: string;
  data?: unknown;
};

async function updateHorsesState(roundId: string, state: HorsesStateFromDB): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ horses_state: state } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq("id", roundId);
  return error;
}

async function horsesSetPlayerState(
  roundId: string,
  playerId: string,
  state: HorsesPlayerDiceState,
): Promise<HorsesStateFromDB | null> {
  const { data, error } = await supabase.rpc("horses_set_player_state" as any, {
    _round_id: roundId,
    _player_id: playerId,
    _state: state as any,
  } as any);

  if (error) {
    console.error("[HORSES] horses_set_player_state failed:", error);
    return null;
  }

  return (data as any) as HorsesStateFromDB;
}

async function horsesAdvanceTurn(roundId: string, expectedCurrentPlayerId: string, meta?: { gameId?: string; handNumber?: number; isSCC?: boolean }): Promise<HorsesStateFromDB | null> {
  const { data, error } = await supabase.rpc("horses_advance_turn" as any, {
    _round_id: roundId,
    _expected_current_player_id: expectedCurrentPlayerId,
  } as any);

  if (error) {
    console.error("[HORSES] horses_advance_turn failed:", error);
    return null;
  }

  const result = (data as any) as HorsesStateFromDB;

  // Log turn advance for SCC diagnostics
  if (meta?.gameId && meta.isSCC && result) {
    import("@/lib/sccSyncDiagnostics").then(({ logSCCTurnAdvance }) => {
      logSCCTurnAdvance(
        meta.gameId!,
        meta.handNumber ?? 0,
        expectedCurrentPlayerId,
        result.currentTurnPlayerId ?? null,
        roundId,
      );
    }).catch(() => {});
  }

  return result;
}

export interface UseHorsesMobileControllerArgs {
  enabled: boolean;
  gameId?: string;
  /**
   * Dealer-game (session) id. Required for the framework's authoritative
   * identity feed (`useAuthoritativeIdentity`). When omitted, the auth feed
   * is disabled and the hook falls back to prop-driven identity (legacy).
   */
  dealerGameId?: string | null;
  /**
   * Authoritative hand number for the current round. Used as the most
   * significant dimension of the progress vector and to drive the monotonic
   * identity latch.
   */
  currentHandNumber?: number | null;
  players: HorsesPlayerForController[];
  currentUserId: string | undefined;
  pot: number;
  anteAmount: number;
  dealerPosition: number;
  currentRoundId: string | null;
  horsesState: HorsesStateFromDB | null;
  gameType?: string; // 'horses' or 'ship-captain-crew'
  isPaused?: boolean; // When true, timers freeze and no timeouts are enforced
  decisionTimerSeconds?: number; // Configurable turn timer from game_defaults (default 30)
}

// === DICE ANIMATION TIMING CONSTANTS (SINGLE SOURCE OF TRUTH) ===
// Active player roll mask: how long the "rolling" animation shows in the active window
const HORSES_FIRST_ROLL_ANIMATION_MS = 1300;   // Roll 1: ~1.3s
const HORSES_ROLL_AGAIN_ANIMATION_MS = 1800;   // Rolls 2/3: ~1.8s (was 2500 - too long)
const HORSES_POST_TURN_PAUSE_MS = 3000;        // Pause after lock-in before advancing — must match completedTurnHold duration
// Authoritative animation barrier: minimum time observers must have to see the fly-in.
// The active roller cannot proceed until this time has elapsed from rollStartedAt.
const ROLL_ANIMATION_BARRIER_MS = 1200;         // ~1.2s authoritative minimum
// Local state protection: prevent DB overwrites during animation
const LOCAL_STATE_PROTECTION_MS = HORSES_ROLL_AGAIN_ANIMATION_MS + 200;
const DEFAULT_HORSES_TURN_TIMER_SECONDS = 30;
const BOT_TURN_START_DELAY_MS = 400;           // Bot start delay (was 500)

export function useHorsesMobileController({
  enabled,
  gameId,
  dealerGameId,
  currentHandNumber: propHandNumber,
  players,
  currentUserId,
  pot,
  anteAmount,
  dealerPosition,
  currentRoundId: propRoundId,
  horsesState,
  gameType = 'horses',
  isPaused = false,
  decisionTimerSeconds: configuredTimerSeconds,
}: UseHorsesMobileControllerArgs) {
  // Use configured timer or fallback to default
  const HORSES_TURN_TIMER_SECONDS = configuredTimerSeconds ?? DEFAULT_HORSES_TURN_TIMER_SECONDS;
  // Determine if this is a Ship Captain Crew game
  const isSCC = gameType === 'ship-captain-crew';
  const resolvedGameType = isSCC ? 'ship-captain-crew' : 'horses';

  // ── Phase 2: framework-owned authoritative identity ───────────
  // Dealer-game-scoped feed observes new rounds across boundaries so the
  // client cannot become structurally blind to a forward-advanced hand
  // started by a peer client. Falls back to prop-only mode if no
  // dealerGameId is provided (legacy callers / observers without context).
  const controllerDealerGameId = dealerGameId ?? null;
  const [latchedDealerGameId, setLatchedDealerGameId] = useState<string | null>(controllerDealerGameId);
  const dealerGameScopeChanged = latchedDealerGameId !== controllerDealerGameId;

  const { identity: rawAuthIdentity } = useAuthoritativeIdentity({
    dealerGameId: dealerGameId ?? null,
    enabled: !!dealerGameId,
  });
  const authIdentity = dealerGameScopeChanged ? null : rawAuthIdentity;

  // Monotonic forward-only round/hand identity latch.
  // Parent props are advisory; authoritative identity wins whenever it is
  // forward-of-or-equal. We never regress identity except via explicit reset
  // (handled by framework `identity` config when dealerGameId changes).
  const [monotonicRoundId, setMonotonicRoundId] = useState<string | null>(propRoundId);
  const [monotonicHandNumber, setMonotonicHandNumber] = useState<number>(propHandNumber ?? 1);
  useEffect(() => {
    const propHand = propHandNumber ?? -1;
    const authHand = authIdentity?.handNumber ?? -1;
    const useAuth = authIdentity?.roundId != null && authHand >= propHand;
    const incomingRoundId = useAuth ? authIdentity!.roundId! : propRoundId;
    const incomingHand = Math.max(authHand, propHand, monotonicHandNumber);
    if (!incomingRoundId) return;
    setMonotonicHandNumber((prev) => (incomingHand > prev ? incomingHand : prev));
    setMonotonicRoundId((prev) => {
      if (!prev) return incomingRoundId;
      if (prev === incomingRoundId) return prev;
      const prevIdent: AuthoritativeIdentity = {
        dealerGameId: dealerGameId ?? null,
        handNumber: monotonicHandNumber,
        roundId: prev,
      };
      const nextIdent: AuthoritativeIdentity = {
        dealerGameId: dealerGameId ?? null,
        handNumber: incomingHand,
        roundId: incomingRoundId,
      };
      if (isIdentityForward(prevIdent, nextIdent)) return incomingRoundId;
      // Regression — suppress and log so jitter is observable.
      persistSyncDebugEvent({
        gameId: gameId ?? null,
        gameType: resolvedGameType,
        handNumber: monotonicHandNumber,
        roundId: prev,
        eventType: 'invariant',
        severity: 'warn',
        eventName: 'horses-regressive-identity-suppressed',
        payload: {
          heldRoundId: prev.slice(0, 8),
          rejectedRoundId: incomingRoundId.slice(0, 8),
          heldHand: monotonicHandNumber,
          rejectedHand: incomingHand,
        },
      });
      return prev;
    });
  }, [propRoundId, propHandNumber, authIdentity?.roundId, authIdentity?.handNumber, dealerGameId, monotonicHandNumber, gameId, resolvedGameType]);

  // Aliases: keep existing internal references pointing at the live monotonic identity.
  // eslint-disable-next-line no-param-reassign
  const currentRoundId = dealerGameScopeChanged ? (propRoundId ?? null) : monotonicRoundId;
  const handNumber = dealerGameScopeChanged ? (propHandNumber ?? 1) : monotonicHandNumber;

  // ── Identity-advancement reset (mirror of Cribbage/Gin Phase 2) ──
  // When the dealer-scoped feed detects a forward advance, emit deterministic
  // debug events. The sync framework itself handles presentation/optimistic/
  // freeze reset via the `identity` config passed below.
  const lastObservedIdentityRef = useRef<AuthoritativeIdentity | null>(null);
  useEffect(() => {
    if (!authIdentity) return;
    const prev = lastObservedIdentityRef.current;
    // P0 #2 AUDIT FIX: dedup by roundId so a single round transition can't fire twice
    // when handNumber/dealerGameId also bump in the same forward advance (was amplifying
    // race windows in tie-rollover paths).
    if (prev && prev.roundId === authIdentity.roundId) return;
    lastObservedIdentityRef.current = authIdentity;
    if (!prev) return;
    if (!isIdentityForward(prev, authIdentity)) return;
    const payload = {
      prevHand: prev.handNumber,
      nextHand: authIdentity.handNumber,
      prevRoundId: prev.roundId?.slice(0, 8) ?? null,
      nextRoundId: authIdentity.roundId?.slice(0, 8) ?? null,
    };
    persistSyncDebugEvent({
      gameId: gameId ?? null,
      gameType: resolvedGameType,
      handNumber: authIdentity.handNumber ?? null,
      roundId: authIdentity.roundId ?? null,
      eventType: 'invariant', severity: 'info',
      eventName: 'horses-identity-advanced',
      payload,
    });
    persistSyncDebugEvent({
      gameId: gameId ?? null,
      gameType: resolvedGameType,
      handNumber: authIdentity.handNumber ?? null,
      roundId: authIdentity.roundId ?? null,
      eventType: 'invariant', severity: 'info',
      eventName: 'horses-presentation-reset-on-identity-advance',
      payload,
    });
  }, [authIdentity?.roundId, authIdentity?.handNumber, authIdentity?.dealerGameId, gameId, resolvedGameType]);

  // ── Sync Framework: Full 3-layer model via useGameStateSync ──
  const syncConfig = useMemo<GameStateSyncConfig<HorsesStateFromDB | null>>(() => ({
    getProgress: (state) => getHorsesProgress(state, monotonicHandNumber),
    debugLabel: isSCC ? 'SCC' : 'Horses',
    gameType: resolvedGameType,
    identity: authIdentity,
    describeState: (state) => {
      if (!state) return { state: null };
      const ps = state.playerStates ?? {};
      const completedCount = Object.values(ps).filter(s => s?.isComplete).length;
      return {
        phase: state.gamePhase,
        turn: state.currentTurnPlayerId?.slice(0, 8) ?? null,
        completed: completedCount,
        turnOrderLen: state.turnOrder?.length ?? 0,
      };
    },
    optimisticTimeoutMs: 5000, // generous for dice animations
    isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  }), [isSCC, resolvedGameType, monotonicHandNumber, authIdentity]);

  const syncHandle = useGameStateSync<HorsesStateFromDB | null>(null, syncConfig);

  // Legacy round-boundary reset retained as a defensive belt for callers that
  // do not pass dealerGameId (no auth feed → framework can't reset on its own).
  const prevRoundIdForSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentRoundId !== prevRoundIdForSyncRef.current) {
      prevRoundIdForSyncRef.current = currentRoundId;
      if (!dealerGameId) syncHandle.reset(null);
    }
  }, [currentRoundId, dealerGameId]);

  useEffect(() => {
    if (!dealerGameScopeChanged) return;
    const prevDealerGameId = latchedDealerGameId;
    syncHandle.reset(null);
    setMonotonicRoundId(propRoundId ?? null);
    setMonotonicHandNumber(propHandNumber ?? 1);
    lastObservedIdentityRef.current = null;
    setLatchedDealerGameId(controllerDealerGameId);
    persistSyncDebugEvent({
      gameId: gameId ?? null,
      gameType: resolvedGameType,
      handNumber: propHandNumber ?? null,
      roundId: propRoundId ?? null,
      eventType: 'transition',
      severity: 'info',
      eventName: 'horses-dealer-game-boundary-reset',
      payload: {
        prevDealerGameId: prevDealerGameId?.slice(0, 8) ?? null,
        nextDealerGameId: controllerDealerGameId?.slice(0, 8) ?? null,
        nextRoundId: propRoundId?.slice(0, 8) ?? null,
      },
    });
  }, [dealerGameScopeChanged, latchedDealerGameId, controllerDealerGameId, propRoundId, propHandNumber, gameId, resolvedGameType]);

  // ── Writer-audit gates (Gin Rummy pattern) ──
  // Single framework-owned predicate covering frozen / contract / identity-stale.
  // Mutation entry points short-circuit when these are not satisfied so stale
  // local paths cannot write through to the new round.
  const interactionsAllowed = syncHandle.interactionsAllowed;
  const interactionsAllowedRef = useRef(interactionsAllowed);
  useEffect(() => { interactionsAllowedRef.current = interactionsAllowed; }, [interactionsAllowed]);
  const isIdentityStaleRef = useRef(syncHandle.isIdentityStale);
  useEffect(() => { isIdentityStaleRef.current = syncHandle.isIdentityStale; }, [syncHandle.isIdentityStale]);
  // NOTE: Writer gates now use syncHandle.canInteractNow() directly (synchronous,
  // ref-backed predicate) to avoid the one-render lag that previously suppressed
  // legitimate terminal-roll writes immediately after unfreezePresentation().

  const logSuppressedWrite = useCallback((tag: string, extra?: Record<string, unknown>) => {
    // Full forensic context: decompose every gate the suppression branch checked
    // so we can see WHICH condition actually caused the drop (the two booleans
    // logged previously were the same surface predicates that read "allowed").
    const auth = incomingHorsesStateRef.current;
    const authRoundCurrentTurn = (auth as any)?.currentTurnPlayerId ?? null;
    let canInteract: boolean | null = null;
    let isFrozen: boolean | null = null;
    try { canInteract = syncHandle.canInteractNow(); } catch { /* */ }
    try { isFrozen = syncHandle.isFrozen; } catch { /* */ }
    persistSyncDebugEvent({
      gameId: gameId ?? null,
      gameType: resolvedGameType,
      handNumber: monotonicHandNumber,
      roundId: currentRoundId,
      eventType: 'invariant',
      severity: 'warn',
      eventName: 'horses-stale-action-suppressed',
      payload: {
        tag,
        // Gate decomposition
        interactionsAllowed: interactionsAllowedRef.current,
        isIdentityStale: isIdentityStaleRef.current,
        canInteractNow: canInteract,
        isFrozen,
        // Identity context
        currentRoundId: currentRoundId?.slice(0, 8) ?? null,
        authRoundCurrentTurn: authRoundCurrentTurn?.slice(0, 8) ?? null,
        myPlayerId: null, // populated by call sites that have myPlayer in scope
        clientUserId: currentUserId?.slice(0, 8) ?? null,
        tsClient: Date.now(),
        ...(extra ?? {}),
      },
    });
  }, [gameId, resolvedGameType, monotonicHandNumber, currentRoundId, currentUserId]);

  // Save original prop BEFORE shadowing so receiveAuthoritativeUpdate always gets the real prop.
  // Boundary invariant: `horsesState` has no embedded round identity, so it is only safe to
  // consume while the round row that supplied it (`propRoundId`) matches the controller's
  // resolved authoritative round (`currentRoundId`). During rollover, authoritative identity can
  // advance before the parent round row hydrates; accepting the old terminal state in that window
  // stamps prior-hand completion as the new hand and makes fresh rollover snapshots regressive.
  const incomingHorsesStateRoundMatches = !!(
    !dealerGameScopeChanged &&
    propRoundId &&
    currentRoundId &&
    propRoundId === currentRoundId
  );
  const incomingHorsesState = incomingHorsesStateRoundMatches ? horsesState : null;
  const incomingHorsesStateRef = useRef(horsesState);
  incomingHorsesStateRef.current = incomingHorsesState;
  const currentRoundIdRef = useRef<string | null>(currentRoundId);
  currentRoundIdRef.current = currentRoundId;

  // Feed incoming horsesState prop through the sync framework (uses original prop, not shadow)
  const prevAuthTurnPlayerRef = useRef<string | null>(null);
  const prevAuthRollKeyRef = useRef<Record<string, number>>({});
  const prevAuthRollStartedAtRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!incomingHorsesState) return;
    const beforeTurn = prevAuthTurnPlayerRef.current;
    // P0 #2 FIX: stamp the snapshot with the hand number it actually belongs
    // to (sourced from the authoritative identity / monotonic latch) so the
    // sync framework's progress comparator can discriminate cross-hand
    // updates instead of canceling the handNumber dim via a shared closure.
    const stampedHand = (propHandNumber ?? authIdentity?.handNumber ?? monotonicHandNumber) as number;
    const stampedState: HorsesStateFromDB & { __syncHandNumber?: number } = {
      ...incomingHorsesState,
      __syncHandNumber: stampedHand,
    };
    const result = syncHandle.receiveAuthoritativeUpdate(stampedState);
    const afterTurn = incomingHorsesState.currentTurnPlayerId ?? null;
    // Emit a deterministic event when the authoritative turn owner changes so we
    // can verify the next client receives + presents the handoff without being
    // gated by any local animation freeze.
    if (beforeTurn !== afterTurn) {
      prevAuthTurnPlayerRef.current = afterTurn;
      persistSyncDebugEvent({
        gameId: gameId ?? null,
        gameType: resolvedGameType,
        handNumber: monotonicHandNumber,
        roundId: currentRoundId,
        eventType: 'invariant', severity: 'info',
        eventName: 'horses-auth-turn-handoff-received',
        payload: {
          beforeTurn: beforeTurn?.slice(0, 8) ?? null,
          afterTurn: afterTurn?.slice(0, 8) ?? null,
          accepted: result.accepted,
          reason: result.reason,
          wasFrozenAtWrite: result.wasFrozenAtWrite,
          presentationAction: result.presentationAction,
          stampedHand,
        },
      });
    }

    // INSTRUMENTATION (Defect 1): record every authoritative snapshot arrival
    // for the current turn player whose rollKey changed. Lets us verify whether
    // observers actually receive roll-1/roll-2 snapshots from realtime, or only
    // the terminal roll-3 (coalescing hypothesis).
    if (afterTurn) {
      const ts = (incomingHorsesState.playerStates as any)?.[afterTurn];
      const rollKey = typeof ts?.rollKey === 'number' ? ts.rollKey : null;
      const prevRollKey = prevAuthRollKeyRef.current[afterTurn] ?? null;
      const hasRollStartedAt = !!ts?.rollStartedAt;
      const rollStartedAtAgeMs = ts?.rollStartedAt
        ? Date.now() - new Date(ts.rollStartedAt).getTime()
        : null;

      if (rollKey !== null && rollKey !== prevRollKey) {
        // NEW rollKey arrival
        prevAuthRollKeyRef.current[afterTurn] = rollKey;
        prevAuthRollStartedAtRef.current[afterTurn] = hasRollStartedAt;
        persistSyncDebugEvent({
          gameId: gameId ?? null,
          gameType: resolvedGameType,
          handNumber: monotonicHandNumber,
          roundId: currentRoundId,
          eventType: 'invariant', severity: 'info',
          eventName: 'horses-auth-snapshot-received',
          payload: {
            rollerId: afterTurn.slice(0, 8),
            rollKey,
            prevRollKey,
            rollsRemaining: ts?.rollsRemaining ?? null,
            isComplete: !!ts?.isComplete,
            holdSeq: ts?.holdSeq ?? null,
            diceValues: Array.isArray(ts?.dice) ? ts.dice.map((d: any) => d?.value ?? 0) : null,
            acceptedByFramework: result.accepted,
            wasFrozenAtWrite: result.wasFrozenAtWrite,
            // P0 confirmation: did THIS arrival carry rollStartedAt?
            hasRollStartedAt,
            rollStartedAtAgeMs,
            tsClient: Date.now(),
          },
        });
      } else if (rollKey !== null && rollKey === prevRollKey) {
        // SAME rollKey re-arrival (bookkeeping / lock-in rewrite). Detect the
        // exact moment rollStartedAt disappears from the slot.
        const hadBefore = prevAuthRollStartedAtRef.current[afterTurn] ?? false;
        if (hadBefore && !hasRollStartedAt) {
          prevAuthRollStartedAtRef.current[afterTurn] = false;
          persistSyncDebugEvent({
            gameId: gameId ?? null,
            gameType: resolvedGameType,
            handNumber: monotonicHandNumber,
            roundId: currentRoundId,
            eventType: 'invariant', severity: 'warn',
            eventName: 'horses-auth-rollstartedat-stripped',
            payload: {
              rollerId: afterTurn.slice(0, 8),
              rollKey,
              rollsRemaining: ts?.rollsRemaining ?? null,
              isComplete: !!ts?.isComplete,
              tsClient: Date.now(),
            },
          });
        }
      }
    }
  }, [incomingHorsesState, gameId, currentRoundId, isSCC, resolvedGameType, monotonicHandNumber, authIdentity?.handNumber, propHandNumber]);

  // Terminal state unfreeze: guarantee presentation is never stuck frozen after game/round completion.
  // This overrides any active freeze from dice animations or completedTurnHold timers.
  useEffect(() => {
    const isTerminal = incomingHorsesState?.gamePhase === 'complete';
    if (!isTerminal) return;


    // Clear any active turn-hold timer
    if (completedTurnHoldTimerRef.current) {
      window.clearTimeout(completedTurnHoldTimerRef.current);
      completedTurnHoldTimerRef.current = null;
    }
    setCompletedTurnHold(null);
    syncHandle.unfreezePresentation();
  }, [incomingHorsesState?.gamePhase]);


  // Shadow the parameter: all downstream code reads from presentation state.
  // eslint-disable-next-line no-param-reassign
  horsesState = dealerGameScopeChanged ? null : syncHandle.presentationState;

  // SYNC COMPLIANCE: single presentation-derived identity for effect gating / stale guards / keys.
  // Equals raw currentRoundId only when presentation has actually advanced to that round's state.
  // Raw currentRoundId remains the DB write target after identity gating passes.
  const presentationRoundId = horsesState ? currentRoundId : null;
  
  // Local state for dice rolling animation (only used by the local user when it's their turn)
  // Use union type to support both game types
  const [localHand, setLocalHand] = useState<HorsesHand | SCCHand>(() => 
    isSCC ? createInitialSCCHand() : createInitialHand()
  );
  
  // REF mirror of localHand — always points to the latest value.
  // Critical for handleToggleHold: rapid holds in the same React render frame
  // would otherwise read stale `localHand` from the useCallback closure,
  // causing the second hold to drop the first hold's state.
  //
  // IMPORTANT: Do NOT unconditionally sync from `localHand` on every render.
  // If a debounced hold save is pending, the ref holds the user's latest intent
  // which hasn't been written to DB yet. A DB sync could overwrite `localHand`
  // with stale held state, and then this line would clobber the ref, causing
  // the pending save to write stale data back → unhold appears to not work.
  const localHandRef = useRef<HorsesHand | SCCHand>(localHand);
  // Debounced DB write for hold toggling.
  const holdSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only sync ref from state when no hold save is pending
  if (!holdSaveTimerRef.current) {
    localHandRef.current = localHand;
  }
  
  // Track when we last reset local state for a new turn (prevents stale state blocking sync)
  const lastResetTurnKeyRef = useRef<string | null>(null);
  
  // Track when to show the "No Qualify" animation for SCC games (any player)
  const [showNoQualifyAnimation, setShowNoQualifyAnimation] = useState(false);
  const [noQualifyPlayerName, setNoQualifyPlayerName] = useState<string | null>(null);
  const noQualifyShownForRef = useRef<Set<string>>(new Set());
  
  // Track when to show the "Midnight" animation for SCC games (someone rolls 12)
  const [showMidnightAnimation, setShowMidnightAnimation] = useState(false);
  const [midnightPlayerName, setMidnightPlayerName] = useState<string | null>(null);
  const midnightShownForRef = useRef<Set<string>>(new Set());
  
  const [isRolling, setIsRolling] = useState(false);

  // Bot loop guards (mobile): prevent duplicate bot loops across realtime re-renders,
  // but allow a retry if the loop gets stuck.
  const botProcessingKeyRef = useRef<string | null>(null);
  const botStuckTimerRef = useRef<number | null>(null);

  const initializingRef = useRef(false);

  // Bot animation state - show intermediate dice/holds
  const [botDisplayState, setBotDisplayState] = useState<{
    playerId: string;
    dice: HorsesDieType[];
    rollsRemaining: number;
    isRolling: boolean;
    heldMaskBeforeComplete?: boolean[];
    heldCountBeforeComplete?: number;
    rollKey?: number;
  } | null>(null);

  // OBSERVER DISPLAY STATE: When watching another human player roll, we capture their dice
  // state at the moment of rollKey change and hold it during the animation. This mirrors
  // how botDisplayState works - display state is decoupled from DB updates during animation.
  // This is the key fix for human vs human dice animation issues.
  const [observerDisplayState, setObserverDisplayState] = useState<{
    playerId: string;
    dice: (HorsesDieType | SCCDieType)[];
    rollsRemaining: number;
    isRolling: boolean;
    heldMaskBeforeComplete?: boolean[];
    heldCountBeforeComplete?: number;
    rollKey?: number;
    /** Monotonic within a roll; increments on every hold/unhold. Used to reject stale updates immediately. */
    holdSeq?: number;
    /** Signature of the dice at the moment the rollKey changed (pre-roll snapshot). */
    preRollSig?: string;
  } | null>(null);

  const observerRollingTimerRef = useRef<number | null>(null);
  const lastObservedRollKeyRef = useRef<Record<string, number>>({});
  // Track rollsRemaining at the time of each rollKey to distinguish real roll 3 from bookkeeping bumps
  const lastObservedRollsRemainingRef = useRef<Record<string, number>>({});
  
  // MONOTONICITY GUARD: Track the highest rollKey we've ever seen per player.
  // This prevents processing stale/out-of-order DB updates that arrive with older rollKeys.
  // The key insight: rollKey is a timestamp, so it should only ever increase.
  const maxSeenRollKeyRef = useRef<Record<string, number>>({});
  
  // HOLD SEQUENCE MONOTONICITY: Track the max holdSeq seen per (playerId, rollKey).
  // holdSeq increments on every hold/unhold action, so it should only ever increase.
  // This prevents out-of-order realtime updates from regressing dice state within a roll.
  // Unlike held count, holdSeq correctly handles unhold actions (player can hold 3, then unhold to 2).
  const maxHoldSeqPerRollKeyRef = useRef<Record<string, number>>({});
  
  // Local hold sequence counter - increments on every hold/unhold action
  const localHoldSeqRef = useRef(0);

  // Track when a bot turn is actively being animated - prevents DB/realtime from overwriting display
  // Using state (not ref) so that useMemo for rawFeltDice recalculates when this changes
  const [botTurnActiveId, setBotTurnActiveId] = useState<string | null>(null);

  // TURN COMPLETION HOLD: When a player completes their turn, we hold their dice visible
  // for 3 seconds before transitioning to the next player. This prevents flicker.
  const [completedTurnHold, setCompletedTurnHold] = useState<{
    playerId: string;
    dice: (HorsesDieType | SCCDieType)[];
    result: HorsesHandResult | SCCHandResult;
    heldMaskBeforeComplete?: boolean[];
    heldCountBeforeComplete?: number;
    rollKey?: number;
    expiresAt: number;
  } | null>(null);
  const completedTurnHoldTimerRef = useRef<number | null>(null);
  const lastCompletedTurnKeyRef = useRef<string | null>(null);

  // Sticky cache for felt dice to prevent flicker when realtime state briefly rehydrates
  const lastFeltDiceRef = useRef<{ roundId: string | null; playerId: string | null; value: any } | null>(null);
  const lastFeltDiceAtRef = useRef<number>(0);

  // Prevent DB/realtime rehydration from overwriting the local felt while the user is actively tapping.
  const lastLocalEditAtRef = useRef<number>(0);
  const myTurnKeyRef = useRef<string | null>(null);

  // In-app debug buffer (so we can debug on mobile without relying on console output)
  const [debugEvents, setDebugEvents] = useState<DiceDebugEvent[]>([]);
  const lastPreferDebugKeyRef = useRef<string>("");

  const logDebug = useCallback((tag: string, message: string, data?: unknown) => {
    if (!import.meta.env.DEV) return;
    const evt: DiceDebugEvent = { t: Date.now(), tag, message, data };
    setDebugEvents((prev) => {
      const next = [...prev, evt];
      return next.length > 120 ? next.slice(-120) : next;
    });
  }, []);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
  }, []);

  // Freeze layout at the START of the most recent roll (used when the turn completes)
  const heldMaskAtLastRollStartRef = useRef<boolean[] | null>(null);
  // Changes every roll. Persisted into backend state so other clients can trigger animations.
  const localRollKeyRef = useRef<number>(Date.now());
  // Timer state for turn countdown
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  // Per-turn max time captured from the actual server-granted window
  // (turnDeadline − now at first frame of a new deadline identity).
  // Fixes the visual mismatch where timeLeft (server-driven) > maxTime
  // (stale configured default) on game start when game_defaults.decision_timer_seconds
  // is larger than the client-cached HORSES_TURN_TIMER_SECONDS.
  const [effectiveMaxTime, setEffectiveMaxTime] = useState<number>(HORSES_TURN_TIMER_SECONDS);
  const lastTurnDeadlineRef = useRef<string | null>(null);
  const [turnAnnouncement, setTurnAnnouncement] = useState<string | null>(null);
  const clearAnnouncementTimerRef = useRef<number | null>(null);
  const timeoutProcessedRef = useRef<string | null>(null);


  const activePlayers = useMemo(
    () => players.filter((p) => !p.sitting_out).sort((a, b) => a.position - b.position),
    [players],
  );

  const getTurnOrder = useCallback(() => {
    if (activePlayers.length === 0) return [];

    const dealerIdx = activePlayers.findIndex((p) => p.position === dealerPosition);
    if (dealerIdx === -1) return activePlayers.map((p) => p.id);

    const order: string[] = [];
    for (let i = 1; i <= activePlayers.length; i++) {
      const idx = (dealerIdx + i) % activePlayers.length;
      order.push(activePlayers[idx].id);
    }
    return order;
  }, [activePlayers, dealerPosition]);

  const turnOrder = horsesState?.turnOrder || [];
  const currentTurnPlayerId = horsesState?.currentTurnPlayerId ?? null;
  const currentTurnPlayer = currentTurnPlayerId
    ? players.find((p) => p.id === currentTurnPlayerId) ?? null
    : null;
  const isMyTurn = !!(enabled && currentTurnPlayer?.user_id && currentTurnPlayer.user_id === currentUserId);

  // CRITICAL: Treat state as "waiting" unless the current round has a valid horses_state payload.
  // This prevents showing the previous round's "complete" state / winners while a new hand is spinning up.
  const hasValidState = !!(
    !dealerGameScopeChanged &&
    currentRoundId &&
    horsesState &&
    Array.isArray(horsesState.turnOrder) &&
    horsesState.turnOrder.length > 0
  );
  const gamePhase: HorsesStateFromDB["gamePhase"] = hasValidState ? (horsesState!.gamePhase || "waiting") : "waiting";

  const candidateBotControllerUserId = useMemo(() => {
    if (!turnOrder?.length) return null;
    return (
      turnOrder
        .map((id) => players.find((p) => p.id === id))
        .find((p) => p && !p.is_bot)?.user_id ?? null
    );
  }, [turnOrder, players]);

  const myPlayer = useMemo(
    () => (currentUserId ? players.find((p) => p.user_id === currentUserId) ?? null : null),
    [players, currentUserId],
  );
  const myState = myPlayer ? horsesState?.playerStates?.[myPlayer.id] ?? null : null;

  const getPlayerUsername = useCallback(
    (player: HorsesPlayerForController) => {
      if (player.is_bot) return getBotAlias(players as any, player.user_id);
      return player.profiles?.username || `Player ${player.position}`;
    },
    [players],
  );

  // Sync local hand with DB state when it's my turn
  useEffect(() => {
    if (!enabled) return;

    if (!isMyTurn) {
      myTurnKeyRef.current = null;
      return;
    }

    const myKey = `${currentRoundId ?? "no-round"}:${currentTurnPlayerId ?? "no-turn"}`;
    
    // CRITICAL FIX: When turn identity changes (new round or turn came back to us),
    // reset local state immediately to accept the fresh DB state.
    // This fixes the "frozen on rollover" bug where stale local state blocked sync.
    const isNewTurn = myTurnKeyRef.current !== myKey;
    if (isNewTurn) {
      myTurnKeyRef.current = myKey;
      lastResetTurnKeyRef.current = myKey;
      lastLocalEditAtRef.current = 0; // Clear protection window for fresh turn
      heldMaskAtLastRollStartRef.current = null;
      timeoutProcessedRef.current = null; // Clear timeout lock for new turn
      
      // Reset to fresh hand immediately - DB state will sync in below
      const freshHand = isSCC ? createInitialSCCHand() : createInitialHand();
      setLocalHand(freshHand);
    }

    // While rolling (and shortly after interactions), don't let DB snapshots overwrite the felt.
    if (isRolling) {
      return;
    }

    // If the user just interacted, don't let a stale DB snapshot overwrite their felt.
    // Must exceed the longest animation duration to prevent flicker during roll animations.
    const timeSinceEdit = Date.now() - lastLocalEditAtRef.current;
    if (timeSinceEdit < LOCAL_STATE_PROTECTION_MS && lastLocalEditAtRef.current > 0) {
      console.log(
        `[SYNC_DEBUG] Blocked sync: within protection window (${timeSinceEdit}ms < ${LOCAL_STATE_PROTECTION_MS}ms)`,
      );
      return;
    }

    if (myState) {
      // Extra guard: even after the time window, ignore DB snapshots that are clearly behind local.
      // This prevents "dice disappear" / "dice jump back" flashes when realtime/queries deliver an older state.
      // BUT: Skip these guards if this is a fresh turn (isNewTurn) - we need to accept fresh DB state.
      const localRollsRemaining = localHand.rollsRemaining;
      const dbRollsRemaining = myState.rollsRemaining;
      const dbDiceBlank = Array.isArray(myState.dice) && myState.dice.every((d: any) => !d?.value);
      const localDiceBlank =
        Array.isArray((localHand as any)?.dice) && (localHand as any).dice.every((d: any) => !d?.value);

      // Only apply these guards if we've been in this turn for a while (not a fresh turn)
      if (!isNewTurn && lastLocalEditAtRef.current > 0) {
        if (typeof dbRollsRemaining === "number" && dbRollsRemaining > localRollsRemaining) {
          console.log(
            `[SYNC_DEBUG] Blocked sync: dbRollsRemaining(${dbRollsRemaining}) > localRollsRemaining(${localRollsRemaining})`,
          );
          return;
        }
        if (dbDiceBlank && !localDiceBlank) {
          return;
        }

        // CRITICAL: If DB reports the same rollsRemaining but the dice don't match local, it's an out-of-order snapshot.
        // Never apply that to local UI (it causes the "dice switched" flicker). Wait until DB matches local,
        // but cap the wait so we can recover from a real desync.
        const dbMatchesLocal =
          Array.isArray(myState.dice) &&
          Array.isArray((localHand as any)?.dice) &&
          myState.dice.length === (localHand as any).dice.length &&
          myState.dice.every((d: any, i: number) => {
            const l = (localHand as any).dice[i];
            return (
              (d?.value ?? 0) === (l?.value ?? 0) &&
              !!d?.isHeld === !!l?.isHeld &&
              (!!d?.isSCC === !!l?.isSCC)
            );
          });

        if (
          typeof dbRollsRemaining === "number" &&
          dbRollsRemaining === localRollsRemaining &&
          !dbMatchesLocal &&
          !localDiceBlank &&
          timeSinceEdit < 10_000
        ) {
          console.log(
            `[SYNC_DEBUG] Blocked sync: dbMismatch (same rollsRemaining=${dbRollsRemaining}) timeSinceEdit=${timeSinceEdit}ms`,
          );
          return;
        }
      }

      const dbVals = (myState.dice as any[]).map((d: any) => d?.value).join(",");
      const localVals = (localHand.dice as any[]).map((d: any) => d?.value).join(",");
      console.log(
        `[SYNC_DEBUG] *** APPLYING DB STATE *** dbDice=[${dbVals}], dbRollsRemaining=${dbRollsRemaining}`,
      );

      // For SCC, reconstruct the full hand with hasShip/hasCaptain/hasCrew flags
      if (isSCC) {
        setLocalHand(
          reconstructSCCHand(myState.dice as SCCDieType[], myState.rollsRemaining, myState.isComplete),
        );
      } else {
        setLocalHand({
          dice: myState.dice,
          rollsRemaining: myState.rollsRemaining,
          isComplete: myState.isComplete,
        });
      }
    }
  }, [
    enabled,
    isMyTurn,
    currentRoundId,
    currentTurnPlayerId,
    myState?.rollsRemaining,
    myState?.isComplete,
    myState?.dice,
    localHand.rollsRemaining,
    localHand.dice,
    isRolling,
    isSCC,
    logDebug,
  ]);

  // Clear bot display state when turn changes to a non-bot (prevents dice flash)
  useEffect(() => {
    if (botDisplayState && botDisplayState.playerId !== currentTurnPlayerId) {
      setBotDisplayState(null);
    }
  }, [currentTurnPlayerId, currentTurnPlayer?.is_bot]);

  const completedResults = useMemo(
    () =>
      hasValidState
        ? Object.entries(horsesState?.playerStates || {})
            .filter(([_, state]) => state.isComplete && state.result)
            .map(([playerId, state]) => ({ playerId, result: state.result! }))
        : [],
    [horsesState?.playerStates, hasValidState],
  );

  const currentWinningResult = useMemo(() => {
    if (completedResults.length === 0) return null;
    return completedResults.reduce((best, curr) =>
      curr.result.rank > best.result.rank ? curr : best,
    ).result;
  }, [completedResults]);

  const winningPlayerIds = useMemo(() => {
    if (completedResults.length === 0 || gamePhase !== "complete") return [] as string[];
    // Use appropriate winner determination based on game type
    if (isSCC) {
      return determineSCCWinners(completedResults.map((r) => r.result as SCCHandResult)).map(
        (i) => completedResults[i].playerId,
      );
    }
    return determineWinners(completedResults.map((r) => r.result as HorsesHandResult)).map(
      (i) => completedResults[i].playerId,
    );
  }, [completedResults, gamePhase, isSCC]);

  // Refs for latest values so bot loop can read them without re-triggering the effect
  const horsesStateRef = useRef(horsesState);
  const currentWinningResultRef = useRef<HorsesHandResult | SCCHandResult | null>(currentWinningResult);
  const candidateBotControllerUserIdRef = useRef(candidateBotControllerUserId);

  // Keep refs updated
  useEffect(() => {
    horsesStateRef.current = horsesState;
  }, [horsesState]);
  useEffect(() => {
    currentWinningResultRef.current = currentWinningResult;
  }, [currentWinningResult]);
  useEffect(() => {
    candidateBotControllerUserIdRef.current = candidateBotControllerUserId;
  }, [candidateBotControllerUserId]);

  useEffect(() => {
    if (!enabled) return;
    if (!currentRoundId || !gameId) return;
    if (horsesState?.turnOrder?.length) return;
    if (initializingRef.current) return;
    if (activePlayers.length === 0) return;

    initializingRef.current = true;

    const initializeGame = async () => {
      try {
        // CRITICAL: Never initialize based on a possibly-stale local horsesState snapshot.
        // If another client already initialized, our local state may briefly be empty while
        // realtime catches up. Re-initializing would overwrite live playerStates and cause
        // observers to see held dice revert (held → scatter → held).
        const { data: roundRow, error: roundErr } = await supabase
          .from("rounds")
          .select("horses_state")
          .eq("id", currentRoundId)
          .single();

        if (roundErr) {
          console.warn("[HORSES] init: failed to fetch current state, aborting init", roundErr);
          return;
        }

        const existingState = (roundRow as any)?.horses_state as HorsesStateFromDB | null | undefined;
        const existingTurnOrder = (existingState as any)?.turnOrder;
        if (Array.isArray(existingTurnOrder) && existingTurnOrder.length > 0) {
          return;
        }

        const order = getTurnOrder();

        const controllerUserId =
          order
            .map((id) => activePlayers.find((p) => p.id === id))
            .find((p) => p && !p.is_bot)?.user_id ?? null;

        // Deterministic single-writer: only the chosen controller should initialize.
        // Prevents multiple clients from racing and overwriting horses_state.
        if (controllerUserId && currentUserId && controllerUserId !== currentUserId) {
          return;
        }

      // Set deadline for the first player's turn (skip for bots)
      const firstPlayer = activePlayers.find((p) => p.id === order[0]);
      const deadline = firstPlayer?.is_bot
        ? null
        : new Date(Date.now() + HORSES_TURN_TIMER_SECONDS * 1000).toISOString();

      const initialState: HorsesStateFromDB = {
        currentTurnPlayerId: order[0] ?? null,
        playerStates: {},
        gamePhase: "playing",
        turnOrder: order,
        botControllerUserId: controllerUserId,
        turnDeadline: deadline,
      };

      order.forEach((playerId) => {
        // Initialize with appropriate hand type based on game
        const initHand = isSCC ? createInitialSCCHand() : createInitialHand();
        initialState.playerStates[playerId] = {
          dice: initHand.dice as any,
          rollsRemaining: initHand.rollsRemaining,
          isComplete: false,
        };
      });

        const error = await updateHorsesState(currentRoundId, initialState);
        if (error) console.error("[HORSES] Failed to initialize state:", error);
      } finally {
        initializingRef.current = false;
      }
    };

    void initializeGame();
  }, [enabled, currentRoundId, gameId, horsesState?.turnOrder?.length, activePlayers.length, getTurnOrder, currentUserId]);

  // Recovery: if gamePhase is "playing" but currentTurnPlayerId is null/missing and we have turnOrder,
  // re-initialize the current turn to the first incomplete player
  const stuckRecoveryKeyRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!enabled) return;
    if (!currentRoundId || !gameId) return;
    if (gamePhase !== "playing") return;
    if (currentTurnPlayerId) return; // Not stuck - there's a current player
    if (!turnOrder.length) return; // No turn order yet - init effect will handle
    if (!currentUserId) return;
    
    // Only let one client (bot controller or first human) attempt recovery
    const iAmController = candidateBotControllerUserId === currentUserId;
    if (!iAmController) return;
    
    const key = `recovery:${currentRoundId}`;
    if (stuckRecoveryKeyRef.current === key) return;
    stuckRecoveryKeyRef.current = key;
    
    console.warn("[HORSES] Detected stuck game - attempting recovery", { currentRoundId, turnOrder });

    // ALWAYS persist this invariant — stuck state is a real bug signal
    import("@/lib/persistSyncDebugEvent").then(({ persistInvariantViolation }) => {
      persistInvariantViolation(
        gameId,
        isSCC ? "ship-captain-crew" : "horses",
        horsesState?.turnOrder?.length ?? 0,
        "stuck-null-turn",
        {
          currentRoundId,
          turnOrderLength: turnOrder.length,
          gamePhase,
          playerStatesKeys: Object.keys(horsesState?.playerStates ?? {}),
          completedPlayers: Object.entries(horsesState?.playerStates ?? {})
            .filter(([, s]: [string, any]) => s?.isComplete)
            .map(([id]) => id.slice(0, 8)),
        },
      );
    }).catch(() => {});
    
    const recover = async () => {
      // CRITICAL: Use the latest persisted horses_state as the base for recovery.
      // Spreading a stale in-memory horsesState snapshot can clobber just-updated holds,
      // which shows up to observers as held dice briefly reverting to the scatter area.
      const { data: roundRow, error: roundErr } = await supabase
        .from("rounds")
        .select("horses_state")
        .eq("id", currentRoundId)
        .single();

      if (roundErr) {
        console.warn("[HORSES] recovery: failed to fetch current state, aborting", roundErr);
        return;
      }

      const latestState = (roundRow as any)?.horses_state as HorsesStateFromDB | null | undefined;
      const baseState = latestState && typeof latestState === "object" ? latestState : horsesState;
      if (!baseState) return;

      const latestTurnOrder = Array.isArray(baseState.turnOrder) ? baseState.turnOrder : turnOrder;
      const latestPlayerStates = (baseState.playerStates ?? {}) as Record<string, any>;

      // Find the first player who hasn't completed their turn
      const nextPlayerId = latestTurnOrder.find((pid) => !latestPlayerStates?.[pid]?.isComplete);
      
      if (!nextPlayerId) {
        // Everyone is complete - set to complete phase
        await updateHorsesState(currentRoundId, {
          ...baseState,
          currentTurnPlayerId: null,
          gamePhase: "complete",
        });
      } else {
        // Set the next incomplete player as current
        await updateHorsesState(currentRoundId, {
          ...baseState,
          currentTurnPlayerId: nextPlayerId,
          gamePhase: "playing",
        });
      }
    };
    
    // Small delay to avoid race with normal initialization
    const t = window.setTimeout(recover, 1000);
    return () => window.clearTimeout(t);
  }, [
    enabled,
    currentRoundId,
    gameId,
    gamePhase,
    currentTurnPlayerId,
    turnOrder,
    horsesState,
    currentUserId,
    candidateBotControllerUserId,
  ]);

  const saveMyState = useCallback(
    async (
      hand: HorsesHand | SCCHand,
      completed: boolean,
      result?: HorsesHandResult | SCCHandResult,
      heldMaskBeforeComplete?: boolean[],
      rollAnimationMeta?: { rollStartedAt: string; rollAnimationMinEndAt: string },
    ) => {
      if (!enabled) return;
      if (!currentRoundId || !myPlayer) return;
      if (!syncHandle.canInteractNow()) {
        logSuppressedWrite('saveMyState');
        return;
      }

      const heldCountBeforeComplete = Array.isArray(heldMaskBeforeComplete)
        ? heldMaskBeforeComplete.filter(Boolean).length
        : undefined;

      const newPlayerState: HorsesPlayerDiceState = {
        dice: hand.dice as any,
        rollsRemaining: hand.rollsRemaining,
        isComplete: completed,
        result,
        heldMaskBeforeComplete,
        heldCountBeforeComplete,
        rollKey: localRollKeyRef.current,
        holdSeq: localHoldSeqRef.current,
        ...(rollAnimationMeta ? {
          rollStartedAt: rollAnimationMeta.rollStartedAt,
          rollAnimationMinEndAt: rollAnimationMeta.rollAnimationMinEndAt,
        } : {}),
      };

      // INSTRUMENTATION (Defect 1): record every roller write so we can correlate
      // against observer realtime receive + fly-in trigger decisions.
      persistSyncDebugEvent({
        gameId: gameId ?? null,
        gameType: resolvedGameType,
        handNumber: monotonicHandNumber,
        roundId: currentRoundId,
        eventType: 'invariant', severity: 'info',
        eventName: 'horses-roller-write',
        payload: {
          playerId: myPlayer.id.slice(0, 8),
          clientUserId: currentUserId?.slice(0, 8) ?? null,
          currentTurnPlayerIdAtWrite: (incomingHorsesStateRef.current as any)?.currentTurnPlayerId?.slice(0, 8) ?? null,
          rollKey: localRollKeyRef.current,
          rollsRemaining: hand.rollsRemaining,
          isComplete: completed,
          holdSeq: localHoldSeqRef.current,
          diceValues: (hand.dice as any[]).map((d: any) => d?.value ?? 0),
          heldMask: (hand.dice as any[]).map((d: any) => !!d?.isHeld),
          tsClient: Date.now(),
          hasAnimMeta: !!rollAnimationMeta,
        },
      });

      return await horsesSetPlayerState(currentRoundId, myPlayer.id, newPlayerState);
    },
    [enabled, currentRoundId, myPlayer],
  );

  const advanceToNextTurn = useCallback(
    async (expectedCurrentPlayerId?: string | null) => {
      if (!enabled) return;
      if (!currentRoundId) return;
      if (!syncHandle.canInteractNow()) {
        logSuppressedWrite('advanceToNextTurn');
        return;
      }

      const expected = expectedCurrentPlayerId ?? horsesState?.currentTurnPlayerId;
      if (!expected) return;

      const newState = await horsesAdvanceTurn(currentRoundId, expected);
      
      // NOTE: The horses_advance_turn RPC now atomically sets turnDeadline for the next player.
      // No need for follow-up update - the RPC handles it to prevent race conditions.
      if (newState?.currentTurnPlayerId && newState.gamePhase === "playing") {
      }
    },
    [enabled, currentRoundId, horsesState?.currentTurnPlayerId, players],
  );

  // Freeze guard: if a player finished but their client never advanced the turn (or a timeout was dropped),
  // the hand can stall. Allow the turn-owner OR the deterministic "bot controller" client to advance.
  const stuckAdvanceKeyRef = useRef<string | null>(null);

  const currentTurnState = useMemo(() => {
    if (!currentTurnPlayerId) return null;
    return horsesState?.playerStates?.[currentTurnPlayerId] ?? null;
  }, [horsesState?.playerStates, currentTurnPlayerId]);

  // Announcement effect: when a player's turn completes, show a dealer-style banner (NOT a toast)
  const announcedTurnsRef = useRef<Set<string>>(new Set());

  // Always clear the pending announcement timer on unmount.
  useEffect(() => {
    return () => {
      if (clearAnnouncementTimerRef.current) {
        window.clearTimeout(clearAnnouncementTimerRef.current);
        clearAnnouncementTimerRef.current = null;
      }
      if (completedTurnHoldTimerRef.current) {
        window.clearTimeout(completedTurnHoldTimerRef.current);
        completedTurnHoldTimerRef.current = null;
      }
      if (observerRollingTimerRef.current) {
        window.clearTimeout(observerRollingTimerRef.current);
        observerRollingTimerRef.current = null;
      }
    };
  }, []);

  // BOUNDARY HYGIENE: Hard-reset every per-round latch, overlay and cache on
  // currentRoundId change. This is the single source of truth for round-boundary
  // resets — any per-round ref/state added later MUST be cleared here so a stale
  // value from the previous round cannot mask the new round's UI / suppress
  // interaction (e.g. SCC tie-rollover stall: previous round's completedTurnHold
  // + observerDisplayState + heldMaskAtLastRollStartRef surviving caused the new
  // round to render with prior badges and no Roll Now button).
  const boundaryCleanupRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentRoundId === boundaryCleanupRoundRef.current) return;
    const prevRoundId = boundaryCleanupRoundRef.current;
    boundaryCleanupRoundRef.current = currentRoundId;

    // Monotonic / per-player observer refs.
    lastObservedRollKeyRef.current = {};
    lastObservedRollsRemainingRef.current = {};
    maxSeenRollKeyRef.current = {};
    maxHoldSeqPerRollKeyRef.current = {};

    // Felt + announcement / advance latches.
    lastFeltDiceRef.current = null;
    lastFeltDiceAtRef.current = 0;
    lastCompletedTurnKeyRef.current = null;
    announcedTurnsRef.current = new Set();
    stuckAdvanceKeyRef.current = null;
    noQualifyShownForRef.current = new Set();
    midnightShownForRef.current = new Set();

    // Roller-local roll bookkeeping (carrying prior held mask into a new round
    // pollutes the first roll's heldCountBeforeComplete derivation).
    heldMaskAtLastRollStartRef.current = null;
    // Force local-hand reset path to re-evaluate against the new round identity.
    lastResetTurnKeyRef.current = null;

    // P1 FIX (Wave 2F.3 smoke): `localHand` sources the active roller's felt
    // dice. Without resetting it here, switching dealer games (e.g. Horses →
    // SCC) leaves the prior game's dice in `localHand` for the 1–2 frames
    // between the new round-id arriving and `isMyTurn` re-evaluating true on
    // the new round — producing a brief stale-dice flash for the active roller
    // only. The `isMyTurn` effect (L796) still re-syncs DB state in
    // immediately; this just guarantees the carryover never paints.
    const freshBoundaryHand = isSCC ? createInitialSCCHand() : createInitialHand();
    setLocalHand(freshBoundaryHand);
    localHandRef.current = freshBoundaryHand;

    // Display overlays — must drop together with refs above so DiceTableLayout
    // does not re-cache the previous round's terminal frame.
    setObserverDisplayState(null);
    setBotDisplayState(null);
    setCompletedTurnHold(null);
    setBotTurnActiveId(null);

    // Animation timers tied to the previous round.
    if (completedTurnHoldTimerRef.current) {
      window.clearTimeout(completedTurnHoldTimerRef.current);
      completedTurnHoldTimerRef.current = null;
    }
    if (observerRollingTimerRef.current) {
      window.clearTimeout(observerRollingTimerRef.current);
      observerRollingTimerRef.current = null;
    }

    // SAFETY: Ensure presentation is unfrozen at round boundaries.
    if (syncHandle.isFrozen) {
      syncHandle.unfreezePresentation();
    }

    persistSyncDebugEvent({
      gameId: gameId ?? null,
      gameType: resolvedGameType,
      handNumber: monotonicHandNumber,
      roundId: currentRoundId,
      eventType: 'invariant', severity: 'info',
      eventName: 'horses-round-boundary-reset',
      payload: {
        prevRoundId: prevRoundId?.slice(0, 8) ?? null,
        nextRoundId: currentRoundId?.slice(0, 8) ?? null,
        wasFrozen: syncHandle.isFrozen,
      },
    });
  }, [currentRoundId]);

  // TURN COMPLETION HOLD EFFECT: When a player completes their turn, capture their dice state
  // and hold it visible for 3 seconds. This creates a smooth transition without flicker.
  useEffect(() => {
    if (!enabled || gamePhase !== "playing") return;
    if (!presentationRoundId || !currentTurnPlayerId) return;
    if (!currentTurnState?.isComplete || !currentTurnState?.result) return;

    const holdKey = `${presentationRoundId}:${currentTurnPlayerId}`;
    if (lastCompletedTurnKeyRef.current === holdKey) return; // Already holding this turn
    lastCompletedTurnKeyRef.current = holdKey;

    // Capture the completed player's dice state for the hold period
    const holdDuration = 3000; // 3 seconds to display dice before transition
    const expiresAt = Date.now() + holdDuration;

    // FIX #3: Derive heldCountBeforeComplete directly from the dice array
    // Don't trust (currentTurnState as any).heldCountBeforeComplete which can be stale/mismatched
    const derivedHeldCount = (currentTurnState.dice as any[]).filter((d: any) => !!d?.isHeld).length;

    const holdPayload = {
      playerId: currentTurnPlayerId,
      dice: currentTurnState.dice as (HorsesDieType | SCCDieType)[],
      result: currentTurnState.result,
      heldMaskBeforeComplete: currentTurnState.heldMaskBeforeComplete,
      heldCountBeforeComplete: derivedHeldCount,
      // Pass the rollKey so DiceTableLayout maintains consistent state during the hold.
      // The observer logic now correctly distinguishes roll-3 from bookkeeping bumps,
      // so the fly-in won't refire during the hold period.
      rollKey: (currentTurnState as any).rollKey,
      expiresAt,
    };


    setCompletedTurnHold(holdPayload);

    // NOTE: presentation is NOT frozen here. The completedTurnHold overlay is rendered
    // above presentation and is scoped to (playerId, rollKey), so it masks only the
    // completing player's dice area while authoritative turn-handoff snapshots (e.g.
    // horses_advance_turn results) continue to propagate to presentation underneath.
    // Freezing here previously stalled the next client's "Roll Now" handoff for 3s.
    persistSyncDebugEvent({
      gameId: gameId ?? null,
      gameType: resolvedGameType,
      handNumber: monotonicHandNumber,
      roundId: presentationRoundId,
      eventType: 'invariant', severity: 'info',
      eventName: 'horses-completed-turn-hold-overlay-only',
      payload: {
        completingPlayerId: currentTurnPlayerId?.slice(0, 8) ?? null,
        rollKey: (currentTurnState as any).rollKey ?? null,
        holdDurationMs: holdDuration,
      },
    });

    // Clear the hold after the duration
    if (completedTurnHoldTimerRef.current) {
      window.clearTimeout(completedTurnHoldTimerRef.current);
    }
    completedTurnHoldTimerRef.current = window.setTimeout(() => {
      setCompletedTurnHold(null);
      // FIX: Also clear observerDisplayState for this player to prevent rawFeltDice from
      // falling back to stale observer/DB state, which causes the result badge to flicker
      // (badge → stale dice briefly → badge again).
      setObserverDisplayState((prev) => {
        if (prev?.playerId === currentTurnPlayerId) return null;
        return prev;
      });
      completedTurnHoldTimerRef.current = null;
    }, holdDuration);
  }, [
    enabled,
    gamePhase,
    presentationRoundId,
    currentTurnPlayerId,
    currentTurnState?.isComplete,
    currentTurnState?.result,
  ]);

  useEffect(() => {
    if (!enabled || gamePhase !== "playing") return;
    if (!presentationRoundId || !currentTurnPlayerId || !currentTurnPlayer) return;
    if (!currentTurnState?.isComplete || !currentTurnState?.result) return;


    const announceKey = `${presentationRoundId}:${currentTurnPlayerId}`;
    if (announcedTurnsRef.current.has(announceKey)) return;
    announcedTurnsRef.current.add(announceKey);

    const playerName = getPlayerUsername(currentTurnPlayer);
    setTurnAnnouncement(`${playerName} rolled ${currentTurnState.result.description}!`);

    // IMPORTANT: do NOT clear this timeout in the effect cleanup, otherwise the banner can persist
    // forever when the turn advances (deps change triggers cleanup before the timeout fires).
    if (clearAnnouncementTimerRef.current) {
      window.clearTimeout(clearAnnouncementTimerRef.current);
    }
    clearAnnouncementTimerRef.current = window.setTimeout(() => {
      setTurnAnnouncement(null);
      clearAnnouncementTimerRef.current = null;
    }, 2500);
  }, [
    enabled,
    gamePhase,
    presentationRoundId,
    currentTurnPlayerId,
    currentTurnPlayer,
    currentTurnState?.isComplete,
    currentTurnState?.result,
    getPlayerUsername,
  ]);

  // INVARIANT: Detect when ALL players are isComplete but gamePhase is still 'playing'.
  // This always persists (no debug flag) because it's a real stuck-state signal.
  const stuckAllCompleteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !presentationRoundId || !gameId) return;
    if (gamePhase !== "playing") return;
    const states = horsesState?.playerStates;
    const order = horsesState?.turnOrder;
    if (!states || !order || order.length === 0) return;

    const allComplete = order.every((pid) => states[pid]?.isComplete);
    if (!allComplete) return;

    const key = `allComplete:${presentationRoundId}`;
    if (stuckAllCompleteKeyRef.current === key) return;
    stuckAllCompleteKeyRef.current = key;

    console.error("[sync-invariant] ❌ horses::stuck-all-complete — gamePhase is 'playing' but every player isComplete", {
      currentRoundId: presentationRoundId,
      currentTurnPlayerId,
      turnOrder: order.map(id => id.slice(0, 8)),
    });

    import("@/lib/persistSyncDebugEvent").then(({ persistInvariantViolation }) => {
      persistInvariantViolation(
        gameId,
        isSCC ? "ship-captain-crew" : "horses",
        order.length,
        "stuck-all-complete",
        {
          currentRoundId: presentationRoundId,
          currentTurnPlayerId: currentTurnPlayerId?.slice(0, 8) ?? null,
          turnOrderLength: order.length,
          gamePhase,
        },
      );
    }).catch(() => {});
  }, [enabled, presentationRoundId, gameId, gamePhase, horsesState?.playerStates, horsesState?.turnOrder, currentTurnPlayerId, isSCC]);

  // Only show the overlay to the player who rolled no qualify, not to spectators.
  //
  // CRITICAL: read from `incomingHorsesState` (authoritative) — NOT presentationState.
  // Presentation can briefly show stale `isComplete + !isQualified` from the previous round
  // after a rollover advances currentRoundId, which previously caused the overlay to re-fire
  // (loop) once per rollover. Authoritative state is fresh as soon as the new round is created.
  useEffect(() => {
    if (!enabled || !isSCC) return;
    if (!currentRoundId) return;
    if (!myPlayer) return;

    const authState = incomingHorsesStateRef.current;
    const myPlayerState = authState?.playerStates?.[myPlayer.id];
    if (!myPlayerState?.isComplete || !myPlayerState?.result) return;

    const result = myPlayerState.result as SCCHandResult;
    if (!result.isQualified) {
      const noQualifyKey = `${currentRoundId}:${myPlayer.id}`;
      if (noQualifyShownForRef.current.has(noQualifyKey)) return;

      noQualifyShownForRef.current.add(noQualifyKey);

      // Show animation for the current user (no need for player name since it's them)
      setNoQualifyPlayerName(null);
      setShowNoQualifyAnimation(true);
    }
  }, [
    enabled,
    isSCC,
    currentRoundId,
    myPlayer,
    incomingHorsesState?.playerStates?.[myPlayer?.id ?? ""]?.isComplete,
    (incomingHorsesState?.playerStates?.[myPlayer?.id ?? ""] as any)?.result?.isQualified,
  ]);

  // Handler to reset the no qualify animation
  const handleNoQualifyAnimationComplete = useCallback(() => {
    setShowNoQualifyAnimation(false);
    setNoQualifyPlayerName(null);
  }, []);

  // Detect when ANY player's SCC hand is complete and they rolled Midnight (cargo = 12)
  useEffect(() => {
    if (!enabled || !isSCC) return;
    if (!presentationRoundId) return;
    
    const playerStates = horsesState?.playerStates;
    if (!playerStates) return;
    
    for (const [playerId, state] of Object.entries(playerStates)) {
      if (!state.isComplete || !state.result) continue;
      
      const result = state.result as SCCHandResult;
      // Midnight = qualified with cargo of 12 (highest possible)
      if (result.isQualified && result.cargoSum === 12) {
        const midnightKey = `${presentationRoundId}:${playerId}`;
        if (midnightShownForRef.current.has(midnightKey)) continue;
        
        midnightShownForRef.current.add(midnightKey);
        
        const player = players.find(p => p.id === playerId);
        const playerName = player ? getPlayerUsername(player) : null;
        
        setMidnightPlayerName(playerName);
        setShowMidnightAnimation(true);
        break;
      }
    }
  }, [enabled, isSCC, presentationRoundId, horsesState?.playerStates, players, getPlayerUsername]);

  // Handler to reset the midnight animation
  const handleMidnightAnimationComplete = useCallback(() => {
    setShowMidnightAnimation(false);
    setMidnightPlayerName(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (gamePhase !== "playing") return;
    if (!presentationRoundId || !currentTurnPlayerId) return;

    if (!currentTurnState?.isComplete) return;

    // Bot turns already have their own "stuck advance" logic in the bot loop.
    if (currentTurnPlayer?.is_bot) return;

    const iAmTurnOwner = currentTurnPlayer?.user_id === currentUserId;
    const iAmController = candidateBotControllerUserId === currentUserId;
    if (!iAmTurnOwner && !iAmController) return;

    const key = `${presentationRoundId}:${currentTurnPlayerId}`;
    if (stuckAdvanceKeyRef.current === key) return;
    stuckAdvanceKeyRef.current = key;

    const allPlayersComplete = turnOrder.length > 0 && turnOrder.every(
      (playerId) => horsesState?.playerStates?.[playerId]?.isComplete,
    );

    // Capture raw round id for DB write targets after identity gating passes.
    const writeRoundId = currentRoundId;

    const t = window.setTimeout(() => {
      if (!syncHandle.canInteractNow()) {
        logSuppressedWrite('stuckAdvance-forceComplete-or-advance');
        return;
      }
      if (allPlayersComplete) {
        void (async () => {
          if (!writeRoundId) return;
          const { data: roundRow } = await supabase
            .from("rounds")
            .select("horses_state")
            .eq("id", writeRoundId)
            .single();

          const latestState = (roundRow as any)?.horses_state as HorsesStateFromDB | null;
          if (!latestState) return;

          await updateHorsesState(writeRoundId, {
            ...latestState,
            currentTurnPlayerId: null,
            gamePhase: "complete",
          });
        })();
        return;
      }

      void advanceToNextTurn(currentTurnPlayerId);
    }, HORSES_POST_TURN_PAUSE_MS);

    return () => window.clearTimeout(t);
  }, [
    enabled,
    gamePhase,
    presentationRoundId,
    currentRoundId,
    currentTurnPlayerId,
    currentTurnState?.isComplete,
    currentTurnPlayer?.is_bot,
    currentTurnPlayer?.user_id,
    currentUserId,
    candidateBotControllerUserId,
    advanceToNextTurn,
    turnOrder,
    horsesState?.playerStates,
  ]);

  // Timer countdown effect - calculate time remaining from deadline
  // NOTE: If no server deadline is present yet, we still show a local countdown for UI,
  // but we DO NOT process timeouts unless a real deadline exists.
  // CRITICAL FIX: We ONLY set timeLeft=0 after a gradual countdown, never immediately on mount.
  // This prevents false timeouts when mounting with a stale deadline from a previous turn.
  useEffect(() => {
    // Don't run timer when paused - time freezes
    if (!enabled || gamePhase !== "playing" || !currentTurnPlayerId || isPaused) {
      setTimeLeft(null);
      return;
    }

    // Bots don't need a visible timer
    if (currentTurnPlayer?.is_bot) {
      setTimeLeft(null);
      return;
    }

    // Players in auto-roll mode don't need a visible timer - bot loop handles them
    if (currentTurnPlayer?.auto_fold) {
      setTimeLeft(null);
      return;
    }

    const deadline = horsesState?.turnDeadline;

    // Fallback UI countdown when older rounds/clients don't provide a turnDeadline yet.
    if (!deadline) {
      setTimeLeft(HORSES_TURN_TIMER_SECONDS);
      const interval = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null) return HORSES_TURN_TIMER_SECONDS;
          return Math.max(0, prev - 1);
        });
      }, 1000);
      return () => window.clearInterval(interval);
    }

    const deadlineTime = new Date(deadline).getTime();
    const now = Date.now();
    const initialRemaining = Math.max(0, Math.ceil((deadlineTime - now) / 1000));

    // Capture maxTime from the actual deadline window on first frame of a new
    // turnDeadline identity. Guarantees timeLeft ≤ maxTime so the visual bar
    // doesn't render 59/30. Mirrors the card-game path in Game.tsx (~line 3227).
    if (lastTurnDeadlineRef.current !== deadline && initialRemaining > 0) {
      lastTurnDeadlineRef.current = deadline;
      setEffectiveMaxTime(Math.max(initialRemaining, HORSES_TURN_TIMER_SECONDS));
    }

    // CRITICAL FIX: If the deadline is already in the past when we mount, DON'T immediately
    // set timeLeft=0 as that would trigger a false timeout. Instead, set to null and let
    // the timeout handler's own guards (checking if player already completed, etc.) decide.
    // This handles stale deadlines from previous turns that haven't been updated yet.
    if (initialRemaining <= 0) {
      // Don't set timeLeft at all for already-expired deadlines on mount
      // The timeout handler requires a real countdown to 0, not instant 0
      console.log('[TIMER] Deadline already past on mount - not setting timeLeft to avoid false timeout');
      setTimeLeft(null);
      return;
    }

    // Start with actual remaining time
    setTimeLeft(initialRemaining);

    // Update every second - only the countdown reaching 0 triggers timeout
    const interval = window.setInterval(() => {
      const currentTime = Date.now();
      const remaining = Math.max(0, Math.ceil((deadlineTime - currentTime) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [
    enabled,
    gamePhase,
    currentTurnPlayerId,
    currentTurnPlayer?.is_bot,
    currentTurnPlayer?.auto_fold,
    horsesState?.turnDeadline,
    isPaused,
  ]);

  // Timeout handler - set auto_fold so bot loop takes over with animated rolls
  // NOTE: We no longer force-complete here. The bot auto-play loop (below) handles
  // players with auto_fold=true and animates their rolls properly.
  // CRITICAL: This only fires when timeLeft counts down to 0 (not when it starts at 0/null).
  useEffect(() => {
    if (!enabled || gamePhase !== "playing") return;
    if (isPaused) return; // Never enforce timeouts when game is paused
    if (!presentationRoundId || !currentTurnPlayerId) return;
    if (currentTurnPlayer?.is_bot) return; // Bots handle themselves via bot loop
    if (currentTurnPlayer?.auto_fold) return; // Already in auto-roll mode, let bot loop handle
    if (!horsesState?.turnDeadline) return; // Only process timeouts when a real server deadline exists
    
    // CRITICAL: timeLeft must be exactly 0 (counted down), not null (never started)
    // This prevents false timeouts when the component mounts with stale deadline data
    if (timeLeft !== 0) return;

    // Additional safety: verify the deadline is actually for the current turn
    // by checking it's not too far in the past (> 30 seconds = definitely stale)
    const deadlineTime = new Date(horsesState.turnDeadline).getTime();
    const now = Date.now();
    const msSinceDeadline = now - deadlineTime;
    if (msSinceDeadline > 30000) {
      return;
    }

    // Only the player whose turn it is OR the bot controller should handle the timeout
    const iAmTurnOwner = currentTurnPlayer?.user_id === currentUserId;
    const iAmController = candidateBotControllerUserId === currentUserId;
    if (!iAmTurnOwner && !iAmController) return;

    // Prevent duplicate timeout processing
    const timeoutKey = `${presentationRoundId}:${currentTurnPlayerId}:timeout`;
    if (timeoutProcessedRef.current === timeoutKey) return;
    timeoutProcessedRef.current = timeoutKey;

    const handleTimeout = async () => {
      if (!syncHandle.canInteractNow()) {
        persistSyncDebugEvent({
          gameId: gameId ?? null,
          gameType: resolvedGameType,
          handNumber: monotonicHandNumber,
          roundId: currentRoundId,
          eventType: 'invariant',
          severity: 'warn',
          eventName: 'horses-timeout-mutation-suppressed',
          payload: {
            reason: 'interactions-blocked-or-identity-stale',
            interactionsAllowed: interactionsAllowedRef.current,
            isIdentityStale: isIdentityStaleRef.current,
            turnPlayer: currentTurnPlayerId?.slice(0, 8) ?? null,
          },
        });
        return;
      }

      // Get current player state
      const playerState = horsesState?.playerStates?.[currentTurnPlayerId];

      // IMPORTANT: If player has already completed their turn, do NOT mark them as timed out!
      if (playerState?.isComplete) {
        setTimeout(() => {
          advanceToNextTurn(currentTurnPlayerId);
        }, HORSES_POST_TURN_PAUSE_MS);
        return;
      }

      // TIMEOUT CONTRACT (dice): set auto_fold (drives bot auto-roll loop for the
      // remaining hands in this dealer game) AND sit_out_next_hand=true so the
      // pending sit-out is reconciled at the next dealer-game boundary (not the
      // next hand boundary).
      await supabase
        .from("players")
        .update({ auto_fold: true, sit_out_next_hand: true })
        .eq("id", currentTurnPlayerId);

      // Extend the deadline to give the bot loop time to animate (15 seconds)
      const extendedDeadline = new Date(Date.now() + 15000).toISOString();
      await supabase
        .from("rounds")
        .update({
          horses_state: {
            ...horsesState,
            turnDeadline: extendedDeadline,
          } as any,
        })
        .eq("id", currentRoundId);


      // Log this for debugging (before the bot loop kicks in)
      await logSitOutNextHandSet(
        currentTurnPlayerId,
        currentTurnPlayer?.user_id || '',
        gameId,
        currentTurnPlayer?.profiles?.username,
        currentTurnPlayer?.is_bot || false,
        false,
        'Player timed out during Horses turn - setting auto_fold for bot takeover',
        'useHorsesMobileController.ts:handleTimeout',
        { round_id: currentRoundId }
      );

      // The bot auto-play loop will now kick in because currentTurnPlayer.auto_fold is true
      // After the bot loop completes all rolls, it will mark sit_out_next_hand
    };

    handleTimeout();
  }, [
    enabled,
    gamePhase,
    isPaused,
    presentationRoundId,
    currentRoundId,
    currentTurnPlayerId,
    currentTurnPlayer,
    currentUserId,
    candidateBotControllerUserId,
    timeLeft,
    horsesState?.turnDeadline,
    horsesState?.playerStates,
    horsesState,
    advanceToNextTurn,
    gameId,
  ]);

  const handleRoll = useCallback(async () => {
    if (!enabled) return;
    if (isPaused) return; // Block all actions when game is paused
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining <= 0) return;

    // AUTHORITATIVE ANIMATION BARRIER: Check if previous roll's animation window is still active.
    // This prevents the roller from firing rolls faster than observers can animate.
    if (myPlayer) {
      const myState = horsesState?.playerStates?.[myPlayer.id];
      const prevMinEnd = (myState as any)?.rollAnimationMinEndAt;
      if (prevMinEnd) {
        const msRemaining = new Date(prevMinEnd).getTime() - Date.now();
        if (msRemaining > 0) {
          return;
        }
      }
    }

    const traceId = newTraceId();

    const rollStartTime = Date.now();
    const rollStartedAt = new Date(rollStartTime).toISOString();
    const rollAnimationMinEndAt = new Date(rollStartTime + ROLL_ANIMATION_BARRIER_MS).toISOString();
    // Unique per-roll key so all clients can trigger DiceTableLayout fly-in animations.
    localRollKeyRef.current = rollStartTime;
    // Reset hold sequence for new roll
    localHoldSeqRef.current = 0;


    // Determine if this is the first roll (rollsRemaining === 3 means first roll)
    const isFirstRoll = localHand.rollsRemaining === 3;
    const animationDuration = isFirstRoll ? HORSES_FIRST_ROLL_ANIMATION_MS : HORSES_ROLL_AGAIN_ANIMATION_MS;

    // Freeze layout to what it was at the START of this roll
    const heldMaskBeforeRoll = localHand.dice.map((d: any) => !!d.isHeld);
    heldMaskAtLastRollStartRef.current = heldMaskBeforeRoll;

    // Roll immediately so the animation displays the NEW dice values (prevents old->new flash)
    const rollNumber = getRollNumber(localHand.rollsRemaining);
    const newHand = isSCC ? rollSCCDice(localHand as SCCHand) : rollDice(localHand as HorsesHand);
    const newVals = (newHand.dice as any[]).map((d: any) => d.value).join(",");


    // Mark interaction immediately so realtime/DB snapshots can't overwrite the felt during the roll animation.
    lastLocalEditAtRef.current = rollStartTime;
    setLocalHand(newHand);
    setIsRolling(true);

    // CRITICAL: Save state IMMEDIATELY with animation metadata so observers get rollKey + rollStartedAt
    // right away and can start fly-in animation in sync.
    //
    // P0 FIX: This write MUST happen BEFORE freezePresentation(). saveMyState() is async, but
    // its synchronous prelude (including the canInteractNow() writer-gate check) runs immediately
    // up to the first await. If freezePresentation() ran first, frozenRef.current would be true
    // and canInteractNow() would reject the write — stripping rollStartedAt from the observer's
    // first snapshot and causing the ~3s fly-in lag (observer only fires on a later mutation).
    const rollAnimMeta = { rollStartedAt, rollAnimationMinEndAt };
    void saveMyState(newHand, false, undefined, heldMaskBeforeRoll, rollAnimMeta).then(() => {
    });

    // FREEZE presentation: prevent sync framework from pushing DB updates to UI during animation.
    // Must happen AFTER the roll-init write above so the writer gate doesn't suppress it.
    syncHandle.freezePresentation();

    setTimeout(async () => {
      const animationEndTime = Date.now();
      console.log(
        `[ROLL_DEBUG] Animation timeout fired at ${new Date(animationEndTime).toISOString()} (after ${animationEndTime - rollStartTime}ms)`,
      );
      setIsRolling(false);

      // UNFREEZE presentation: animation complete, allow sync framework to propagate latest authoritative state
      syncHandle.unfreezePresentation();

      // For SCC: Check if we rolled midnight (12 cargo) - auto-lock since it's the best possible
      if (isSCC) {
        const sccHand = newHand as SCCHand;
        const result = evaluateSCCHand(sccHand);

        // Midnight = qualified with cargo of 12 (best possible hand)
        if (result.isQualified && result.cargoSum === 12) {
          const lockedHand = lockInSCCHand(sccHand);
          setLocalHand(lockedHand);
          const persistedState = await saveMyState(lockedHand, true, result, heldMaskBeforeRoll);
          const playerStatesAfterLock = {
            ...(persistedState?.playerStates ?? incomingHorsesStateRef.current?.playerStates ?? {}),
            ...(myPlayer?.id ? { [myPlayer.id]: { ...(persistedState?.playerStates?.[myPlayer.id] ?? {}), isComplete: true } } : {}),
          };
          const willBeLastToComplete =
            turnOrder.length > 0 &&
            turnOrder.every((pid) => playerStatesAfterLock[pid]?.isComplete);

          if (willBeLastToComplete) {
            void advanceToNextTurn(myPlayer?.id ?? null);
          } else {
            setTimeout(() => {
              advanceToNextTurn(myPlayer?.id ?? null);
            }, HORSES_POST_TURN_PAUSE_MS);
          }
          return;
        }
      }

      if (newHand.rollsRemaining === 0) {
        // Use appropriate evaluation function based on game type
        const result = isSCC ? evaluateSCCHand(newHand as SCCHand) : evaluateHand((newHand as HorsesHand).dice);
        // Final roll: await to ensure state is saved before advancing turn
        const persistedState = await saveMyState(newHand, true, result, heldMaskBeforeRoll);
        const playerStatesAfterRoll = {
          ...(persistedState?.playerStates ?? incomingHorsesStateRef.current?.playerStates ?? {}),
          ...(myPlayer?.id ? { [myPlayer.id]: { ...(persistedState?.playerStates?.[myPlayer.id] ?? {}), isComplete: true } } : {}),
        };
        const willBeLastToComplete =
          turnOrder.length > 0 &&
          turnOrder.every((pid) => playerStatesAfterRoll[pid]?.isComplete);

        if (willBeLastToComplete) {
          void advanceToNextTurn(myPlayer?.id ?? null);
        } else {
          setTimeout(() => {
            advanceToNextTurn(myPlayer?.id ?? null);
          }, HORSES_POST_TURN_PAUSE_MS);
        }
      }
      // Note: intermediate rolls already saved immediately above, no need to save again here
    }, animationDuration);
  }, [
    enabled,
    isPaused,
    isMyTurn,
    localHand,
    saveMyState,
    advanceToNextTurn,
    myPlayer?.id,
    isSCC,
    turnOrder,
    logDebug,
  ]);

  const handleToggleHold = useCallback(
    (index: number) => {
      if (!enabled) return;
      if (isPaused) return; // Block all actions when game is paused
      const currentHand = localHandRef.current;
      if (!isMyTurn || currentHand.isComplete || currentHand.rollsRemaining === 3 || currentHand.rollsRemaining <= 0) return;


      // For SCC: Ship/Captain/Crew are auto-locked and cannot be toggled
      // Cargo dice (non-SCC) CAN be toggled - player can hold individual cargo dice
      if (isSCC) {
        const sccHand = currentHand as SCCHand;
        const die = sccHand.dice[index];
        
        // Ship/Captain/Crew are auto-frozen and cannot be unheld
        if (die.isSCC) {
          return;
        }
        
        // Toggle the cargo die
        lastLocalEditAtRef.current = Date.now();
        localHoldSeqRef.current += 1;
        
        const newDice = [...sccHand.dice];
        newDice[index] = { ...newDice[index], isHeld: !newDice[index].isHeld };
        
        const nextHand: SCCHand = {
          ...sccHand,
          dice: newDice,
        };
        
        setLocalHand(nextHand);
        localHandRef.current = nextHand;
        if (holdSaveTimerRef.current) clearTimeout(holdSaveTimerRef.current);
        holdSaveTimerRef.current = setTimeout(() => {
          holdSaveTimerRef.current = null;
          void saveMyState(localHandRef.current, false, undefined, heldMaskAtLastRollStartRef.current ?? undefined);
        }, 150);
        return;
      }

      lastLocalEditAtRef.current = Date.now();
      
      // Increment hold sequence for ordering - this is critical for observers to reject stale updates
      localHoldSeqRef.current += 1;

      // IMPORTANT (mobile): persist holds immediately.
      // Otherwise the next realtime/DB sync can overwrite local holds and it feels like it "won't hold".
      const nextHand = toggleHold(currentHand as HorsesHand, index);
      setLocalHand(nextHand);
      localHandRef.current = nextHand;

      if (holdSaveTimerRef.current) clearTimeout(holdSaveTimerRef.current);
      holdSaveTimerRef.current = setTimeout(() => {
        holdSaveTimerRef.current = null;
        void saveMyState(localHandRef.current, false, undefined, heldMaskAtLastRollStartRef.current ?? undefined);
      }, 150);
    },
    [enabled, isPaused, isMyTurn, saveMyState, isSCC],
  );

  const handleLockIn = useCallback(async () => {
    if (!enabled) return;
    if (isPaused) return; // Block all actions when game is paused
    if (!isMyTurn || localHand.rollsRemaining === 3 || localHand.isComplete) return;

    const traceId = newTraceId();

    // Freeze layout to what it was at the START of the most recent roll.
    const heldMaskBeforeComplete =
      heldMaskAtLastRollStartRef.current ?? localHand.dice.map((d: any) => !!d.isHeld);

    // For SCC: can only lock in if qualified (has 6-5-4)
    if (isSCC) {
      const sccHand = localHand as SCCHand;
      if (!isQualified(sccHand)) {
        // Can't lock in without Ship/Captain/Crew
        return;
      }
      const lockedHand = lockInSCCHand(sccHand);
      lastLocalEditAtRef.current = Date.now();
      setLocalHand(lockedHand);

      const result = evaluateSCCHand(lockedHand);
      const persistedState = await saveMyState(lockedHand, true, result, heldMaskBeforeComplete);
      const playerStatesAfterLock = {
        ...(persistedState?.playerStates ?? incomingHorsesStateRef.current?.playerStates ?? {}),
        ...(myPlayer?.id ? { [myPlayer.id]: { ...(persistedState?.playerStates?.[myPlayer.id] ?? {}), isComplete: true } } : {}),
      };
      const willBeLastToComplete =
        turnOrder.length > 0 &&
        turnOrder.every((pid) => playerStatesAfterLock[pid]?.isComplete);

      if (willBeLastToComplete) {
        void advanceToNextTurn(myPlayer?.id ?? null);
      } else {
        setTimeout(() => {
          advanceToNextTurn(myPlayer?.id ?? null);
        }, HORSES_POST_TURN_PAUSE_MS);
      }
      return;
    }

    const lockedHand = lockInHand(localHand as HorsesHand);
    lastLocalEditAtRef.current = Date.now();
    setLocalHand(lockedHand);

    const result = evaluateHand(lockedHand.dice);
    const persistedState = await saveMyState(lockedHand, true, result, heldMaskBeforeComplete);
    const playerStatesAfterLock = {
      ...(persistedState?.playerStates ?? incomingHorsesStateRef.current?.playerStates ?? {}),
      ...(myPlayer?.id ? { [myPlayer.id]: { ...(persistedState?.playerStates?.[myPlayer.id] ?? {}), isComplete: true } } : {}),
    };
    const willBeLastToComplete =
      turnOrder.length > 0 &&
      turnOrder.every((pid) => playerStatesAfterLock[pid]?.isComplete);

    if (willBeLastToComplete) {
      void advanceToNextTurn(myPlayer?.id ?? null);
    } else {
      setTimeout(() => {
        advanceToNextTurn(myPlayer?.id ?? null);
      }, HORSES_POST_TURN_PAUSE_MS);
    }
  }, [enabled, isPaused, isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id, isSCC, turnOrder]);

  // Bot auto-play with visible animation (mobile)
  // CRITICAL: This effect should ONLY re-run when the turn identity changes (round + bot/auto-roll player),
  // NOT on every horsesState update. We use refs to read latest values inside the loop.
  // This also handles HUMAN players with auto_fold=true (auto-roll mode in dice games)
  useEffect(() => {
    if (!enabled) return;
    if (isPaused) return; // Block bot auto-play when game is paused
    if (gamePhase !== "playing") return;
    if (!presentationRoundId) return;
    if (!currentUserId) return;
    // Writer-audit gate: bot loop is a mutation source; do not run on stale identity.
    if (!interactionsAllowed || syncHandle.isIdentityStale) return;

    // Auto-play for bots OR human players with auto_fold (auto-roll mode)
    const shouldAutoPlay = currentTurnPlayer?.is_bot || currentTurnPlayer?.auto_fold;
    const botId = shouldAutoPlay ? currentTurnPlayer?.id : null;
    if (!botId) return;

    const processingKey = `${presentationRoundId}:${botId}`;

    // If we're already running this exact bot turn loop, do not start another.
    if (botProcessingKeyRef.current === processingKey) return;

    // Mark processing synchronously (prevents double-start on rapid re-renders)
    botProcessingKeyRef.current = processingKey;

    // Fail-safe: if something stalls mid-loop, allow a retry.
    if (botStuckTimerRef.current) window.clearTimeout(botStuckTimerRef.current);
    botStuckTimerRef.current = window.setTimeout(() => {
      if (botProcessingKeyRef.current === processingKey) {
        console.warn("[HORSES] (mobile) bot loop watchdog: releasing lock", { processingKey });
        botProcessingKeyRef.current = null;
        setBotTurnActiveId(null);
      }
    }, 15000);

    let cancelled = false;

    const run = async () => {
      setBotTurnActiveId(botId);

      // Add delay before bots start their turn (only during active gameplay)
      // This allows the component to render and subscribe to state changes before the first roll
      if (gamePhase === 'playing') {
        await new Promise((resolve) => setTimeout(resolve, BOT_TURN_START_DELAY_MS));
        if (cancelled) return;
      }

      try {
        // Preflight: read the latest horses_state so we don't act on stale props.
        const { data: roundRow, error: roundErr } = await supabase
          .from("rounds")
          .select("horses_state")
          .eq("id", currentRoundId)
          .maybeSingle();

        if (cancelled) return;

        if (roundErr) {
          console.error("[HORSES] Failed to preflight round state:", roundErr);
          return;
        }

        const latestState = (roundRow as any)?.horses_state as HorsesStateFromDB | null; // eslint-disable-line @typescript-eslint/no-explicit-any

        // If the DB already moved the turn, do nothing.
        if (latestState?.currentTurnPlayerId && latestState.currentTurnPlayerId !== botId) return;

        // Ensure a SINGLE client drives bot turns - use ref for latest value
        let controllerId = latestState?.botControllerUserId ?? null;

        if (!controllerId) {
          const { data, error } = await supabase.rpc(
            "claim_horses_bot_controller" as any,
            { _round_id: currentRoundId } as any,
          );

          if (cancelled) return;

          if (error) {
            console.error("[HORSES] Failed to claim bot controller (atomic):", error);
          } else {
            controllerId = (data as any)?.botControllerUserId ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
          }
        }

        controllerId = controllerId ?? candidateBotControllerUserIdRef.current ?? null;
        if (controllerId && controllerId !== currentUserId) return;

        const latestBotState = latestState?.playerStates?.[botId];

        // If bot already completed but the turn is still stuck on the bot, advance only.
        if (latestState && latestBotState?.isComplete && latestState.currentTurnPlayerId === botId) {
          await horsesAdvanceTurn(currentRoundId, botId);
          return;
        }

        if (latestBotState?.isComplete) return;

        let botHand: HorsesHand | SCCHand = latestBotState
          ? (isSCC 
              ? reconstructSCCHand(
                  latestBotState.dice as SCCDieType[],
                  latestBotState.rollsRemaining,
                  latestBotState.isComplete
                )
              : {
                  dice: latestBotState.dice as HorsesDieType[],
                  rollsRemaining: latestBotState.rollsRemaining,
                  isComplete: latestBotState.isComplete,
                }
            )
          : (isSCC ? createInitialSCCHand() : createInitialHand());

        // Track held mask at the START of each roll so we can freeze layout on completion.
        let heldMaskBeforeComplete: boolean[] | undefined;
        
        // Roll key for animation (increments each roll)
        let botRollKey = Date.now();

        // Roll up to 3 times with visible animation
        for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
          if (cancelled) return;

          heldMaskBeforeComplete = botHand.dice.map((d: any) => !!d.isHeld);
          botRollKey++;

          // Delay before each roll for visibility
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (cancelled) return;

          // Roll immediately so the fly-in animation "lands" on the NEW values (prevents old->new flash)
          const botRollNumber = getRollNumber(botHand.rollsRemaining);
          const rolledHand = isSCC ? rollSCCDice(botHand as SCCHand) : rollDice(botHand as HorsesHand);

          // Audit log the bot dice rolls for randomness validation

          setBotDisplayState({
            playerId: botId,
            dice: rolledHand.dice as HorsesDieType[],
            rollsRemaining: rolledHand.rollsRemaining,
            isRolling: true,
            heldMaskBeforeComplete,
            heldCountBeforeComplete: heldMaskBeforeComplete.filter(Boolean).length,
            rollKey: botRollKey,
          });

          // Let the fly-in animation play while we show "rolling"
          await new Promise((resolve) => setTimeout(resolve, BOT_TURN_START_DELAY_MS));
          if (cancelled) return;

          // Commit the rolled values without changing dice again (prevents flicker)
          botHand = rolledHand;
          setBotDisplayState({
            playerId: botId,
            dice: botHand.dice as HorsesDieType[],
            rollsRemaining: botHand.rollsRemaining,
            isRolling: false,
            heldMaskBeforeComplete,
            heldCountBeforeComplete: heldMaskBeforeComplete.filter(Boolean).length,
            rollKey: botRollKey,
          });

          // Intermediate roll: fire-and-forget to avoid blocking animation timing
          void horsesSetPlayerState(currentRoundId, botId, {
            dice: botHand.dice as any,
            rollsRemaining: botHand.rollsRemaining,
            isComplete: false,
            heldMaskBeforeComplete,
            heldCountBeforeComplete: heldMaskBeforeComplete?.filter(Boolean).length,
            rollKey: botRollKey,
          } as any);

          await new Promise((resolve) => setTimeout(resolve, 800));
          if (cancelled) return;

          // Use appropriate bot decision logic based on game type
          const shouldStop = isSCC
            ? shouldSCCBotStopRolling(
                botHand as SCCHand,
                botHand.rollsRemaining,
                currentWinningResultRef.current as SCCHandResult | null,
              )
            : shouldBotStopRolling(
                (botHand as HorsesHand).dice,
                botHand.rollsRemaining,
                currentWinningResultRef.current as HorsesHandResult | null,
              );
          if (shouldStop) break;

          // For Horses only: apply hold decisions (SCC has auto-freeze, no manual holds)
          if (!isSCC && botHand.rollsRemaining > 0) {
            const decision = getBotHoldDecision({
              currentDice: (botHand as HorsesHand).dice,
              rollsRemaining: botHand.rollsRemaining,
              currentWinningResult: currentWinningResultRef.current as HorsesHandResult | null,
            });

            botHand = applyHoldDecision(botHand as HorsesHand, decision);
            setBotDisplayState({
              playerId: botId,
              dice: botHand.dice as HorsesDieType[],
              rollsRemaining: botHand.rollsRemaining,
              isRolling: false,
              heldMaskBeforeComplete,
              heldCountBeforeComplete: heldMaskBeforeComplete.filter(Boolean).length,
              rollKey: botRollKey,
            });

            // Hold decision: fire-and-forget to avoid blocking animation timing
            void horsesSetPlayerState(currentRoundId, botId, {
              dice: botHand.dice as any,
              rollsRemaining: botHand.rollsRemaining,
              isComplete: false,
              heldMaskBeforeComplete,
              heldCountBeforeComplete: heldMaskBeforeComplete?.filter(Boolean).length,
              rollKey: botRollKey,
            } as any);

            await new Promise((resolve) => setTimeout(resolve, 600));
            if (cancelled) return;
          }
        }

        if (cancelled) return;

        // Use appropriate lock and evaluate functions based on game type
        let result: HorsesHandResult | SCCHandResult;
        if (isSCC) {
          botHand = lockInSCCHand(botHand as SCCHand);
          result = evaluateSCCHand(botHand as SCCHand);
        } else {
          botHand = lockInHand(botHand as HorsesHand);
          result = evaluateHand((botHand as HorsesHand).dice);
        }

        const heldCountBeforeComplete = Array.isArray(heldMaskBeforeComplete)
          ? heldMaskBeforeComplete.filter(Boolean).length
          : undefined;

        setBotDisplayState({
          playerId: botId,
          dice: botHand.dice as HorsesDieType[],
          rollsRemaining: botHand.rollsRemaining,
          isRolling: false,
          heldMaskBeforeComplete,
          heldCountBeforeComplete,
          rollKey: botRollKey,
        });

        await horsesSetPlayerState(currentRoundId, botId, {
          dice: botHand.dice as any,
          rollsRemaining: 0,
          isComplete: true,
          result,
          heldMaskBeforeComplete,
          heldCountBeforeComplete,
          rollKey: botRollKey,
        } as any);

        // If this was a human player with auto_fold (timed out), mark them to sit out next hand
        // BUT only if sit_out_next_hand hasn't been explicitly cleared (e.g. by deferred auto-roll off)
        const currentPlayerData = players.find((p) => p.id === botId);
        if (currentPlayerData && !currentPlayerData.is_bot && currentPlayerData.auto_fold) {
          // Re-fetch current sit_out_next_hand to avoid overwriting a deliberate clear
          const { data: freshPlayer } = await supabase
            .from("players")
            .select("sit_out_next_hand")
            .eq("id", botId)
            .single();

          if (freshPlayer && freshPlayer.sit_out_next_hand === false) {
          } else {
            await supabase
              .from("players")
              .update({ sit_out_next_hand: true })
              .eq("id", botId);
            toast.info(`${getPlayerUsername(currentPlayerData)} timed out - sitting out next hand`);
          }
        }

        // OPTIMIZATION: When this bot's completion will be the LAST player to
        // complete the round, skip the post-turn pause. Holding here adds a
        // visible 3s "frozen" stall before pot award / round resolution. The
        // completedTurnHold overlay (3s) still keeps the bot's dice visible
        // on the felt while gamePhase transitions to 'complete' and the win
        // flow awards the pot underneath.
        const playerStatesAfterBot: Record<string, { isComplete?: boolean }> = {
          ...(latestState?.playerStates ?? {}),
          [botId]: { ...(latestState?.playerStates?.[botId] ?? {}), isComplete: true },
        };
        const willBeLastToComplete =
          turnOrder.length > 0 &&
          turnOrder.every((pid) => playerStatesAfterBot[pid]?.isComplete);

        if (!willBeLastToComplete) {
          await new Promise((resolve) => setTimeout(resolve, HORSES_POST_TURN_PAUSE_MS));
          if (cancelled) return;
        }

        // Always attempt to advance - the RPC has an atomic guard that prevents duplicate advances
        // Removing the pre-check here fixes a deadlock where both players complete but gamePhase stays "playing"
        await horsesAdvanceTurn(currentRoundId, botId);
      } catch (error) {
        console.error("[HORSES] Bot play failed:", error);
      } finally {
        if (botStuckTimerRef.current) window.clearTimeout(botStuckTimerRef.current);
        if (botProcessingKeyRef.current === processingKey) botProcessingKeyRef.current = null;

        // Clear the active bot turn flag after a short delay to allow final display state to render
        setTimeout(() => {
          setBotTurnActiveId((current) => (current === botId ? null : current));
        }, 100);
      }
    };

    void run();

    // IMPORTANT: Only cancel and cleanup when the turn IDENTITY changes, not on state updates.
    // The effect only re-runs when these deps change, so cleanup only happens on real turn changes.
    return () => {
      cancelled = true;
      if (botStuckTimerRef.current) window.clearTimeout(botStuckTimerRef.current);
      if (botProcessingKeyRef.current === processingKey) botProcessingKeyRef.current = null;
    };
  }, [
    enabled,
    isPaused,
    gamePhase,
    presentationRoundId,
    currentUserId,
    currentTurnPlayer?.id,
    currentTurnPlayer?.is_bot,
    currentTurnPlayer?.auto_fold, // Added to trigger auto-roll for human players
    interactionsAllowed,
    syncHandle.isIdentityStale,
    // REMOVED: horsesState?.currentTurnPlayerId - causes re-runs on every state update
    // REMOVED: horsesState?.playerStates - causes re-runs on every state update
    // REMOVED: candidateBotControllerUserId - use ref instead
    // REMOVED: currentWinningResult - use ref instead
  ]);

  // Handle game complete - award pot to winner
  // Track if we've already processed this round's win to prevent duplicates
  const processedWinRoundRef = useRef<string | null>(null);
  
  // CRITICAL: Reset processed ref when gameId changes (new game session)
  useEffect(() => {
    processedWinRoundRef.current = null;
  }, [gameId]);

  // P0 #2 FIX: Reset on round identity advance so a NEW round can be processed even
  // if a prior round's id was previously recorded. Pair with the authoritative-state
  // gate below to ensure stale presentation winners cannot retrigger on the new round.
  useEffect(() => {
    processedWinRoundRef.current = null;
  }, [currentRoundId]);

  useEffect(() => {
    if (!enabled) return;
    if (!gameId || !currentRoundId) return;
    if (isPaused) return;

    // P0 #2 ROOT FIX: Derive winners from AUTHORITATIVE state, not presentation.
    // Presentation lags behind currentRoundId (visual-contract gating), so the prior
    // round's terminal `winningPlayerIds` from presentationState can survive into the
    // new currentRoundId and re-trigger rollover, creating runaway round creation.
    // Authoritative state flips to gamePhase='playing' the instant the new round arrives.
    const authState = incomingHorsesStateRef.current;
    if (!authState || authState.gamePhase !== 'complete') return;

    const authCompletedResults = Object.entries(authState.playerStates || {})
      .filter(([_, s]: any) => s?.isComplete && s?.result)
      .map(([playerId, s]: any) => ({ playerId, result: s.result }));
    if (authCompletedResults.length === 0) return;

    const authWinningIds = isSCC
      ? determineSCCWinners(authCompletedResults.map(r => r.result as SCCHandResult)).map(i => authCompletedResults[i].playerId)
      : determineWinners(authCompletedResults.map(r => r.result as HorsesHandResult)).map(i => authCompletedResults[i].playerId);
    if (authWinningIds.length === 0) return;

    // Prevent duplicate processing keyed to the AUTHORITATIVE round identity.
    if (processedWinRoundRef.current === currentRoundId) return;

    const myPlayerId = myPlayer?.id;
    if (!myPlayerId) return;

    // Snapshot the originating round identity. If currentRoundId advances by the time
    // the async work runs, abort — the win belonged to a prior round.
    const originatingRoundId = currentRoundId;

    const processWin = async () => {
      // Hard-scope guard: round must still be the originating one.
      if (currentRoundIdRef.current && currentRoundIdRef.current !== originatingRoundId) {
        return;
      }
      processedWinRoundRef.current = originatingRoundId;

      // Replace closure-captured winningPlayerIds/completedResults with auth-derived ones.
      const winningPlayerIds = authWinningIds;
      const completedResults = authCompletedResults;

      if (winningPlayerIds.length > 1) {
        // ATOMIC GUARD: Only one client claims the tie processing.
        // Filter on awaiting_next_round=false so the claim is a TRUE one-shot at the DB level —
        // even if local refs reset or the effect re-runs (presentation oscillation, identity reset),
        // a second claim is rejected. This prevents the SCC no-qualify overlay/rollover loop.
        const { data: claimed, error: claimError } = await supabase
          .from("games")
          .update({
            awaiting_next_round: true,
            last_round_result: "One tie all tie - rollover",
          })
          .eq("id", gameId)
          .eq("status", "in_progress")
          .eq("awaiting_next_round", false)
          .select("id, total_hands, current_game_uuid");

        if (claimError || !claimed || claimed.length === 0) {
          persistSyncDebugEvent({
            gameId: gameId ?? null,
            gameType: resolvedGameType,
            handNumber: monotonicHandNumber,
            roundId: currentRoundId,
            eventType: 'invariant', severity: 'warn',
            eventName: 'horses-tie-rollover-claim-skipped',
            payload: {
              reason: claimError ? 'error' : 'already-claimed',
              errorMessage: claimError?.message ?? null,
              clientUserId: currentUserId?.slice(0, 8) ?? null,
              myPlayerId: myPlayer?.id?.slice(0, 8) ?? null,
              currentRoundId: currentRoundId?.slice(0, 8) ?? null,
              winningPlayerIds: winningPlayerIds.map(p => p.slice(0, 8)),
              tsClient: Date.now(),
            },
          });
          return;
        }

        // Claim WON — record who actually won the atomic rollover claim.
        persistSyncDebugEvent({
          gameId: gameId ?? null,
          gameType: resolvedGameType,
          handNumber: monotonicHandNumber,
          roundId: currentRoundId,
          eventType: 'invariant', severity: 'info',
          eventName: 'horses-tie-rollover-claim-won',
          payload: {
            clientUserId: currentUserId?.slice(0, 8) ?? null,
            myPlayerId: myPlayer?.id?.slice(0, 8) ?? null,
            currentRoundId: currentRoundId?.slice(0, 8) ?? null,
            claimedHandNumber: (claimed[0] as any)?.total_hands ?? null,
            claimedDealerGameId: (claimed[0] as any)?.current_game_uuid?.slice(0, 8) ?? null,
            winningPlayerIds: winningPlayerIds.map(p => p.slice(0, 8)),
            tsClient: Date.now(),
          },
        });

        // Record CHOP event for history with EMPTY chip changes
        // In dice games, pot carries over - no chips are distributed during rollover
        const tiedPlayerNames = winningPlayerIds
          .map(id => {
            const p = players.find(pl => pl.id === id);
            if (!p) return "Unknown";
            return getPlayerUsername(p);
          })
          .join(" & ");

        const tiedResult = completedResults.find(r => winningPlayerIds.includes(r.playerId));
        const handNumber = (claimed[0] as any).total_hands || 1;
        const currentGameUuid = (claimed[0] as any).current_game_uuid || null;

        await supabase.from("game_results").insert({
          game_id: gameId,
          hand_number: handNumber,
          winner_player_id: null, // No winner in a rollover
          winner_username: tiedPlayerNames,
          winning_hand_description: `TIE: ${tiedResult?.result.description || "Unknown"} - Rollover`,
          pot_won: 0, // No chips awarded in a rollover
          player_chip_changes: {}, // Empty - no chip movements
          is_chopped: true,
          game_type: gameType === "ship-captain-crew" ? "ship-captain-crew" : "horses",
          dealer_game_id: currentGameUuid,
        });

        // PRIMARY tie rollover path: the client that wins the atomic tie claim
        // must immediately create the re-ante round. Game.tsx's awaiting_next_round
        // timer remains a recovery/fallback only; relying on it produced 20s+
        // visible stalls when realtime/fetch timing missed the primary window.
        persistSyncDebugEvent({
          gameId: gameId ?? null,
          gameType: resolvedGameType,
          handNumber,
          roundId: originatingRoundId,
          eventType: 'invariant', severity: 'info',
          eventName: 'horses-tie-rollover-primary-start-attempt',
          payload: {
            clientUserId: currentUserId?.slice(0, 8) ?? null,
            currentRoundId: originatingRoundId.slice(0, 8),
            currentGameUuid: currentGameUuid?.slice(0, 8) ?? null,
            source: 'useHorsesMobileController:tie-claim-winner',
            tsClient: Date.now(),
          },
        });

        try {
          const callerContext = {
            caller: 'useHorsesMobileController:tie-claim-winner',
            reason: 'tie-rollover-primary-re-ante',
            trigger: 'atomic tie rollover claim won',
            prevDealerGameId: currentGameUuid,
            prevRoundId: originatingRoundId,
            prevGamePhase: authState.gamePhase,
            prevCurrentTurnPlayerId: authState.currentTurnPlayerId,
            prevAllComplete: true,
            prevAwaitingNextRound: true,
            extra: {
              tiedPlayerCount: winningPlayerIds.length,
              winningPlayerIds: winningPlayerIds.map(p => p.slice(0, 8)),
            },
          };

          // ── Re-ante chip animation trigger ─────────────────────
          // The fallback awaiting_next_round path in Game.tsx (which
          // owns anteAnimationTriggerId) is BYPASSED by this primary
          // tie-rollover path. Snapshot pre-ante chips & pot from
          // props BEFORE startHorsesRound/startSCCRound deducts antes,
          // then dispatch a window event so Game.tsx can publish the
          // animation trigger. This is the diverge-point between the
          // (succeeding) state transition and the (missing) animation.
          try {
            const perPlayerAmount = anteAmount || 0;
            if (perPlayerAmount > 0 && gameId) {
              const activeForAnte = players.filter(p => !p.sitting_out);
              if (activeForAnte.length > 0) {
                const preChipsSnapshot: Record<string, number> = {};
                const expectedChipsSnapshot: Record<string, number> = {};
                activeForAnte.forEach(p => {
                  preChipsSnapshot[p.id] = p.chips;
                  expectedChipsSnapshot[p.id] = p.chips - perPlayerAmount;
                });
                const expectedPot = (pot || 0) + perPlayerAmount * activeForAnte.length;
                console.log('[HORSES_TIE_ROLLOVER] dispatching primary re-ante animation trigger', {
                  gameId: gameId.slice(0, 8),
                  perPlayerAmount,
                  activeCount: activeForAnte.length,
                  expectedPot,
                });
                window.dispatchEvent(new CustomEvent('horses:primary-re-ante', {
                  detail: {
                    gameId,
                    preChipsSnapshot,
                    expectedChipsSnapshot,
                    expectedPot,
                    perPlayerAmount,
                    activeCount: activeForAnte.length,
                  },
                }));
              }
            }
          } catch (dispatchErr) {
            console.warn('[HORSES_TIE_ROLLOVER] failed to dispatch animation trigger', dispatchErr);
          }

          if (gameType === "ship-captain-crew") {
            await startSCCRound(gameId, false, callerContext);
          } else {
            await startHorsesRound(gameId, false, callerContext);
          }
        } catch (error) {
          persistSyncDebugEvent({
            gameId: gameId ?? null,
            gameType: resolvedGameType,
            handNumber,
            roundId: originatingRoundId,
            eventType: 'invariant', severity: 'error',
            eventName: 'horses-tie-rollover-primary-start-failed',
            payload: {
              errorMessage: error instanceof Error ? error.message : String(error),
              clientUserId: currentUserId?.slice(0, 8) ?? null,
              tsClient: Date.now(),
            },
          });
          throw error;
        }

        return;
      }

      const winnerId = winningPlayerIds[0];
      const winnerPlayer = players.find((p) => p.id === winnerId);
      const winnerResult = completedResults.find((r) => r.playerId === winnerId);

      if (!winnerPlayer || !winnerResult) return;

      // ATOMIC GUARD: Claim the right to process this win by atomically
      // transitioning game status. Only one client will succeed.
      const { data: claimed, error: claimError } = await supabase
        .from("games")
        .update({
          status: "game_over",
          game_over_at: new Date().toISOString(),
        })
        .eq("id", gameId)
        .eq("status", "in_progress") // Only succeeds if still in_progress
        .select("id, pot, total_hands, current_game_uuid");

      if (claimError || !claimed || claimed.length === 0) {
        return;
      }

      const actualPot = claimed[0].pot || pot || 0;
      const handNumber = claimed[0].total_hands || 1;
      const currentGameUuid = (claimed[0] as any).current_game_uuid || null;

      // Award pot to winner using atomic increment to prevent race conditions
      // (non-atomic read-then-write could lose chips if state is stale)
      const { error: updateError } = await supabase.rpc("increment_player_chips", {
        p_player_id: winnerId,
        p_amount: actualPot,
      });

      if (updateError) {
        console.error("[HORSES] Failed to update winner chips:", updateError);
        return;
      }

      const winnerName = getPlayerUsername(winnerPlayer);

      // ZERO-SUM ACCOUNTING: Since antes are recorded separately as negative chip changes,
      // the showdown event only records the winner's GROSS pot award.
      // This keeps the ledger balanced: sum(antes) = -pot, showdown = +pot, net = 0
      const chipChanges: Record<string, number> = {};
      chipChanges[winnerId] = actualPot; // Winner receives the full pot

      // CRITICAL FIX: AWAIT the game_results insert to ensure the winner is recorded
      // BEFORE transitioning game state. This prevents dealer selection from failing
      // to find the winner when determining who deals next.
      const { error: resultError } = await supabase.from("game_results").insert({
        game_id: gameId,
        hand_number: handNumber,
        winner_player_id: winnerId,
        winner_username: winnerName,
        winning_hand_description: winnerResult.result.description,
        pot_won: actualPot,
        player_chip_changes: chipChanges,
        is_chopped: false,
        game_type: gameType === "ship-captain-crew" ? "ship-captain-crew" : "horses",
        dealer_game_id: currentGameUuid,
      });

      if (resultError) {
        console.error("[HORSES] CRITICAL: Failed to record game result:", resultError);
        // Still continue - chips were already awarded, but log the error
      } else {
      }

      // Note: No toast here - dealer announcement already shows the win message
      
      // Fire-and-forget: Snapshot player chips (audit trail only)
      snapshotPlayerChips(gameId, handNumber);

      // Update pot and result description (status already set in atomic claim)
      await supabase
        .from("games")
        .update({
          pot: 0,
          last_round_result: `${winnerName} wins with ${winnerResult.result.description}`,
        })
        .eq("id", gameId);
    };

    processWin();
  }, [
    enabled,
    gameId,
    currentRoundId,
    // P0 #2: depend on AUTHORITATIVE state, not presentation-derived winningPlayerIds.
    incomingHorsesState,
    players,
    currentUserId,
    pot,
    anteAmount,
    getPlayerUsername,
    myPlayer,
    isPaused,
    isSCC,
  ]);

  // RECOVERY: If gamePhase is "playing" but ALL players in turnOrder have isComplete,
  // force transition to "complete". This handles cases where the advance RPC succeeded
  // but the state update was lost or the RPC set currentTurnPlayerId to null without
  // setting gamePhase to "complete".
  const allCompleteRecoveryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (gamePhase !== "playing") return;
    if (!presentationRoundId || !gameId) return;
    if (!turnOrder.length) return;

    const playerStates = horsesState?.playerStates ?? {};
    const allComplete = turnOrder.every(pid => playerStates[pid]?.isComplete);
    if (!allComplete) return;

    const key = `allcomplete:${presentationRoundId}`;
    if (allCompleteRecoveryRef.current === key) return;
    allCompleteRecoveryRef.current = key;

    console.warn("[HORSES] All players complete but gamePhase still 'playing' - forcing complete");
    
    const writeRoundId = currentRoundId;
    const forceComplete = async () => {
      if (!writeRoundId) return;
      // NOTE: Intentionally NOT gated by syncHandle.canInteractNow().
      // This is an authoritative terminal state advancement (all players
      // complete, currentTurnPlayerId already null), not a user interaction.
      // The presentation/identity writer gate is the wrong guard here — it
      // can stay locked during terminal visual-contract timing and strand
      // the hand in "playing" forever. Downstream atomicity is already
      // protected by processWin / rollover-claim guards
      // (.eq("awaiting_next_round", false)), preventing double advancement.
      // Fetch latest state from DB to avoid clobbering
      const { data: roundRow } = await supabase
        .from("rounds")
        .select("horses_state")
        .eq("id", writeRoundId)
        .single();

      const latestState = (roundRow as any)?.horses_state as HorsesStateFromDB | null;
      if (!latestState) return;

      // Re-verify all-complete against latest DB state before writing.
      const latestPlayerStates = latestState.playerStates ?? {};
      const stillAllComplete = turnOrder.every(pid => latestPlayerStates[pid]?.isComplete);
      if (!stillAllComplete) return;
      if (latestState.gamePhase === "complete") return;

      await updateHorsesState(writeRoundId, {
        ...latestState,
        currentTurnPlayerId: null,
        gamePhase: "complete",
      });
    };

    // Tiny debounce only — no meaningful "normal advance" remains once all
    // players are complete and currentTurnPlayerId is null.
    const t = window.setTimeout(forceComplete, 250);
    return () => window.clearTimeout(t);
  }, [enabled, gamePhase, presentationRoundId, currentRoundId, gameId, turnOrder, horsesState?.playerStates]);

  const rawFeltDice = useMemo(() => {
    const logPrefix = `[FELT_DICE_DEBUG ${isSCC ? 'SCC' : 'HORSES'}]`;
    
    // If we have a completed turn hold for the CURRENT USER, don't show on felt
    // (their dice should stay in their active player area, not on the felt)
    if (presentationRoundId && completedTurnHold && Date.now() < completedTurnHold.expiresAt) {
      // If this is the current user's hold, return null - dice shown in player area instead
      if (completedTurnHold.playerId === myPlayer?.id) {
        console.log(`${logPrefix} returning null for my completed hold - shown in player area`);
        return null;
      }
      // For OTHER players' completed holds, show their dice on felt
      console.log(`${logPrefix} returning completedTurnHold for other player: playerId=${completedTurnHold.playerId}`);
      return {
        roundId: presentationRoundId,
        playerId: completedTurnHold.playerId,
        dice: completedTurnHold.dice,
        rollsRemaining: 0,
        isRolling: false,
        heldMaskBeforeComplete: completedTurnHold.heldMaskBeforeComplete,
        rollKey: completedTurnHold.rollKey,
        isCompletedHold: true,
      };
    }
    
    if (!enabled || gamePhase !== "playing" || !currentTurnPlayerId) {
      console.log(`${logPrefix} returning null: enabled=${enabled}, gamePhase=${gamePhase}, currentTurnPlayerId=${currentTurnPlayerId}`);
      return null;
    }

    // IMPORTANT: avoid flashing unrolled dice during turn transitions.
    // Prefer the authoritative DB state for the current player, then fall back to local state.
    if (isMyTurn) {
      const dbState = myPlayer ? horsesState?.playerStates?.[myPlayer.id] : null;

      const localDice = localHand.dice;
      const localRollsRemaining = localHand.rollsRemaining;

      const dbDice = dbState?.dice as any[] | undefined;
      const dbRollsRemaining = typeof dbState?.rollsRemaining === "number" ? dbState.rollsRemaining : undefined;

      // IMPORTANT: while the user is interacting (roll/hold), the DB state will lag behind.
      // Prefer localHand until the animation completes AND until DB is at least as "new" as local.
      const withinProtectionWindow = Date.now() - lastLocalEditAtRef.current < LOCAL_STATE_PROTECTION_MS;

      const localIsBlank = localDice.every((d: any) => !d?.value);
      const dbIsBlank = Array.isArray(dbDice) ? dbDice.every((d: any) => !d?.value) : true;

      // DB is "behind" local if it still shows more rolls remaining (or blank dice while local has values)
      const dbBehind = typeof dbRollsRemaining === "number" && dbRollsRemaining > localRollsRemaining;
      const dbClearlyStale = dbIsBlank && !localIsBlank;

      // If DB has the *same* rollsRemaining but different dice, it's still stale (out-of-order snapshot).
      // Keep local until DB catches up (bounded by a max wait to avoid permanent lock).
      const dbMatchesLocal =
        Array.isArray(dbDice) &&
        dbDice.length === localDice.length &&
        dbDice.every((d: any, i: number) => {
          const l = (localDice as any)[i];
          return (
            (d?.value ?? 0) === (l?.value ?? 0) &&
            !!d?.isHeld === !!l?.isHeld &&
            (!!d?.isSCC === !!l?.isSCC)
          );
        });

      const awaitingDbSync =
        !!dbDice &&
        !dbMatchesLocal &&
        Date.now() - lastLocalEditAtRef.current < 10_000;

      const preferLocal = isRolling || withinProtectionWindow || dbBehind || dbClearlyStale || awaitingDbSync;

      // Debug logging for preferLocal decision
      const timeSinceEdit = Date.now() - lastLocalEditAtRef.current;
      const localVals = localDice.map((d: any) => d.value).join(",");
      const dbVals = (dbDice || []).map((d: any) => d?.value).join(",");
      const preferKey = `${preferLocal}|${isRolling}|${withinProtectionWindow}|${dbBehind}|${dbClearlyStale}|${awaitingDbSync}|${localRollsRemaining}|${dbRollsRemaining}|${localVals}|${dbVals}`;
      if (preferKey !== lastPreferDebugKeyRef.current) {
        lastPreferDebugKeyRef.current = preferKey;
      }

      if (!preferLocal) {
      }

      const dice = preferLocal ? localDice : (dbDice ?? localDice);
      const rollsRemaining = preferLocal
        ? localRollsRemaining
        : (typeof dbRollsRemaining === "number" ? dbRollsRemaining : localRollsRemaining);

      const dbRollKey = typeof (dbState as any)?.rollKey === "number" ? (dbState as any).rollKey : undefined;
      const rollKey = preferLocal ? localRollKeyRef.current : (dbRollKey ?? localRollKeyRef.current);

      const isBlank = dice.every((d: any) => !d?.value);
      if (isBlank && rollsRemaining === 3 && !isRolling) {
        console.log(`${logPrefix} MY TURN returning null: isBlank=${isBlank}, rollsRemaining=${rollsRemaining}, isRolling=${isRolling}`);
        return null;
      }

      // Include heldMaskBeforeComplete so DiceTableLayout can properly animate
      // which dice were NOT held before the roll (including newly auto-held SCC dice)
      const heldMaskForAnimation = heldMaskAtLastRollStartRef.current;
      const heldCountForAnimation = heldMaskForAnimation?.filter(Boolean).length;

      return {
        roundId: presentationRoundId,
        dice,
        rollsRemaining,
        isRolling,
        canToggle: rollsRemaining < 3 && rollsRemaining > 0,
        rollKey,
        heldMaskBeforeComplete: heldMaskForAnimation ?? undefined,
        heldCountBeforeComplete: heldCountForAnimation,
        // isQualified not needed for active player - they're still rolling
      };
    }

    // CRITICAL: When a bot turn is actively being animated, ALWAYS use botDisplayState.
    // This prevents DB/realtime updates from causing flicker by overwriting the animation state.
    if (botTurnActiveId === currentTurnPlayerId && botDisplayState?.playerId === currentTurnPlayerId) {
      const isBlank = botDisplayState.dice.every((d: any) => !d?.value);
      if (isBlank && !botDisplayState.isRolling) {
        console.log(`${logPrefix} BOT ACTIVE returning null: isBlank=${isBlank}, isRolling=${botDisplayState.isRolling}`);
        return null;
      }
      console.log(`${logPrefix} BOT ACTIVE returning botDisplayState: dice=${JSON.stringify(botDisplayState.dice.map(d => d.value))}, isRolling=${botDisplayState.isRolling}`);
      return { ...botDisplayState, roundId: presentationRoundId };
    }

    // For non-active bot turns, still prefer botDisplayState if it matches
    if (currentTurnPlayer?.is_bot && botDisplayState?.playerId === currentTurnPlayerId) {
      const isBlank = botDisplayState.dice.every((d: any) => !d?.value);
      if (isBlank && !botDisplayState.isRolling) {
        console.log(`${logPrefix} BOT NON-ACTIVE returning null: isBlank=${isBlank}, isRolling=${botDisplayState.isRolling}`);
        return null;
      }
      console.log(`${logPrefix} BOT NON-ACTIVE returning botDisplayState: dice=${JSON.stringify(botDisplayState.dice.map(d => d.value))}, isRolling=${botDisplayState.isRolling}`);
      return { ...botDisplayState, roundId: presentationRoundId };
    }

    // OBSERVER DISPLAY STATE: When observing another human player, use dedicated display state
    // during animation. This mirrors how botDisplayState works - it's decoupled from DB updates
    // during the animation period, preventing flicker and dice disappearing.
    if (observerDisplayState?.playerId === currentTurnPlayerId) {
      const dbState = horsesState?.playerStates?.[currentTurnPlayerId];
      const dbDice = (dbState?.dice as any[] | undefined) ?? undefined;

      const dbRollKey = typeof (dbState as any)?.rollKey === "number" ? (dbState as any).rollKey : undefined;
      const maxSeenRollKey = maxSeenRollKeyRef.current[currentTurnPlayerId] ?? 0;
      
      const sameRoll =
        typeof dbRollKey === "number" && typeof observerDisplayState.rollKey === "number" && dbRollKey === observerDisplayState.rollKey;

      // FIX: For same-roll updates, use DB dice directly when they pass the holdSeq guard.
      // Previously we blocked DB dice here and waited for the observer effect to update
      // observerDisplayState, but that created a 1-frame lag where stale isHeld values
      // caused dice to hop between scatter ↔ held positions.
      // By applying the holdSeq guard inline, the useMemo returns correct dice immediately.
      if (sameRoll) {
        const dbHoldSeq = (dbState as any)?.holdSeq ?? 0;
        const rollKeyStr = `${currentTurnPlayerId}:${dbRollKey}`;
        const maxSeenHoldSeq = maxHoldSeqPerRollKeyRef.current[rollKeyStr] ?? 0;
        const canStillHold = (dbState?.rollsRemaining ?? 0) > 0;
        const nextDice = (dbDice as (HorsesDieType | SCCDieType)[] | undefined) ?? observerDisplayState.dice;
        const nextHeldSig = nextDice.map((d: any) => (d?.isHeld ? 1 : 0)).join("|");
        const prevHeldSig = observerDisplayState.dice.map((d: any) => (d?.isHeld ? 1 : 0)).join("|");
        const equalSeqHeldRegression = canStillHold && dbHoldSeq === maxSeenHoldSeq && nextHeldSig !== prevHeldSig;

        // Use DB dice if holdSeq is monotonically advancing (not stale)
        if (!equalSeqHeldRegression && (!canStillHold || dbHoldSeq >= maxSeenHoldSeq)) {
          if (dbHoldSeq > maxSeenHoldSeq) {
            maxHoldSeqPerRollKeyRef.current[rollKeyStr] = dbHoldSeq;
          }
          return {
            ...observerDisplayState,
            roundId: presentationRoundId,
            dice: nextDice,
            rollsRemaining: dbState?.rollsRemaining ?? observerDisplayState.rollsRemaining,
            heldMaskBeforeComplete: (dbState as any)?.heldMaskBeforeComplete ?? observerDisplayState.heldMaskBeforeComplete,
            heldCountBeforeComplete: (dbState as any)?.heldCountBeforeComplete ?? observerDisplayState.heldCountBeforeComplete,
            holdSeq: dbHoldSeq,
          };
        }

        // Stale DB update — keep current observerDisplayState
        return {
          ...observerDisplayState,
          roundId: presentationRoundId,
        };
      }

      // Different rollKey: check if DB has a newer roll
      const dbRollKeyIsStale = typeof dbRollKey === "number" && dbRollKey < maxSeenRollKey;

      const shouldUseDb =
        Array.isArray(dbDice) &&
        dbDice.length > 0 &&
        !dbRollKeyIsStale;

      const dice = shouldUseDb ? ((dbDice as any) ?? observerDisplayState.dice) : observerDisplayState.dice;

      console.log(
        `${logPrefix} OBSERVER DISPLAY returning: dice=${JSON.stringify((dice as any[]).map((d: any) => d.value))}, isRolling=${observerDisplayState.isRolling}, rollKey=${observerDisplayState.rollKey}, dbRollKey=${dbRollKey}`,
      );

      return {
        ...observerDisplayState,
        roundId: presentationRoundId,
        dice,
      };
    }

    // Fallback to DB state for human players (who aren't "me" and don't have active observer display)
    const state = horsesState?.playerStates?.[currentTurnPlayerId];
    
    if (!state) {
      console.log(`${logPrefix} FALLBACK returning null: no state for player ${currentTurnPlayerId}`);
      return null;
    }

    const rollKey = typeof (state as any).rollKey === "number" ? (state as any).rollKey : undefined;
    const isBlank = state.dice.every((d: any) => !d?.value);

    // If a roll has started (rollKey exists), keep a non-null feltDice even if values haven't propagated yet.
    // This prevents observer view gaps when rollKey arrives before dice values.
    if (isBlank && state.rollsRemaining === 3 && rollKey === undefined) {
      console.log(`${logPrefix} FALLBACK returning null: isBlank=${isBlank}, rollsRemaining=${state.rollsRemaining}`);
      return null;
    }

    console.log(`${logPrefix} FALLBACK returning DB state: dice=${JSON.stringify(state.dice.map((d: any) => d.value))}, rollsRemaining=${state.rollsRemaining}`);
    // Check if the SCC hand is qualified (for unused dice visual)
    const isQualified = isSCC && state.result 
      ? (state.result as any).isQualified 
      : undefined;
    
    return {
      roundId: presentationRoundId,
      dice: state.dice,
      rollsRemaining: state.rollsRemaining,
      isRolling: false, // Not animating
      heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
      heldCountBeforeComplete: (state as any).heldCountBeforeComplete,
      rollKey: (state as any).rollKey,
      isQualified,
    };
  }, [
    enabled,
    gamePhase,
    currentTurnPlayerId,
    isMyTurn,
    myPlayer,
    horsesState?.playerStates,
    localHand.dice,
    localHand.rollsRemaining,
    isRolling,
    currentTurnPlayer?.is_bot,
    presentationRoundId,
    botDisplayState,
    botTurnActiveId,
    completedTurnHold,
    isSCC,
    observerDisplayState,
  ]);

  useEffect(() => {
    if (rawFeltDice) {
      lastFeltDiceRef.current = {
        roundId: (rawFeltDice as any)?.roundId ?? presentationRoundId ?? null,
        playerId: (rawFeltDice as any)?.playerId ?? currentTurnPlayerId ?? null,
        value: rawFeltDice,
      };
      lastFeltDiceAtRef.current = Date.now();
    }
  }, [rawFeltDice, currentTurnPlayerId, presentationRoundId]);

  // OBSERVER ROLL DETECTION (HUMAN vs HUMAN):
  // Make observer rolls behave like bot rolls: once we detect a rollKey change, we show a protected
  // display state for the whole animation window, and we NEVER clear it on a timer (clearing causes
  // gaps where DB state is blank/out-of-order → flicker/disappearing dice).
  //
  // CRITICAL: read from `incomingHorsesState` (authoritative) — NOT presentationState.
  // Presentation lags behind authoritative due to identity gating / visual-contract sequencing,
  // which delays the observer fly-in animation. The fly-in must start the instant the authoritative
  // snapshot arrives. Display state (observerDisplayState) is still rendered above presentation,
  // so triggering off authoritative does not race with presentation updates.
  useEffect(() => {
    if (!enabled) return;
    const authState = incomingHorsesStateRef.current;
    const currentTurnPlayerId = authState?.currentTurnPlayerId ?? null;
    if (!currentTurnPlayerId) return;
    if (currentTurnPlayerId === myPlayer?.id) return; // I'm rolling, not observing
    const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
    if (turnPlayer?.is_bot) return; // Bot rolls handled by botDisplayState

    const state = authState?.playerStates?.[currentTurnPlayerId];
    if (!state) return;

    const newRollKey = (state as any).rollKey;
    if (typeof newRollKey !== "number") return;

    const prevRollKey = lastObservedRollKeyRef.current[currentTurnPlayerId];
    const maxSeenRollKey = maxSeenRollKeyRef.current[currentTurnPlayerId] ?? 0;

    // MONOTONICITY GUARD: If this rollKey is older than the max we've seen, it's stale data.
    // This happens when out-of-order realtime updates arrive. Ignore them completely.
    if (newRollKey < maxSeenRollKey) {
      console.log(
        `[OBSERVER_ROLL] REJECTED stale rollKey ${newRollKey} < maxSeen ${maxSeenRollKey} for ${currentTurnPlayerId}`,
      );
      persistSyncDebugEvent({
        gameId: gameId ?? null,
        gameType: resolvedGameType,
        handNumber: monotonicHandNumber,
        roundId: currentRoundId,
        eventType: 'invariant', severity: 'warn',
        eventName: 'horses-observer-flyin-decision',
        payload: {
          decision: 'rejected-stale',
          rollerId: currentTurnPlayerId.slice(0, 8),
          newRollKey, maxSeenRollKey, prevRollKey: prevRollKey ?? null,
          rollsRemaining: state.rollsRemaining,
          isComplete: !!state.isComplete,
          tsClient: Date.now(),
        },
      });
      return;
    }

    // Update max seen rollKey (only ever increases)
    if (newRollKey > maxSeenRollKey) {
      maxSeenRollKeyRef.current[currentTurnPlayerId] = newRollKey;
    }

    // P0 FIX: do NOT short-circuit terminal completion when this is also a NEW rollKey.
    // The previous behavior (return early on state.isComplete) caused observers to bypass
    // the fly-in for the terminal (3rd) roll entirely — animation never ran for the roll
    // that actually produced the final dice. Only treat isComplete as a "post-completion
    // bookkeeping bump" when the rollKey hasn't advanced since we last observed.
    const isNewRollKeyHere = newRollKey !== prevRollKey;
    if (state.isComplete && !isNewRollKeyHere) {
      if (observerRollingTimerRef.current) {
        window.clearTimeout(observerRollingTimerRef.current);
        observerRollingTimerRef.current = null;
      }
      lastObservedRollKeyRef.current[currentTurnPlayerId] = newRollKey;
      const finalDice = (state.dice as any[]) ?? [];
      setObserverDisplayState((prev) => {
        if (!prev || prev.playerId !== currentTurnPlayerId) return prev;
        return {
          ...prev,
          dice: finalDice as (HorsesDieType | SCCDieType)[],
          isRolling: false,
          preRollSig: undefined,
        };
      });
      return;
    }

    // Detect a new roll start (intermediate or terminal).
    if (isNewRollKeyHere) {
      // Track what rollsRemaining was BEFORE this new rollKey, so we can distinguish:
      // - Roll 3 completing (prevRollsRemaining=1 -> rollsRemaining=0) = ANIMATE
      // - Bookkeeping bump after completion (prevRollsRemaining=0 -> rollsRemaining=0) = SKIP
      const prevRollsRemaining = lastObservedRollsRemainingRef.current[currentTurnPlayerId];
      lastObservedRollKeyRef.current[currentTurnPlayerId] = newRollKey;
      lastObservedRollsRemainingRef.current[currentTurnPlayerId] = state.rollsRemaining;

      // FIX #1: Roll-3 refire prevention (refined)
      // Only skip animation if BOTH prev AND current rollsRemaining are 0.
      // That indicates a post-completion bookkeeping rollKey bump, not a real roll.
      // If prevRollsRemaining was > 0 (or undefined on first obs), this IS roll 3 and needs animation.
      const wasAlreadyComplete = prevRollsRemaining === 0;
      const isNowComplete = state.rollsRemaining === 0;
      
      if (wasAlreadyComplete && isNowComplete) {
        
        console.log(
          `[OBSERVER_ROLL] rollKey change for ${currentTurnPlayerId}: ${prevRollKey} -> ${newRollKey} SKIPPED (already complete, bookkeeping)`,
        );
        persistSyncDebugEvent({
          gameId: gameId ?? null,
          gameType: resolvedGameType,
          handNumber: monotonicHandNumber,
          roundId: currentRoundId,
          eventType: 'invariant', severity: 'info',
          eventName: 'horses-observer-flyin-decision',
          payload: {
            decision: 'skipped-bookkeeping',
            rollerId: currentTurnPlayerId.slice(0, 8),
            prevRollKey: prevRollKey ?? null, newRollKey,
            prevRollsRemaining: prevRollsRemaining ?? null,
            rollsRemaining: state.rollsRemaining,
            tsClient: Date.now(),
          },
        });
        
        // Set final display state without animation
        const finalDice = (state.dice as any[]) ?? [];
        const derivedHeldCount = finalDice.filter((d: any) => !!d?.isHeld).length;
        
        setObserverDisplayState({
          playerId: currentTurnPlayerId,
          dice: finalDice as (HorsesDieType | SCCDieType)[],
          rollsRemaining: 0,
          isRolling: false,
          heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
          heldCountBeforeComplete: derivedHeldCount,
          rollKey: typeof prevRollKey === "number" ? prevRollKey : newRollKey,
          preRollSig: undefined,
        });
        return;
      }

      // P0 FIX: discriminate hydration catch-up from a live first roll using rollStartedAt
      // freshness, NOT `prevRollKey === undefined`. A null prevRollKey is true on EVERY
      // first real roll of a turn (the observer never saw a baseline for this player on
      // this turn), so the old guard incorrectly dropped the very first intermediate roll
      // — and combined with terminal rolls bypassing this branch, it caused "ZERO fly-in
      // until terminal" on SCC and "missed roll 2" on Horses.
      //
      // Rule: if rollStartedAt exists and is within the animation window, this is a LIVE
      // roll → animate, regardless of prevRollKey. If rollStartedAt is missing/stale, this
      // is a hydration snapshot → snap to final without animation.
      const rollStartedAt = (state as any)?.rollStartedAt;
      const localDurationFull = state.rollsRemaining === 2 ? HORSES_FIRST_ROLL_ANIMATION_MS : HORSES_ROLL_AGAIN_ANIMATION_MS;
      let durationMs: number = localDurationFull;
      let isLiveRoll = true;

      if (rollStartedAt) {
        const elapsed = Date.now() - new Date(rollStartedAt).getTime();
        if (elapsed > HORSES_ROLL_AGAIN_ANIMATION_MS + 500) {
          isLiveRoll = false;
        } else {
          durationMs = Math.max(200, localDurationFull - elapsed);
        }
      } else if (prevRollKey === undefined) {
        // No timestamp AND we've never observed this player → treat as hydration catch-up.
        isLiveRoll = false;
      }

      if (!isLiveRoll) {
        const finalDice = (state.dice as any[]) ?? [];
        const derivedHeldCount2 = finalDice.filter((d: any) => !!d?.isHeld).length;
        lastObservedRollKeyRef.current[currentTurnPlayerId] = newRollKey;
        lastObservedRollsRemainingRef.current[currentTurnPlayerId] = state.rollsRemaining;
        setObserverDisplayState({
          playerId: currentTurnPlayerId,
          dice: finalDice as (HorsesDieType | SCCDieType)[],
          rollsRemaining: state.rollsRemaining,
          isRolling: false,
          heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
          heldCountBeforeComplete: derivedHeldCount2,
          rollKey: newRollKey,
          preRollSig: undefined,
        });
        persistSyncDebugEvent({
          gameId: gameId ?? null,
          gameType: resolvedGameType,
          handNumber: monotonicHandNumber,
          roundId: currentRoundId,
          eventType: 'invariant', severity: 'info',
          eventName: 'horses-observer-flyin-decision',
          payload: {
            decision: 'hydration-snap',
            rollerId: currentTurnPlayerId.slice(0, 8),
            newRollKey,
            hasRollStartedAt: !!rollStartedAt,
            rollsRemaining: state.rollsRemaining,
            isComplete: !!state.isComplete,
            tsClient: Date.now(),
          },
        });
        return;
      }

      console.log(
        `[OBSERVER_ROLL] rollKey change for ${currentTurnPlayerId}: ${prevRollKey} -> ${newRollKey} (duration=${durationMs}ms, isComplete=${state.isComplete})`,
      );

      if (observerRollingTimerRef.current) {
        window.clearTimeout(observerRollingTimerRef.current);
        observerRollingTimerRef.current = null;
      }

      const preRollDice = (state.dice as any[]) ?? [];
      const preRollSig = preRollDice.map((d) => `${d?.value ?? 0}:${d?.isHeld ? 1 : 0}`).join("|");
      const displayDice = preRollDice;
      const derivedHeldCount = preRollDice.filter((d: any) => !!d?.isHeld).length;

      const rollKeyStr = `${currentTurnPlayerId}:${newRollKey}`;
      const dbHoldSeq = (state as any).holdSeq ?? 0;
      maxHoldSeqPerRollKeyRef.current[rollKeyStr] = dbHoldSeq;

      setObserverDisplayState({
        playerId: currentTurnPlayerId,
        dice: displayDice as (HorsesDieType | SCCDieType)[],
        rollsRemaining: state.rollsRemaining,
        isRolling: true,
        heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
        heldCountBeforeComplete: derivedHeldCount,
        rollKey: newRollKey,
        holdSeq: dbHoldSeq,
        preRollSig,
      });

      persistSyncDebugEvent({
        gameId: gameId ?? null,
        gameType: resolvedGameType,
        handNumber: monotonicHandNumber,
        roundId: currentRoundId,
        eventType: 'invariant', severity: 'info',
        eventName: 'horses-observer-flyin-decision',
        payload: {
          decision: 'fired',
          rollerId: currentTurnPlayerId?.slice(0, 8) ?? null,
          rollKey: newRollKey,
          prevRollKey: prevRollKey ?? null,
          rollsRemaining: state.rollsRemaining,
          isComplete: !!state.isComplete,
          durationMs,
          usedRollStartedAt: !!rollStartedAt,
          tsClient: Date.now(),
        },
      });

      observerRollingTimerRef.current = window.setTimeout(() => {
        setObserverDisplayState((prev) => {
          if (!prev || prev.playerId !== currentTurnPlayerId) return prev;
          if (prev.rollKey !== newRollKey) return prev;
          // On terminal completion, sync to final DB dice values when animation ends so
          // the completedTurnHold overlay layers on top of the correct final frame.
          const finalDiceAfter = state.isComplete ? ((state.dice as any[]) ?? prev.dice) : prev.dice;
          return { ...prev, dice: finalDiceAfter as (HorsesDieType | SCCDieType)[], isRolling: false };
        });
        observerRollingTimerRef.current = null;
      }, durationMs);

      return;
    }

    // Same rollKey: keep observer display state up to date if DB dice arrive after rollKey.
    // CRITICAL: Protect against held-state regression from out-of-order realtime updates.
    setObserverDisplayState((prev) => {
      if (!prev || prev.playerId !== currentTurnPlayerId) return prev;
      if (prev.rollKey !== newRollKey) return prev;

      const nextDice = state.dice as any[];
      const nextSig = nextDice.map((d) => `${d?.value ?? 0}:${d?.isHeld ? 1 : 0}`).join("|");
      const prevSig = (prev.dice as any[]).map((d) => `${d?.value ?? 0}:${d?.isHeld ? 1 : 0}`).join("|");
      const nextHeldSig = nextDice.map((d) => (d?.isHeld ? 1 : 0)).join("|");
      const prevHeldSig = (prev.dice as any[]).map((d) => (d?.isHeld ? 1 : 0)).join("|");

      // While the roll animation is running, do NOT replace our masked dice with the pre-roll values.
      // Only accept updates once the DB dice actually change vs the roll-start snapshot.
      // EXCEPTION: On roll 3 (rollsRemaining === 0), skip this guard to allow final dice values through for animation.
      const isRoll3 = state.rollsRemaining === 0;
      if (!isRoll3 && prev.isRolling && prev.preRollSig && nextSig === prev.preRollSig) {
        return prev;
      }

      if (nextSig === prevSig) return prev;

      // FIX: Prevent dice-state regression during same-rollKey updates using holdSeq.
      // holdSeq increments on every hold/unhold action, so it correctly handles unhold actions.
      // Unlike held count, a player can legitimately go from 3 held to 2 held.
      // EXCEPTION: On roll 3 (rollsRemaining === 0), players can't change holds anymore,
      // so we skip the holdSeq guard to allow the final dice values through for animation.
      const nextHoldSeq = (state as any).holdSeq ?? 0;
      
      // Only apply holdSeq guard if the player can still hold/unhold (rollsRemaining > 0)
      const canStillHold = state.rollsRemaining > 0;
      
      // FIX: Compare against prev.holdSeq (the last ACCEPTED state's holdSeq) instead of
      // maxHoldSeqPerRollKeyRef, which can be updated by the rawFeltDice useMemo during render.
      // This prevents a race where useMemo updates the shared ref first, then this effect
      // incorrectly rejects a legitimate update because the ref already matches the incoming value.
      const prevHoldSeq = (prev as any).holdSeq ?? 0;
      
      if (canStillHold && nextHoldSeq < prevHoldSeq) {
        // Stale update - has older sequence number than what we last accepted. Reject it.
        console.log(
          `[OBSERVER_ROLL] Rejecting same-rollKey update: holdSeq (${nextHoldSeq}) < prevHoldSeq (${prevHoldSeq})`,
        );
        return prev;
      }

      if (canStillHold && nextHoldSeq === prevHoldSeq && nextHeldSig !== prevHeldSig) {
        console.log(
          `[OBSERVER_ROLL] Rejecting same-rollKey equal-holdSeq held regression: holdSeq (${nextHoldSeq}) heldSig ${prevHeldSig} -> ${nextHeldSig}`,
        );
        return prev;
      }
      
      // Update the max seen for this rollKey (still useful for the useMemo path)
      const rollKeyStrForRef = `${currentTurnPlayerId}:${newRollKey}`;
      maxHoldSeqPerRollKeyRef.current[rollKeyStrForRef] = nextHoldSeq;

      return {
        ...prev,
        dice: state.dice as (HorsesDieType | SCCDieType)[],
        rollsRemaining: state.rollsRemaining,
        heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
        heldCountBeforeComplete: (state as any).heldCountBeforeComplete,
        holdSeq: nextHoldSeq,
      };
    });

    return () => {
      if (observerRollingTimerRef.current) {
        window.clearTimeout(observerRollingTimerRef.current);
        observerRollingTimerRef.current = null;
      }
    };
  }, [
    enabled,
    myPlayer?.id,
    players,
    // Authoritative state slices (NOT presentationState) — see comment above.
    incomingHorsesState?.currentTurnPlayerId,
    incomingHorsesState?.playerStates?.[incomingHorsesState?.currentTurnPlayerId ?? ""]?.rollsRemaining,
    (incomingHorsesState?.playerStates?.[incomingHorsesState?.currentTurnPlayerId ?? ""] as any)?.rollKey,
    (incomingHorsesState?.playerStates?.[incomingHorsesState?.currentTurnPlayerId ?? ""] as any)?.holdSeq,
    incomingHorsesState?.playerStates?.[incomingHorsesState?.currentTurnPlayerId ?? ""]?.isComplete,
  ]);

  const feltDice = useMemo(() => {
    if (rawFeltDice) return rawFeltDice;
    if (!enabled) return null;

    // If state is briefly unavailable (e.g. refetch/realtime gap), keep the last dice for a beat.
    // IMPORTANT: only reuse the cache if it's for the SAME player (prevents bot->you flash).
    // Extended from 400ms to 800ms to prevent flicker during turn transitions in Horses.
    const cached = lastFeltDiceRef.current;
    if (
      cached?.playerId === currentTurnPlayerId &&
      Date.now() - lastFeltDiceAtRef.current < 800
    ) {
      return cached.value;
    }

    return null;
  }, [rawFeltDice, enabled, currentTurnPlayerId]);

  // Calculate currently winning player IDs during play (not just at game end)
  const currentlyWinningPlayerIds = useMemo(() => {
    if (completedResults.length === 0) return [] as string[];
    // Use appropriate winner determination based on game type
    if (isSCC) {
      return determineSCCWinners(completedResults.map((r) => r.result as SCCHandResult)).map(
        (i) => completedResults[i].playerId,
      );
    }
    return determineWinners(completedResults.map((r) => r.result as HorsesHandResult)).map(
      (i) => completedResults[i].playerId,
    );
  }, [completedResults, isSCC]);

  // Get a player's completed hand result
  const getPlayerHandResult = useCallback(
    (playerId: string): HorsesHandResult | SCCHandResult | null => {
      const state = horsesState?.playerStates?.[playerId];
      if (state?.isComplete && state.result) return state.result;
      return null;
    },
    [horsesState?.playerStates],
  );

  // Get the current winning player's dice (for displaying "Beat:" badge)
  const getWinningPlayerDice = useCallback((): (HorsesDieType | SCCDieType)[] | null => {
    if (completedResults.length === 0) return null;
    const winningEntry = completedResults.reduce((best, curr) =>
      curr.result.rank > best.result.rank ? curr : best,
    );
    const state = horsesState?.playerStates?.[winningEntry.playerId];
    return state?.dice ?? null;
  }, [completedResults, horsesState?.playerStates]);

  // Check if the current best hand is tied (multiple players share it)
  const isCurrentWinningTied = currentlyWinningPlayerIds.length > 1;

  return {
    enabled,
    dealerGameId: controllerDealerGameId,
    currentRoundId,
    presentationRoundId,
    anteAmount,
    activePlayers,
    gamePhase,
    turnOrder,
    currentTurnPlayerId,
    currentTurnPlayer,
    currentTurnPlayerName: currentTurnPlayer ? getPlayerUsername(currentTurnPlayer) : null,
    isMyTurn,
    myPlayer,
    myState,
    localHand,
    isRolling,
    feltDice,
    winningPlayerIds,
    currentlyWinningPlayerIds,
    currentWinningResult,
    isCurrentWinningTied,
    getPlayerHandResult,
    getWinningPlayerDice,
    handleRoll,
    handleToggleHold,
    handleLockIn,
    // Debug buffer
    debugEvents,
    clearDebugEvents,
    // Timer state
    timeLeft,
    maxTime: effectiveMaxTime,
    // Turn announcement
    turnAnnouncement,
    // No Qualify animation state (SCC only)
    showNoQualifyAnimation,
    noQualifyPlayerName,
    handleNoQualifyAnimationComplete,
    // Midnight animation state (SCC only)
    showMidnightAnimation,
    midnightPlayerName,
    handleMidnightAnimationComplete,
    // Completed turn hold state (for showing dice before transitioning to badge)
    // Hard-gated by dealerGameScopeChanged so a prior dealer-game's hold can never
    // bleed into the new dealer-game's first render frame (P0 identity-boundary
    // invariant: no prior-game gameplay artifacts may survive a dealerGameId change).
    completedTurnHold: dealerGameScopeChanged ? null : completedTurnHold,
  };
}
