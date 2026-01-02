import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";
import { snapshotPlayerChips } from "@/lib/gameLogic";
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

const HORSES_ROLL_ANIMATION_MS = 350;
const HORSES_POST_TURN_PAUSE_MS = 650;
const HORSES_TURN_TIMER_SECONDS = 30; // Default turn timer for Horses

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
  } | null>(null);

  // Track when a bot turn is actively being animated - prevents DB/realtime from overwriting display
  // Using state (not ref) so that useMemo for rawFeltDice recalculates when this changes
  const [botTurnActiveId, setBotTurnActiveId] = useState<string | null>(null);


  // Sticky cache for felt dice to prevent flicker when realtime state briefly rehydrates
  const lastFeltDiceRef = useRef<{ playerId: string | null; value: any } | null>(null);
  const lastFeltDiceAtRef = useRef<number>(0);

  // Prevent DB/realtime rehydration from overwriting the local felt while the user is actively tapping.
  const lastLocalEditAtRef = useRef<number>(0);
  const myTurnKeyRef = useRef<string | null>(null);

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
    if (myTurnKeyRef.current !== myKey) {
      myTurnKeyRef.current = myKey;
    }

    // While rolling (and shortly after interactions), don't let DB snapshots overwrite the felt.
    if (isRolling) return;

    // If the user just interacted, don't let a stale DB snapshot overwrite their felt.
    if (Date.now() - lastLocalEditAtRef.current < 900) return;

    if (myState) {
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
    isRolling,
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
      const order = getTurnOrder();

      const controllerUserId =
        order
          .map((id) => activePlayers.find((p) => p.id === id))
          .find((p) => p && !p.is_bot)?.user_id ?? null;

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
      initializingRef.current = false;
    };

    initializeGame();
  }, [enabled, currentRoundId, gameId, horsesState?.turnOrder?.length, activePlayers.length, getTurnOrder]);

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
      // Find the first player who hasn't completed their turn
      const nextPlayerId = turnOrder.find((pid) => {
        const state = horsesState?.playerStates?.[pid];
        return !state?.isComplete;
      });
      
      if (!nextPlayerId) {
        // Everyone is complete - set to complete phase
        console.log("[HORSES] Recovery: all players complete, setting phase to complete");
        await updateHorsesState(currentRoundId, {
          ...horsesState!,
          currentTurnPlayerId: null,
          gamePhase: "complete",
        });
      } else {
        // Set the next incomplete player as current
        console.log("[HORSES] Recovery: setting currentTurnPlayerId to", nextPlayerId);
        await updateHorsesState(currentRoundId, {
          ...horsesState!,
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
    async (hand: HorsesHand | SCCHand, completed: boolean, result?: HorsesHandResult | SCCHandResult) => {
      if (!enabled) return;
      if (!currentRoundId || !myPlayer) return;

      const newPlayerState: HorsesPlayerDiceState = {
        dice: hand.dice as any,
        rollsRemaining: hand.rollsRemaining,
        isComplete: completed,
        result,
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
      
      // After advancing, set deadline for the new player (if human)
      if (newState?.currentTurnPlayerId && newState.gamePhase === "playing") {
        const nextPlayer = players.find((p) => p.id === newState.currentTurnPlayerId);
        if (nextPlayer && !nextPlayer.is_bot) {
          const newDeadline = new Date(Date.now() + HORSES_TURN_TIMER_SECONDS * 1000).toISOString();
          await supabase
            .from("rounds")
            .update({
              horses_state: {
                ...newState,
                turnDeadline: newDeadline,
              },
            } as any)
            .eq("id", currentRoundId);
        } else if (nextPlayer?.is_bot) {
          // Clear deadline for bot turns
          await supabase
            .from("rounds")
            .update({
              horses_state: {
                ...newState,
                turnDeadline: null,
              },
            } as any)
            .eq("id", currentRoundId);
        }
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
    };
  }, []);

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

  // Detect when ANY player's SCC hand is complete and they didn't qualify
  useEffect(() => {
    if (!enabled || !isSCC) return;
    if (!currentRoundId) return;
    
    // Check all player states for newly completed no-qualify hands
    const playerStates = horsesState?.playerStates;
    if (!playerStates) return;
    
    for (const [playerId, state] of Object.entries(playerStates)) {
      if (!state.isComplete || !state.result) continue;
      
      const result = state.result as SCCHandResult;
      if (!result.isQualified) {
        const noQualifyKey = `${currentRoundId}:${playerId}`;
        if (noQualifyShownForRef.current.has(noQualifyKey)) continue;
        
        noQualifyShownForRef.current.add(noQualifyKey);
        
        // Find player name
        const player = players.find(p => p.id === playerId);
        const playerName = player ? getPlayerUsername(player) : null;
        
        setNoQualifyPlayerName(playerName);
        setShowNoQualifyAnimation(true);
        break; // Only show one at a time
      }
    }
  }, [enabled, isSCC, currentRoundId, horsesState?.playerStates, players, getPlayerUsername]);

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
      } else if (!playerState.isComplete) {
        // Had rolled but didn't lock in - evaluate current dice
        result = evaluateHand(playerState.dice);
        await horsesSetPlayerState(currentRoundId, currentTurnPlayerId, {
          ...playerState,
          rollsRemaining: 0,
          isComplete: true,
          result,
        });
      }

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

    // Mark interaction immediately so realtime/DB snapshots can't overwrite the felt during the roll animation.
    lastLocalEditAtRef.current = Date.now();
    setIsRolling(true);

    setTimeout(async () => {
      // Use appropriate roll function based on game type
      // TEMP: Pass true to force Midnight for human player testing
      const newHand = isSCC 
        ? rollSCCDice(localHand as SCCHand, true)
        : rollDice(localHand as HorsesHand);
      lastLocalEditAtRef.current = Date.now();
      setLocalHand(newHand);
      setIsRolling(false);

      if (newHand.rollsRemaining === 0) {
        // Use appropriate evaluation function based on game type
        const result = isSCC 
          ? evaluateSCCHand(newHand as SCCHand)
          : evaluateHand((newHand as HorsesHand).dice);
        await saveMyState(newHand, true, result);
        setTimeout(() => {
          advanceToNextTurn(myPlayer?.id ?? null);
        }, HORSES_POST_TURN_PAUSE_MS);
      } else {
        await saveMyState(newHand, false);
      }
    }, HORSES_ROLL_ANIMATION_MS);
  }, [enabled, isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id, isSCC]);

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
      void saveMyState(nextHand, false);
    },
    [enabled, isMyTurn, localHand, saveMyState, isSCC],
  );

  const handleLockIn = useCallback(async () => {
    if (!enabled) return;
    if (!isMyTurn || localHand.rollsRemaining === 3 || localHand.isComplete) return;

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
      await saveMyState(lockedHand, true, result);

      setTimeout(() => {
        advanceToNextTurn(myPlayer?.id ?? null);
      }, HORSES_POST_TURN_PAUSE_MS);
      return;
    }

    const lockedHand = lockInHand(localHand as HorsesHand);
    lastLocalEditAtRef.current = Date.now();
    setLocalHand(lockedHand);

    const result = evaluateHand(lockedHand.dice);
    await saveMyState(lockedHand, true, result);

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

        // Roll up to 3 times with visible animation
        for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
          if (cancelled) return;

          setBotDisplayState({
            playerId: botId,
            dice: botHand.dice as HorsesDieType[],
            rollsRemaining: botHand.rollsRemaining,
            isRolling: true,
          });
          await new Promise((resolve) => setTimeout(resolve, 450));
          if (cancelled) return;

          // Use appropriate roll function based on game type
          botHand = isSCC 
            ? rollSCCDice(botHand as SCCHand)
            : rollDice(botHand as HorsesHand);
          setBotDisplayState({
            playerId: botId,
            dice: botHand.dice as HorsesDieType[],
            rollsRemaining: botHand.rollsRemaining,
            isRolling: false,
          });

          await horsesSetPlayerState(currentRoundId, botId, {
            dice: botHand.dice as any,
            rollsRemaining: botHand.rollsRemaining,
            isComplete: false,
          });
          if (cancelled) return;

          await new Promise((resolve) => setTimeout(resolve, 450));
          if (cancelled) return;

          // Use appropriate bot decision logic based on game type
          const shouldStop = isSCC
            ? shouldSCCBotStopRolling(botHand as SCCHand, botHand.rollsRemaining, currentWinningResultRef.current as SCCHandResult | null)
            : shouldBotStopRolling((botHand as HorsesHand).dice, botHand.rollsRemaining, currentWinningResultRef.current as HorsesHandResult | null);
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
            });

            await horsesSetPlayerState(currentRoundId, botId, {
              dice: botHand.dice as any,
              rollsRemaining: botHand.rollsRemaining,
              isComplete: false,
            });
            if (cancelled) return;

            await new Promise((resolve) => setTimeout(resolve, 350));
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
        setBotDisplayState({
          playerId: botId,
          dice: botHand.dice as HorsesDieType[],
          rollsRemaining: botHand.rollsRemaining,
          isRolling: false,
        });
        await horsesSetPlayerState(currentRoundId, botId, {
          dice: botHand.dice as any,
          rollsRemaining: 0,
          isComplete: true,
          result,
        });

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
      // Mark as processed IMMEDIATELY to prevent race conditions
      processedWinRoundRef.current = currentRoundId;

      if (winningPlayerIds.length > 1) {
        // Set awaiting_next_round to trigger re-ante flow
        await supabase
          .from("games")
          .update({
            awaiting_next_round: true,
            last_round_result: "Roll Over",
          })
          .eq("id", gameId);
        return;
      }

      const winnerPlayer = players.find((p) => p.id === winnerId);
      const winnerResult = completedResults.find((r) => r.playerId === winnerId);

      if (!winnerPlayer || !winnerResult) return;

      // Fetch the actual pot from the database (prop may be stale)
      const { data: gameData } = await supabase
        .from("games")
        .select("pot, total_hands")
        .eq("id", gameId)
        .single();

      const actualPot = gameData?.pot || pot || 0;
      const handNumber = gameData?.total_hands || 1;

      // Award pot to winner
      const { error: updateError } = await supabase
        .from("players")
        .update({ chips: winnerPlayer.chips + actualPot })
        .eq("id", winnerId);

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

      // Transition to game_over and reset pot
      await supabase
        .from("games")
        .update({
          status: "game_over",
          pot: 0,
          game_over_at: new Date().toISOString(),
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
    if (!enabled || gamePhase !== "playing" || !currentTurnPlayerId) return null;

    // IMPORTANT: avoid flashing unrolled dice during turn transitions.
    // Prefer the authoritative DB state for the current player, then fall back to local state.
    if (isMyTurn) {
      const dbState = myPlayer ? horsesState?.playerStates?.[myPlayer.id] : null;

      // IMPORTANT: while the user is interacting (roll/hold), the DB state will lag behind.
      // Prefer localHand briefly to avoid a "stale dice" flash when the roll animation ends.
      const preferLocal = Date.now() - lastLocalEditAtRef.current < 900;

      const dice = preferLocal ? localHand.dice : (dbState?.dice ?? localHand.dice);
      const rollsRemaining = preferLocal
        ? localHand.rollsRemaining
        : (typeof dbState?.rollsRemaining === "number" ? dbState.rollsRemaining : localHand.rollsRemaining);

      const isBlank = dice.every((d: any) => !d?.value);
      if (isBlank && rollsRemaining === 3 && !isRolling) return null;

      return {
        dice,
        rollsRemaining,
        isRolling,
        canToggle: rollsRemaining < 3 && rollsRemaining > 0,
      };
    }

    // CRITICAL: When a bot turn is actively being animated, ALWAYS use botDisplayState.
    // This prevents DB/realtime updates from causing flicker by overwriting the animation state.
    if (botTurnActiveId === currentTurnPlayerId && botDisplayState?.playerId === currentTurnPlayerId) {
      const isBlank = botDisplayState.dice.every((d: any) => !d?.value);
      if (isBlank && !botDisplayState.isRolling) return null;
      return botDisplayState;
    }

    // For non-active bot turns, still prefer botDisplayState if it matches
    if (currentTurnPlayer?.is_bot && botDisplayState?.playerId === currentTurnPlayerId) {
      const isBlank = botDisplayState.dice.every((d: any) => !d?.value);
      if (isBlank && !botDisplayState.isRolling) return null;
      return botDisplayState;
    }

    // Fallback to DB state for human players (who aren't "me")
    const state = horsesState?.playerStates?.[currentTurnPlayerId];
    if (!state) return null;

    const isBlank = state.dice.every((d: any) => !d?.value);
    if (isBlank && state.rollsRemaining === 3) return null;

    return { dice: state.dice, rollsRemaining: state.rollsRemaining, isRolling: false };
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
  ]);

  useEffect(() => {
    if (rawFeltDice) {
      lastFeltDiceRef.current = { playerId: currentTurnPlayerId ?? null, value: rawFeltDice };
      lastFeltDiceAtRef.current = Date.now();
    }
  }, [rawFeltDice, currentTurnPlayerId]);

  const feltDice = useMemo(() => {
    if (rawFeltDice) return rawFeltDice;
    if (!enabled) return null;

    // If state is briefly unavailable (e.g. refetch/realtime gap), keep the last dice for a beat.
    // IMPORTANT: only reuse the cache if it's for the SAME player (prevents bot->you flash).
    const cached = lastFeltDiceRef.current;
    if (
      cached?.playerId === currentTurnPlayerId &&
      Date.now() - lastFeltDiceAtRef.current < 400
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
    getPlayerHandResult,
    handleRoll,
    handleToggleHold,
    handleLockIn,
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
  };
}
