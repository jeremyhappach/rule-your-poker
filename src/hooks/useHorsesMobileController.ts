import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";
import { snapshotPlayerChips } from "@/lib/gameLogic";
import { logSitOutNextHandSet } from "@/lib/sittingOutDebugLog";
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
import { pushDiceTrace, isDiceTraceRecording } from "@/components/DiceTraceHUD";
import { logDiceRolls, getRollNumber } from "@/lib/diceAudit";

export interface HorsesPlayerForController {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot: boolean;
  sitting_out: boolean;
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

async function horsesAdvanceTurn(roundId: string, expectedCurrentPlayerId: string): Promise<HorsesStateFromDB | null> {
  const { data, error } = await supabase.rpc("horses_advance_turn" as any, {
    _round_id: roundId,
    _expected_current_player_id: expectedCurrentPlayerId,
  } as any);

  if (error) {
    console.error("[HORSES] horses_advance_turn failed:", error);
    return null;
  }

  return (data as any) as HorsesStateFromDB;
}

export interface UseHorsesMobileControllerArgs {
  enabled: boolean;
  gameId?: string;
  players: HorsesPlayerForController[];
  currentUserId: string | undefined;
  pot: number;
  anteAmount: number;
  dealerPosition: number;
  currentRoundId: string | null;
  horsesState: HorsesStateFromDB | null;
  gameType?: string; // 'horses' or 'ship-captain-crew'
}

// === DICE ANIMATION TIMING CONSTANTS (SINGLE SOURCE OF TRUTH) ===
// Active player roll mask: how long the "rolling" animation shows in the active window
const HORSES_FIRST_ROLL_ANIMATION_MS = 1300;   // Roll 1: ~1.3s
const HORSES_ROLL_AGAIN_ANIMATION_MS = 1800;   // Rolls 2/3: ~1.8s (was 2500 - too long)
const HORSES_POST_TURN_PAUSE_MS = 400;         // Pause after lock-in before advancing (was 650)
// Local state protection: prevent DB overwrites during animation
const LOCAL_STATE_PROTECTION_MS = HORSES_ROLL_AGAIN_ANIMATION_MS + 200;
const HORSES_TURN_TIMER_SECONDS = 30;
const BOT_TURN_START_DELAY_MS = 400;           // Bot start delay (was 500)

export function useHorsesMobileController({
  enabled,
  gameId,
  players,
  currentUserId,
  pot,
  anteAmount,
  dealerPosition,
  currentRoundId,
  horsesState,
  gameType = 'horses',
}: UseHorsesMobileControllerArgs) {
  // Determine if this is a Ship Captain Crew game
  const isSCC = gameType === 'ship-captain-crew';
  
  // Local state for dice rolling animation (only used by the local user when it's their turn)
  // Use union type to support both game types
  const [localHand, setLocalHand] = useState<HorsesHand | SCCHand>(() => 
    isSCC ? createInitialSCCHand() : createInitialHand()
  );
  
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
  
  // HELD COUNT MONOTONICITY: Track the max held count seen per (playerId, rollKey).
  // For the SAME rollKey, held count should only ever increase (player can hold more dice, never fewer).
  // This prevents out-of-order realtime updates from regressing held state within a roll.
  const maxHeldCountPerRollKeyRef = useRef<Record<string, number>>({});

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
  const lastFeltDiceRef = useRef<{ playerId: string | null; value: any } | null>(null);
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
      console.log(`[SYNC_DEBUG] New turn detected, clearing protection: ${myKey}`);
      logDebug("new_turn", `Cleared protection for ${myKey}`);
      
      // Reset to fresh hand immediately - DB state will sync in below
      const freshHand = isSCC ? createInitialSCCHand() : createInitialHand();
      setLocalHand(freshHand);
    }

    // While rolling (and shortly after interactions), don't let DB snapshots overwrite the felt.
    if (isRolling) {
      console.log(`[SYNC_DEBUG] Blocked sync: isRolling=true`);
      logDebug("sync_blocked", "isRolling=true");
      return;
    }

    // If the user just interacted, don't let a stale DB snapshot overwrite their felt.
    // Must exceed the longest animation duration to prevent flicker during roll animations.
    const timeSinceEdit = Date.now() - lastLocalEditAtRef.current;
    if (timeSinceEdit < LOCAL_STATE_PROTECTION_MS && lastLocalEditAtRef.current > 0) {
      console.log(
        `[SYNC_DEBUG] Blocked sync: within protection window (${timeSinceEdit}ms < ${LOCAL_STATE_PROTECTION_MS}ms)`,
      );
      logDebug(
        "sync_blocked",
        `withinWindow ${timeSinceEdit}ms < ${LOCAL_STATE_PROTECTION_MS}ms`,
        { timeSinceEdit, LOCAL_STATE_PROTECTION_MS },
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
          logDebug(
            "sync_blocked",
            `dbBehind dbRollsRemaining=${dbRollsRemaining} > localRollsRemaining=${localRollsRemaining}`,
            { dbRollsRemaining, localRollsRemaining },
          );
          return;
        }
        if (dbDiceBlank && !localDiceBlank) {
          console.log(`[SYNC_DEBUG] Blocked sync: dbDiceBlank but local has values`);
          logDebug("sync_blocked", "dbDiceBlank but local has values");
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
          logDebug(
            "sync_blocked",
            `dbMismatch sameRR=${dbRollsRemaining} timeSinceEdit=${timeSinceEdit}ms`,
            { dbRollsRemaining, localRollsRemaining, timeSinceEdit },
          );
          return;
        }
      }

      const dbVals = (myState.dice as any[]).map((d: any) => d?.value).join(",");
      const localVals = (localHand.dice as any[]).map((d: any) => d?.value).join(",");
      console.log(
        `[SYNC_DEBUG] *** APPLYING DB STATE *** dbDice=[${dbVals}], dbRollsRemaining=${dbRollsRemaining}`,
      );
      console.log(`[SYNC_DEBUG] Local was: dice=[${localVals}], rollsRemaining=${localRollsRemaining}`);
      logDebug("sync_apply", `db=[${dbVals}] rr=${dbRollsRemaining} (local=[${localVals}] rr=${localRollsRemaining})`, {
        dbVals,
        localVals,
        dbRollsRemaining,
        localRollsRemaining,
      });

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
        console.log("[HORSES] Recovery: all players complete, setting phase to complete");
        await updateHorsesState(currentRoundId, {
          ...baseState,
          currentTurnPlayerId: null,
          gamePhase: "complete",
        });
      } else {
        // Set the next incomplete player as current
        console.log("[HORSES] Recovery: setting currentTurnPlayerId to", nextPlayerId);
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
    ) => {
      if (!enabled) return;
      if (!currentRoundId || !myPlayer) return;

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
      };

      await horsesSetPlayerState(currentRoundId, myPlayer.id, newPlayerState);
    },
    [enabled, currentRoundId, myPlayer],
  );

  const advanceToNextTurn = useCallback(
    async (expectedCurrentPlayerId?: string | null) => {
      if (!enabled) return;
      if (!currentRoundId) return;

      const expected = expectedCurrentPlayerId ?? horsesState?.currentTurnPlayerId;
      if (!expected) return;

      const newState = await horsesAdvanceTurn(currentRoundId, expected);
      
      // NOTE: The horses_advance_turn RPC now atomically sets turnDeadline for the next player.
      // No need for follow-up update - the RPC handles it to prevent race conditions.
      if (newState?.currentTurnPlayerId && newState.gamePhase === "playing") {
        console.log("[HORSES] Turn advanced to:", newState.currentTurnPlayerId, "deadline:", newState.turnDeadline);
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

  // TURN COMPLETION HOLD EFFECT: When a player completes their turn, capture their dice state
  // and hold it visible for 3 seconds. This creates a smooth transition without flicker.
  useEffect(() => {
    if (!enabled || gamePhase !== "playing") return;
    if (!currentRoundId || !currentTurnPlayerId) return;
    if (!currentTurnState?.isComplete || !currentTurnState?.result) return;

    const holdKey = `${currentRoundId}:${currentTurnPlayerId}`;
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

    // TRACE: Setting completedTurnHold
    if (isDiceTraceRecording()) {
      pushDiceTrace("completedTurnHold:set", {
        playerId: currentTurnPlayerId,
        rollKey: holdPayload.rollKey,
        heldCount: holdPayload.heldCountBeforeComplete,
        extra: { holdDuration, expiresAt },
      });
    }

    setCompletedTurnHold(holdPayload);

    // Clear the hold after the duration
    if (completedTurnHoldTimerRef.current) {
      window.clearTimeout(completedTurnHoldTimerRef.current);
    }
    completedTurnHoldTimerRef.current = window.setTimeout(() => {
      // TRACE: Clearing completedTurnHold
      if (isDiceTraceRecording()) {
        pushDiceTrace("completedTurnHold:clear", {
          playerId: currentTurnPlayerId,
        });
      }
      setCompletedTurnHold(null);
      completedTurnHoldTimerRef.current = null;
    }, holdDuration);
  }, [
    enabled,
    gamePhase,
    currentRoundId,
    currentTurnPlayerId,
    currentTurnState?.isComplete,
    currentTurnState?.result,
  ]);

  useEffect(() => {
    if (!enabled || gamePhase !== "playing") return;
    if (!currentRoundId || !currentTurnPlayerId || !currentTurnPlayer) return;
    if (!currentTurnState?.isComplete || !currentTurnState?.result) return;

    const announceKey = `${currentRoundId}:${currentTurnPlayerId}`;
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
    currentRoundId,
    currentTurnPlayerId,
    currentTurnPlayer,
    currentTurnState?.isComplete,
    currentTurnState?.result,
    getPlayerUsername,
  ]);

  // Detect when the CURRENT USER's SCC hand is complete and they didn't qualify
  // Only show the overlay to the player who rolled no qualify, not to spectators
  useEffect(() => {
    if (!enabled || !isSCC) return;
    if (!currentRoundId) return;
    if (!myPlayer) return;
    
    // Only check the current user's state
    const myPlayerState = horsesState?.playerStates?.[myPlayer.id];
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
  }, [enabled, isSCC, currentRoundId, myPlayer, horsesState?.playerStates]);

  // Handler to reset the no qualify animation
  const handleNoQualifyAnimationComplete = useCallback(() => {
    setShowNoQualifyAnimation(false);
    setNoQualifyPlayerName(null);
  }, []);

  // Detect when ANY player's SCC hand is complete and they rolled Midnight (cargo = 12)
  useEffect(() => {
    if (!enabled || !isSCC) return;
    if (!currentRoundId) return;
    
    const playerStates = horsesState?.playerStates;
    if (!playerStates) return;
    
    for (const [playerId, state] of Object.entries(playerStates)) {
      if (!state.isComplete || !state.result) continue;
      
      const result = state.result as SCCHandResult;
      // Midnight = qualified with cargo of 12 (highest possible)
      if (result.isQualified && result.cargoSum === 12) {
        const midnightKey = `${currentRoundId}:${playerId}`;
        if (midnightShownForRef.current.has(midnightKey)) continue;
        
        midnightShownForRef.current.add(midnightKey);
        
        const player = players.find(p => p.id === playerId);
        const playerName = player ? getPlayerUsername(player) : null;
        
        setMidnightPlayerName(playerName);
        setShowMidnightAnimation(true);
        break;
      }
    }
  }, [enabled, isSCC, currentRoundId, horsesState?.playerStates, players, getPlayerUsername]);

  // Handler to reset the midnight animation
  const handleMidnightAnimationComplete = useCallback(() => {
    setShowMidnightAnimation(false);
    setMidnightPlayerName(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (gamePhase !== "playing") return;
    if (!currentRoundId || !currentTurnPlayerId) return;

    if (!currentTurnState?.isComplete) return;

    // Bot turns already have their own "stuck advance" logic in the bot loop.
    if (currentTurnPlayer?.is_bot) return;

    const iAmTurnOwner = currentTurnPlayer?.user_id === currentUserId;
    const iAmController = candidateBotControllerUserId === currentUserId;
    if (!iAmTurnOwner && !iAmController) return;

    const key = `${currentRoundId}:${currentTurnPlayerId}`;
    if (stuckAdvanceKeyRef.current === key) return;
    stuckAdvanceKeyRef.current = key;

    const t = window.setTimeout(() => {
      void advanceToNextTurn(currentTurnPlayerId);
    }, HORSES_POST_TURN_PAUSE_MS);

    return () => window.clearTimeout(t);
  }, [
    enabled,
    gamePhase,
    currentRoundId,
    currentTurnPlayerId,
    currentTurnState?.isComplete,
    currentTurnPlayer?.is_bot,
    currentTurnPlayer?.user_id,
    currentUserId,
    candidateBotControllerUserId,
    advanceToNextTurn,
  ]);

  // Timer countdown effect - calculate time remaining from deadline
  // NOTE: If no server deadline is present yet, we still show a local countdown for UI,
  // but we DO NOT process timeouts unless a real deadline exists.
  useEffect(() => {
    if (!enabled || gamePhase !== "playing" || !currentTurnPlayerId) {
      setTimeLeft(null);
      return;
    }

    // Bots don't need a visible timer
    if (currentTurnPlayer?.is_bot) {
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

    const updateTimeLeft = () => {
      const deadlineTime = new Date(deadline).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((deadlineTime - now) / 1000));
      setTimeLeft(remaining);
      return remaining;
    };

    // Initial calculation
    const initial = updateTimeLeft();
    if (initial <= 0) {
      setTimeLeft(0);
      return;
    }

    // Update every second
    const interval = window.setInterval(() => {
      const remaining = updateTimeLeft();
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
    horsesState?.turnDeadline,
  ]);

  // Timeout handler - auto-complete turn and mark player for sit-out
  useEffect(() => {
    if (!enabled || gamePhase !== "playing") return;
    if (!currentRoundId || !currentTurnPlayerId) return;
    if (currentTurnPlayer?.is_bot) return; // Bots handle themselves
    if (!horsesState?.turnDeadline) return; // Only process timeouts when a real server deadline exists
    if (timeLeft === null || timeLeft > 0) return;

    // Only the player whose turn it is OR the bot controller should handle the timeout
    const iAmTurnOwner = currentTurnPlayer?.user_id === currentUserId;
    const iAmController = candidateBotControllerUserId === currentUserId;
    if (!iAmTurnOwner && !iAmController) return;

    // Prevent duplicate timeout processing
    const timeoutKey = `${currentRoundId}:${currentTurnPlayerId}:timeout`;
    if (timeoutProcessedRef.current === timeoutKey) return;
    timeoutProcessedRef.current = timeoutKey;

    const handleTimeout = async () => {
      console.log("[HORSES] Turn timeout for player:", currentTurnPlayerId);

      // Get current player state
      const playerState = horsesState?.playerStates?.[currentTurnPlayerId];

      // IMPORTANT: If player has already completed their turn, do NOT mark them as timed out!
      // This prevents false timeout penalties when the player locked in but timer display lagged
      if (playerState?.isComplete) {
        console.log("[HORSES] Player already completed turn, skipping timeout penalty:", currentTurnPlayerId);
        // Just advance to next turn without penalty
        setTimeout(() => {
          advanceToNextTurn(currentTurnPlayerId);
        }, HORSES_POST_TURN_PAUSE_MS);
        return;
      }

      // IMPORTANT: If player has initiated roll 3 (rollsRemaining === 0), don't time them out
      // They're in the middle of their final roll animation
      if (playerState && playerState.rollsRemaining === 0 && !playerState.isComplete) {
        console.log("[HORSES] Player in roll 3 animation, skipping timeout:", currentTurnPlayerId);
        // Don't advance, just wait - the roll will complete and lock in automatically
        return;
      }

      // If player hasn't rolled yet, give them a forced roll result
      let result;
      if (!playerState || playerState.rollsRemaining === 3) {
        // Never rolled - create a random hand
        const forcedDice = Array(5)
          .fill(null)
          .map(() => ({
            value: Math.floor(Math.random() * 6) + 1,
            isHeld: false,
          }));
        result = evaluateHand(forcedDice);

        // Save the forced state
        await horsesSetPlayerState(currentRoundId, currentTurnPlayerId, {
          dice: forcedDice,
          rollsRemaining: 0,
          isComplete: true,
          result,
        });
      } else {
        // Had rolled but didn't lock in - evaluate current dice
        result = evaluateHand(playerState.dice);
        await horsesSetPlayerState(currentRoundId, currentTurnPlayerId, {
          ...playerState,
          rollsRemaining: 0,
          isComplete: true,
          result,
        });
      }

      // Log this status change for debugging (before the update)
      await logSitOutNextHandSet(
        currentTurnPlayerId,
        currentTurnPlayer?.user_id || '',
        gameId,
        currentTurnPlayer?.profiles?.username,
        currentTurnPlayer?.is_bot || false,
        false, // old value - they weren't sitting out
        'Player timed out during Horses turn, setting sit_out_next_hand=true',
        'useHorsesMobileController.ts:handleTimeout',
        { round_id: currentRoundId, forced_result: result }
      );

      // Mark player to sit out next hand (disconnect/timeout penalty)
      await supabase.from("players").update({ sit_out_next_hand: true }).eq("id", currentTurnPlayerId);

      toast.info(`${getPlayerUsername(currentTurnPlayer!)} timed out - sitting out next hand`);

      // Advance to next turn
      setTimeout(() => {
        advanceToNextTurn(currentTurnPlayerId);
      }, HORSES_POST_TURN_PAUSE_MS);
    };

    handleTimeout();
  }, [
    enabled,
    gamePhase,
    currentRoundId,
    currentTurnPlayerId,
    currentTurnPlayer,
    currentUserId,
    candidateBotControllerUserId,
    timeLeft,
    horsesState?.turnDeadline,
    horsesState?.playerStates,
    advanceToNextTurn,
    getPlayerUsername,
  ]);

  const handleRoll = useCallback(async () => {
    if (!enabled) return;
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining <= 0) return;

    const rollStartTime = Date.now();
    // Unique per-roll key so all clients can trigger DiceTableLayout fly-in animations.
    localRollKeyRef.current = rollStartTime;

    console.log(`[ROLL_DEBUG] ===== ROLL STARTED at ${new Date(rollStartTime).toISOString()} =====`);

    // Determine if this is the first roll (rollsRemaining === 3 means first roll)
    const isFirstRoll = localHand.rollsRemaining === 3;
    const animationDuration = isFirstRoll ? HORSES_FIRST_ROLL_ANIMATION_MS : HORSES_ROLL_AGAIN_ANIMATION_MS;
    console.log(`[ROLL_DEBUG] isFirstRoll=${isFirstRoll}, animationDuration=${animationDuration}ms`);

    // Freeze layout to what it was at the START of this roll
    const heldMaskBeforeRoll = localHand.dice.map((d: any) => !!d.isHeld);
    heldMaskAtLastRollStartRef.current = heldMaskBeforeRoll;

    // Roll immediately so the animation displays the NEW dice values (prevents old->new flash)
    const rollNumber = getRollNumber(localHand.rollsRemaining);
    const newHand = isSCC ? rollSCCDice(localHand as SCCHand) : rollDice(localHand as HorsesHand);
    const newVals = (newHand.dice as any[]).map((d: any) => d.value).join(",");
    console.log(`[ROLL_DEBUG] newHand dice: [${newVals}], rollsRemaining=${newHand.rollsRemaining}`);
    logDebug("roll_start", `isFirstRoll=${isFirstRoll} anim=${animationDuration}ms dice=[${newVals}] rr=${newHand.rollsRemaining}`);

    // Audit log the dice rolls for randomness validation
    logDiceRolls(
      (newHand.dice as any[]).map((d: any) => d.value),
      heldMaskBeforeRoll,
      {
        gameId,
        roundId: currentRoundId ?? undefined,
        playerId: myPlayer?.id,
        rollNumber,
      }
    );

    // Mark interaction immediately so realtime/DB snapshots can't overwrite the felt during the roll animation.
    lastLocalEditAtRef.current = rollStartTime;
    setLocalHand(newHand);
    setIsRolling(true);
    console.log(`[ROLL_DEBUG] setIsRolling(true) called, lastLocalEditAt set to ${rollStartTime}`);
    logDebug("roll_state", "setIsRolling(true)", { rollStartTime });

    // CRITICAL: Save state IMMEDIATELY so observers get rollKey right away and can start fly-in animation in sync.
    // This fixes the 1-2 second desync where active player's animation was ahead of observers.
    // IMPORTANT: Do this for ALL rolls (including the final roll), otherwise observers can miss the last fly-in and
    // "skip" straight to the result.
    void saveMyState(newHand, false, undefined, heldMaskBeforeRoll);

    setTimeout(async () => {
      const animationEndTime = Date.now();
      console.log(
        `[ROLL_DEBUG] Animation timeout fired at ${new Date(animationEndTime).toISOString()} (after ${animationEndTime - rollStartTime}ms)`,
      );
      console.log(`[ROLL_DEBUG] setIsRolling(false) being called NOW`);
      logDebug("roll_timeout", `after ${animationEndTime - rollStartTime}ms -> setIsRolling(false)`);
      setIsRolling(false);

      // For SCC: Check if we rolled midnight (12 cargo) - auto-lock since it's the best possible
      if (isSCC) {
        const sccHand = newHand as SCCHand;
        const result = evaluateSCCHand(sccHand);

        // Midnight = qualified with cargo of 12 (best possible hand)
        if (result.isQualified && result.cargoSum === 12) {
          console.log('[SCC] Midnight rolled! Auto-locking...');
          const lockedHand = lockInSCCHand(sccHand);
          setLocalHand(lockedHand);
          await saveMyState(lockedHand, true, result, heldMaskBeforeRoll);

          setTimeout(() => {
            advanceToNextTurn(myPlayer?.id ?? null);
          }, HORSES_POST_TURN_PAUSE_MS);
          return;
        }
      }

      if (newHand.rollsRemaining === 0) {
        // Use appropriate evaluation function based on game type
        const result = isSCC ? evaluateSCCHand(newHand as SCCHand) : evaluateHand((newHand as HorsesHand).dice);
        // Final roll: await to ensure state is saved before advancing turn
        await saveMyState(newHand, true, result, heldMaskBeforeRoll);
        setTimeout(() => {
          advanceToNextTurn(myPlayer?.id ?? null);
        }, HORSES_POST_TURN_PAUSE_MS);
      }
      // Note: intermediate rolls already saved immediately above, no need to save again here
    }, animationDuration);
  }, [
    enabled,
    isMyTurn,
    localHand,
    saveMyState,
    advanceToNextTurn,
    myPlayer?.id,
    isSCC,
    logDebug,
  ]);

  const handleToggleHold = useCallback(
    (index: number) => {
      if (!enabled) return;
      if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining === 3) return;

      // For SCC: dice auto-freeze for 6-5-4, users cannot manually toggle holds
      // Only cargo dice (non-SCC) could theoretically be toggled, but SCC is all-or-nothing (re-roll both or lock in)
      if (isSCC) {
        const sccHand = localHand as SCCHand;
        const die = sccHand.dice[index];
        // Prevent toggling any dice in SCC - Ship/Captain/Crew auto-freeze, cargo is all-or-nothing
        if (die.isSCC) {
          // Can't unhold Ship/Captain/Crew dice
          return;
        }
        // For cargo dice, SCC doesn't allow individual holds - it's all-or-nothing
        // Users must either roll again (re-rolls both cargo) or lock in
        return;
      }

      lastLocalEditAtRef.current = Date.now();

      // IMPORTANT (mobile): persist holds immediately.
      // Otherwise the next realtime/DB sync can overwrite local holds and it feels like it "won't hold".
      const nextHand = toggleHold(localHand as HorsesHand, index);
      setLocalHand(nextHand);

      // Preserve the held-mask captured at the start of the last roll so observers' layout/animations
      // don't get reset by realtime hold toggles between rolls.
      void saveMyState(nextHand, false, undefined, heldMaskAtLastRollStartRef.current ?? undefined);
    },
    [enabled, isMyTurn, localHand, saveMyState, isSCC],
  );

  const handleLockIn = useCallback(async () => {
    if (!enabled) return;
    if (!isMyTurn || localHand.rollsRemaining === 3 || localHand.isComplete) return;

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
      await saveMyState(lockedHand, true, result, heldMaskBeforeComplete);

      setTimeout(() => {
        advanceToNextTurn(myPlayer?.id ?? null);
      }, HORSES_POST_TURN_PAUSE_MS);
      return;
    }

    const lockedHand = lockInHand(localHand as HorsesHand);
    lastLocalEditAtRef.current = Date.now();
    setLocalHand(lockedHand);

    const result = evaluateHand(lockedHand.dice);
    await saveMyState(lockedHand, true, result, heldMaskBeforeComplete);

    setTimeout(() => {
      advanceToNextTurn(myPlayer?.id ?? null);
    }, HORSES_POST_TURN_PAUSE_MS);
  }, [enabled, isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id, isSCC]);

  // Bot auto-play with visible animation (mobile)
  // CRITICAL: This effect should ONLY re-run when the turn identity changes (round + bot),
  // NOT on every horsesState update. We use refs to read latest values inside the loop.
  useEffect(() => {
    if (!enabled) return;
    if (gamePhase !== "playing") return;
    if (!currentRoundId) return;
    if (!currentUserId) return;

    const botId = currentTurnPlayer?.is_bot ? currentTurnPlayer.id : null;
    if (!botId) return;

    const processingKey = `${currentRoundId}:${botId}`;

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
          logDiceRolls(
            (rolledHand.dice as any[]).map((d: any) => d.value),
            heldMaskBeforeComplete ?? [],
            {
              gameId,
              roundId: currentRoundId ?? undefined,
              playerId: botId,
              rollNumber: botRollNumber,
            }
          );

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

        await new Promise((resolve) => setTimeout(resolve, 450));
        if (cancelled) return;

        const { data: turnCheck } = await supabase
          .from("rounds")
          .select("horses_state")
          .eq("id", currentRoundId)
          .maybeSingle();

        if (cancelled) return;

        const checkState = (turnCheck as any)?.horses_state as HorsesStateFromDB | null; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (checkState?.currentTurnPlayerId && checkState.currentTurnPlayerId !== botId) return;

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
    gamePhase,
    currentRoundId,
    currentUserId,
    currentTurnPlayer?.id,
    currentTurnPlayer?.is_bot,
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

  useEffect(() => {
    if (!enabled) return;
    if (gamePhase !== "complete" || !gameId || !currentRoundId) return;
    if (winningPlayerIds.length === 0) return;
    
    // GUARD: Ensure all active players have completed results before processing
    // This prevents premature win processing from stale/cached state
    const activePlayerCount = activePlayers.length;
    if (completedResults.length < activePlayerCount) {
      console.log("[HORSES] Not all players complete yet:", completedResults.length, "/", activePlayerCount);
      return;
    }

    // Prevent duplicate processing
    if (processedWinRoundRef.current === currentRoundId) return;

    // Determine who should process this win:
    // 1. If I'm the winner (human win)
    // 2. If winner is a bot AND I'm the bot controller
    // 3. If it's a tie, bot controller handles
    const myPlayerId = myPlayer?.id;
    const winnerId = winningPlayerIds.length === 1 ? winningPlayerIds[0] : null;
    const isWinner = winnerId && myPlayerId === winnerId;
    const winnerPlayer = winnerId ? players.find((p) => p.id === winnerId) : null;
    const winnerIsBot = winnerPlayer?.is_bot;
    const iAmBotController = candidateBotControllerUserId === currentUserId;
    const isTie = winningPlayerIds.length > 1;
    
    // Human winner processes their own win; bot wins or ties are handled by bot controller
    const shouldProcess = isWinner || ((winnerIsBot || isTie) && iAmBotController);
    if (!shouldProcess) return;

    const processWin = async () => {
      // Mark as processed IMMEDIATELY to prevent local double-processing
      processedWinRoundRef.current = currentRoundId;

      if (winningPlayerIds.length > 1) {
        // ATOMIC GUARD: Only one client claims the tie processing
        const { data: claimed, error: claimError } = await supabase
          .from("games")
          .update({
            awaiting_next_round: true,
            last_round_result: "One tie all tie - rollover",
          })
          .eq("id", gameId)
          .eq("status", "in_progress") // Only succeeds if not already processed
          .select("id");

        if (claimError || !claimed || claimed.length === 0) {
          console.log("[HORSES] Tie already processed by another client");
          return;
        }
        return;
      }

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
        .select("id, pot, total_hands");

      if (claimError || !claimed || claimed.length === 0) {
        console.log("[HORSES] Win already processed by another client");
        return;
      }

      const actualPot = claimed[0].pot || pot || 0;
      const handNumber = claimed[0].total_hands || 1;

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

      // Record the game result
      const chipChanges: Record<string, number> = {};
      players.forEach((p) => {
        if (p.id === winnerId) {
          chipChanges[p.id] = actualPot; // Winner gains pot
        } else if (!p.sitting_out) {
          chipChanges[p.id] = -(anteAmount || 0); // Others lost their ante
        }
      });

      await supabase.from("game_results").insert({
        game_id: gameId,
        hand_number: handNumber,
        winner_player_id: winnerId,
        winner_username: winnerName,
        winning_hand_description: winnerResult.result.description,
        pot_won: actualPot,
        player_chip_changes: chipChanges,
        is_chopped: false,
        game_type: "horses",
      });

      // Note: No toast here - dealer announcement already shows the win message
      
      // Snapshot player chips for session history (enables "Run Back" option)
      await snapshotPlayerChips(gameId, handNumber);

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
    gamePhase,
    gameId,
    currentRoundId,
    winningPlayerIds,
    players,
    currentUserId,
    completedResults,
    pot,
    anteAmount,
    getPlayerUsername,
    myPlayer,
    candidateBotControllerUserId,
  ]);

  const rawFeltDice = useMemo(() => {
    const logPrefix = `[FELT_DICE_DEBUG ${isSCC ? 'SCC' : 'HORSES'}]`;
    
    // If we have a completed turn hold for the CURRENT USER, don't show on felt
    // (their dice should stay in their active player area, not on the felt)
    if (completedTurnHold && Date.now() < completedTurnHold.expiresAt) {
      // If this is the current user's hold, return null - dice shown in player area instead
      if (completedTurnHold.playerId === myPlayer?.id) {
        console.log(`${logPrefix} returning null for my completed hold - shown in player area`);
        return null;
      }
      // For OTHER players' completed holds, show their dice on felt
      console.log(`${logPrefix} returning completedTurnHold for other player: playerId=${completedTurnHold.playerId}`);
      return {
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
        logDebug(
          "prefer_local",
          `preferLocal=${preferLocal} isRolling=${isRolling} withinWindow=${withinProtectionWindow} (${timeSinceEdit}ms) local=[${localVals}] rr=${localRollsRemaining} db=[${dbVals}] rr=${dbRollsRemaining}`,
          { preferLocal, isRolling, withinProtectionWindow, timeSinceEdit, dbBehind, dbClearlyStale, awaitingDbSync, localVals, dbVals, localRollsRemaining, dbRollsRemaining },
        );
      }

      console.log(`[PREFER_LOCAL_DEBUG] preferLocal=${preferLocal} | isRolling=${isRolling} | withinWindow=${withinProtectionWindow} (${timeSinceEdit}ms ago) | dbBehind=${dbBehind} | dbStale=${dbClearlyStale} | awaitingSync=${awaitingDbSync}`);
      console.log(`[PREFER_LOCAL_DEBUG] localDice=[${localVals}] rollsRem=${localRollsRemaining} | dbDice=[${dbVals}] rollsRem=${dbRollsRemaining}`);
      if (!preferLocal) {
        console.log(`[PREFER_LOCAL_DEBUG] *** USING DB STATE *** (preferLocal=false)`);
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
      return botDisplayState;
    }

    // For non-active bot turns, still prefer botDisplayState if it matches
    if (currentTurnPlayer?.is_bot && botDisplayState?.playerId === currentTurnPlayerId) {
      const isBlank = botDisplayState.dice.every((d: any) => !d?.value);
      if (isBlank && !botDisplayState.isRolling) {
        console.log(`${logPrefix} BOT NON-ACTIVE returning null: isBlank=${isBlank}, isRolling=${botDisplayState.isRolling}`);
        return null;
      }
      console.log(`${logPrefix} BOT NON-ACTIVE returning botDisplayState: dice=${JSON.stringify(botDisplayState.dice.map(d => d.value))}, isRolling=${botDisplayState.isRolling}`);
      return botDisplayState;
    }

    // OBSERVER DISPLAY STATE: When observing another human player, use dedicated display state
    // during animation. This mirrors how botDisplayState works - it's decoupled from DB updates
    // during the animation period, preventing flicker and dice disappearing.
    if (observerDisplayState?.playerId === currentTurnPlayerId) {
      const dbState = horsesState?.playerStates?.[currentTurnPlayerId];
      const dbDice = (dbState?.dice as any[] | undefined) ?? undefined;

      const dbSig = Array.isArray(dbDice)
        ? dbDice.map((d) => `${d?.value ?? 0}:${d?.isHeld ? 1 : 0}`).join("|")
        : null;

      const prevHeldCount = (observerDisplayState.dice as any[]).filter((d: any) => !!d?.isHeld).length;
      const dbHeldCount = Array.isArray(dbDice) ? (dbDice as any[]).filter((d: any) => !!d?.isHeld).length : 0;
      const dbRollKey = typeof (dbState as any)?.rollKey === "number" ? (dbState as any).rollKey : undefined;
      const currentDisplayRollKey = observerDisplayState.rollKey ?? 0;
      const maxSeenRollKey = maxSeenRollKeyRef.current[currentTurnPlayerId] ?? 0;
      
      // MONOTONICITY CHECK: Reject DB data if it has an older rollKey than what we've already processed.
      // This is the key fix for the "held dice reverting to scatter" issue.
      const dbRollKeyIsStale = typeof dbRollKey === "number" && dbRollKey < maxSeenRollKey;
      
      const sameRoll =
        typeof dbRollKey === "number" && typeof observerDisplayState.rollKey === "number" && dbRollKey === observerDisplayState.rollKey;

      // FIX #2: Stricter DB acceptance to prevent held↔scatter flicker
      // Prefer DB dice ONLY once they diverge from the pre-roll snapshot, and never let DB regress held state.
      // The regression is what creates the held↔scatter jump when out-of-order realtime snapshots arrive.
      // CRITICAL: For the SAME rollKey, require that dbSig actually differs from preRollSig.
      // This prevents the case where isRolling just flipped to false but DB still has pre-roll data.
      const sameRollWithStaleDb = sameRoll && observerDisplayState.preRollSig && dbSig === observerDisplayState.preRollSig;
      
      // Use monotonic max held count for this rollKey to guard against regressions
      const rollKeyStr = `${currentTurnPlayerId}:${dbRollKey}`;
      const maxSeenHeldForRoll = maxHeldCountPerRollKeyRef.current[rollKeyStr] ?? 0;
      const dbHeldWouldRegress = sameRoll && dbHeldCount < maxSeenHeldForRoll;
      
      const shouldUseDb =
        Array.isArray(dbDice) &&
        dbDice.length > 0 &&
        !dbRollKeyIsStale && // Never accept DB data from an older rollKey
        !sameRollWithStaleDb &&
        !dbHeldWouldRegress && // Never accept DB data that would regress held count
        (!observerDisplayState.isRolling || !observerDisplayState.preRollSig || dbSig !== observerDisplayState.preRollSig);

      const dice = shouldUseDb ? ((dbDice as any) ?? observerDisplayState.dice) : observerDisplayState.dice;

      // TRACE: Observer dice decision
      if (isDiceTraceRecording()) {
        pushDiceTrace("rawFeltDice:observer", {
          playerId: currentTurnPlayerId,
          rollKey: observerDisplayState.rollKey,
          isRolling: observerDisplayState.isRolling,
          preRollSig: observerDisplayState.preRollSig,
          dbSig: dbSig ?? undefined,
          heldCount: prevHeldCount,
          dbHeldCount,
          shouldUseDb,
          extra: { sameRoll, dbRollKey },
        });
      }

      console.log(
        `${logPrefix} OBSERVER DISPLAY returning observerDisplayState: dice=${JSON.stringify((dice as any[]).map((d: any) => d.value))}, isRolling=${observerDisplayState.isRolling}, rollKey=${observerDisplayState.rollKey}`,
      );

      return {
        ...observerDisplayState,
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
    botDisplayState,
    botTurnActiveId,
    completedTurnHold,
    isSCC,
    observerDisplayState,
  ]);

  useEffect(() => {
    if (rawFeltDice) {
      lastFeltDiceRef.current = {
        playerId: (rawFeltDice as any)?.playerId ?? currentTurnPlayerId ?? null,
        value: rawFeltDice,
      };
      lastFeltDiceAtRef.current = Date.now();
    }
  }, [rawFeltDice, currentTurnPlayerId]);

  // OBSERVER ROLL DETECTION (HUMAN vs HUMAN):
  // Make observer rolls behave like bot rolls: once we detect a rollKey change, we show a protected
  // display state for the whole animation window, and we NEVER clear it on a timer (clearing causes
  // gaps where DB state is blank/out-of-order → flicker/disappearing dice).
  useEffect(() => {
    if (!enabled || !currentTurnPlayerId) return;
    if (isMyTurn) return; // I'm rolling, not observing
    if (currentTurnPlayer?.is_bot) return; // Bot rolls handled by botDisplayState

    const state = horsesState?.playerStates?.[currentTurnPlayerId];
    if (!state) return;

    const newRollKey = (state as any).rollKey;
    if (typeof newRollKey !== "number") return;

    const prevRollKey = lastObservedRollKeyRef.current[currentTurnPlayerId];
    const maxSeenRollKey = maxSeenRollKeyRef.current[currentTurnPlayerId] ?? 0;

    // MONOTONICITY GUARD: If this rollKey is older than the max we've seen, it's stale data.
    // This happens when out-of-order realtime updates arrive. Ignore them completely.
    if (newRollKey < maxSeenRollKey) {
      if (isDiceTraceRecording()) {
        pushDiceTrace("observerRollDetect:staleRejected", {
          playerId: currentTurnPlayerId,
          rollKey: newRollKey,
          extra: { maxSeenRollKey, reason: "rollKey < maxSeenRollKey" },
        });
      }
      console.log(
        `[OBSERVER_ROLL] REJECTED stale rollKey ${newRollKey} < maxSeen ${maxSeenRollKey} for ${currentTurnPlayerId}`,
      );
      return;
    }

    // Update max seen rollKey (only ever increases)
    if (newRollKey > maxSeenRollKey) {
      maxSeenRollKeyRef.current[currentTurnPlayerId] = newRollKey;
    }

    // If the turn completed, ensure we stop showing rolling state, but keep dice visible.
    // IMPORTANT: Also update the rollKey ref to prevent the "new roll detected" branch from
    // firing if isComplete arrives slightly AFTER the rollKey update.
    if (state.isComplete) {
      if (observerRollingTimerRef.current) {
        window.clearTimeout(observerRollingTimerRef.current);
        observerRollingTimerRef.current = null;
      }
      // Update rollKey BEFORE setting display state to prevent race
      lastObservedRollKeyRef.current[currentTurnPlayerId] = newRollKey;
      
      // TRACE: Observer turn complete
      if (isDiceTraceRecording()) {
        pushDiceTrace("observerRollDetect:complete", {
          playerId: currentTurnPlayerId,
          rollKey: newRollKey,
          isComplete: true,
          isRolling: false,
        });
      }
      
      // Use the final DB dice values (not masked) since the turn is done
      const finalDice = (state.dice as any[]) ?? [];
      setObserverDisplayState((prev) => {
        if (!prev || prev.playerId !== currentTurnPlayerId) return prev;
        return {
          ...prev,
          dice: finalDice as (HorsesDieType | SCCDieType)[],
          isRolling: false,
          // IMPORTANT: do NOT update rollKey on completion.
          // The completion rollKey bump is a server-side bookkeeping change and will cause DiceTableLayout
          // to re-trigger fly-in if we pass it through (especially if the component remounts during the hold window).
          preRollSig: undefined, // Clear to allow DB dice through
        };
      });
      return;
    }

    // Detect a new roll start.
    if (newRollKey !== prevRollKey) {
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
        // TRACE: Skip fly-in for post-completion bookkeeping
        if (isDiceTraceRecording()) {
          pushDiceTrace("observerRollDetect:skipCompletedRoll", {
            playerId: currentTurnPlayerId,
            rollKey: newRollKey,
            rollsRemaining: 0,
            isRolling: false,
            extra: { prevRollKey, prevRollsRemaining, reason: "already complete, bookkeeping bump" },
          });
        }
        
        console.log(
          `[OBSERVER_ROLL] rollKey change for ${currentTurnPlayerId}: ${prevRollKey} -> ${newRollKey} SKIPPED (already complete, bookkeeping)`,
        );
        
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

      // Don't animate on the first observation (no baseline)
      if (prevRollKey !== undefined) {
        const durationMs = state.rollsRemaining === 2 ? HORSES_FIRST_ROLL_ANIMATION_MS : HORSES_ROLL_AGAIN_ANIMATION_MS;

        // TRACE: Observer new roll detected
        if (isDiceTraceRecording()) {
          pushDiceTrace("observerRollDetect:newRoll", {
            playerId: currentTurnPlayerId,
            rollKey: newRollKey,
            rollsRemaining: state.rollsRemaining,
            isRolling: true,
            extra: { prevRollKey, durationMs },
          });
        }

        console.log(
          `[OBSERVER_ROLL] rollKey change for ${currentTurnPlayerId}: ${prevRollKey} -> ${newRollKey} (duration=${durationMs}ms)`,
        );

        if (observerRollingTimerRef.current) {
          window.clearTimeout(observerRollingTimerRef.current);
          observerRollingTimerRef.current = null;
        }

        // Start protected observer display state.
        // IMPORTANT: At roll start, DB often still contains the *previous* roll values.
        // We keep held dice as-is but mark unheld dice with a special "rolling" marker.
        // Instead of masking to value=0 (which DiceTableLayout can cache as "valid"), we
        // preserve the old values but set isRolling=true so the fly-in animation shows them.
        const preRollDice = (state.dice as any[]) ?? [];
        const preRollSig = preRollDice.map((d) => `${d?.value ?? 0}:${d?.isHeld ? 1 : 0}`).join("|");

        // DON'T mask dice to value=0 - this gets cached and causes null dice to "land".
        // Instead, keep the pre-roll values; the fly-in animation will overlay them anyway.
        // DiceTableLayout only shows the animation overlay when isRolling=true.
        const displayDice = preRollDice;
        
        // FIX #3: Derive heldCountBeforeComplete directly from dice (not stale metadata)
        const derivedHeldCount = preRollDice.filter((d: any) => !!d?.isHeld).length;
        
        // Reset the max held count tracker for this new rollKey
        const rollKeyStr = `${currentTurnPlayerId}:${newRollKey}`;
        maxHeldCountPerRollKeyRef.current[rollKeyStr] = derivedHeldCount;

        setObserverDisplayState({
          playerId: currentTurnPlayerId,
          dice: displayDice as (HorsesDieType | SCCDieType)[],
          rollsRemaining: state.rollsRemaining,
          isRolling: true,
          heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
          heldCountBeforeComplete: derivedHeldCount,
          rollKey: newRollKey,
          preRollSig,
        });

        // End rolling state after the animation window. Do NOT clear the display state.
        observerRollingTimerRef.current = window.setTimeout(() => {
          setObserverDisplayState((prev) => {
            if (!prev || prev.playerId !== currentTurnPlayerId) return prev;
            if (prev.rollKey !== newRollKey) return prev;
            return { ...prev, isRolling: false };
          });
          observerRollingTimerRef.current = null;
        }, durationMs);
      }

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

      // While the roll animation is running, do NOT replace our masked dice with the pre-roll values.
      // Only accept updates once the DB dice actually change vs the roll-start snapshot.
      if (prev.isRolling && prev.preRollSig && nextSig === prev.preRollSig) {
        return prev;
      }

      if (nextSig === prevSig) return prev;

      // FIX: Prevent held-state regression during same-rollKey updates.
      // Use a monotonic max count to guard against out-of-order realtime updates.
      // Even if the previous state was already regressed, we use the MAX we've ever seen for this rollKey.
      const rollKeyStr = `${currentTurnPlayerId}:${newRollKey}`;
      const nextHeldCount = nextDice.filter((d: any) => !!d?.isHeld).length;
      const maxSeenHeld = maxHeldCountPerRollKeyRef.current[rollKeyStr] ?? 0;
      
      if (nextHeldCount < maxSeenHeld) {
        // Stale update - would regress held state. Reject it.
        console.log(
          `[OBSERVER_ROLL] Rejecting same-rollKey update: nextHeldCount (${nextHeldCount}) < maxSeenHeld (${maxSeenHeld})`,
        );
        return prev;
      }
      
      // Update the max seen for this rollKey
      maxHeldCountPerRollKeyRef.current[rollKeyStr] = nextHeldCount;

      return {
        ...prev,
        dice: state.dice as (HorsesDieType | SCCDieType)[],
        rollsRemaining: state.rollsRemaining,
        heldMaskBeforeComplete: (state as any).heldMaskBeforeComplete,
        heldCountBeforeComplete: (state as any).heldCountBeforeComplete,
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
    currentTurnPlayerId,
    isMyTurn,
    currentTurnPlayer?.is_bot,
    // Use specific state properties instead of the entire object
    horsesState?.playerStates?.[currentTurnPlayerId ?? ""]?.rollsRemaining,
    (horsesState?.playerStates?.[currentTurnPlayerId ?? ""] as any)?.rollKey,
    horsesState?.playerStates?.[currentTurnPlayerId ?? ""]?.isComplete,
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
    maxTime: HORSES_TURN_TIMER_SECONDS,
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
    completedTurnHold,
  };
}
