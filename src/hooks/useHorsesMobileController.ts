import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";
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
  getBotHoldDecision,
  shouldBotStopRolling,
  applyHoldDecision,
} from "@/lib/horsesBotLogic";

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

// Database state structure
export interface HorsesPlayerDiceState {
  dice: HorsesDieType[];
  rollsRemaining: number;
  isComplete: boolean;
  result?: HorsesHandResult;
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
}

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
}: UseHorsesMobileControllerArgs) {
  // Local state for dice rolling animation (only used by the local user when it's their turn)
  const [localHand, setLocalHand] = useState<HorsesHand>(createInitialHand());
  const [isRolling, setIsRolling] = useState(false);
  const botProcessingRef = useRef<Set<string>>(new Set());
  const botRunTokenRef = useRef(0);
  const initializingRef = useRef(false);

  // Bot animation state - show intermediate dice/holds
  const [botDisplayState, setBotDisplayState] = useState<{
    playerId: string;
    dice: HorsesDieType[];
    isRolling: boolean;
  } | null>(null);

  // Sticky cache for felt dice to prevent flicker when realtime state briefly rehydrates
  const lastFeltDiceRef = useRef<{ playerId: string | null; value: any } | null>(null);
  const lastFeltDiceAtRef = useRef<number>(0);

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
  const gamePhase: HorsesStateFromDB["gamePhase"] = horsesState?.gamePhase || "waiting";

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

    if (myState && isMyTurn) {
      setLocalHand({
        dice: myState.dice,
        rollsRemaining: myState.rollsRemaining,
        isComplete: myState.isComplete,
      });
    } else if (isMyTurn && !myState) {
      setLocalHand(createInitialHand());
    }
  }, [enabled, isMyTurn, currentTurnPlayerId, myState?.dice, myState?.rollsRemaining, myState?.isComplete]);

  // Clear bot display state when turn changes to a non-bot (prevents dice flash)
  useEffect(() => {
    if (botDisplayState && botDisplayState.playerId !== currentTurnPlayerId) {
      setBotDisplayState(null);
    }
  }, [currentTurnPlayerId, currentTurnPlayer?.is_bot]);

  const completedResults = useMemo(
    () =>
      Object.entries(horsesState?.playerStates || {})
        .filter(([_, state]) => state.isComplete && state.result)
        .map(([playerId, state]) => ({ playerId, result: state.result! })),
    [horsesState?.playerStates],
  );

  const currentWinningResult = useMemo(() => {
    if (completedResults.length === 0) return null;
    return completedResults.reduce((best, curr) =>
      curr.result.rank > best.result.rank ? curr : best,
    ).result;
  }, [completedResults]);

  const winningPlayerIds = useMemo(() => {
    if (completedResults.length === 0 || gamePhase !== "complete") return [] as string[];
    return determineWinners(completedResults.map((r) => r.result)).map(
      (i) => completedResults[i].playerId,
    );
  }, [completedResults, gamePhase]);

  // Initialize game state when round starts
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

      const initialState: HorsesStateFromDB = {
        currentTurnPlayerId: order[0] ?? null,
        playerStates: {},
        gamePhase: "playing",
        turnOrder: order,
        botControllerUserId: controllerUserId,
      };

      order.forEach((playerId) => {
        const initHand = createInitialHand();
        initialState.playerStates[playerId] = {
          dice: initHand.dice,
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

  const saveMyState = useCallback(
    async (hand: HorsesHand, completed: boolean, result?: HorsesHandResult) => {
      if (!enabled) return;
      if (!currentRoundId || !myPlayer) return;

      const newPlayerState: HorsesPlayerDiceState = {
        dice: hand.dice,
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

      await horsesAdvanceTurn(currentRoundId, expected);
    },
    [enabled, currentRoundId, horsesState?.currentTurnPlayerId],
  );

  const handleRoll = useCallback(async () => {
    if (!enabled) return;
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining <= 0) return;

    setIsRolling(true);

    setTimeout(async () => {
      const newHand = rollDice(localHand);
      setLocalHand(newHand);
      setIsRolling(false);

      if (newHand.rollsRemaining === 0) {
        const result = evaluateHand(newHand.dice);
        await saveMyState(newHand, true, result);
        setTimeout(() => {
          advanceToNextTurn(myPlayer?.id ?? null);
        }, 1500);
      } else {
        await saveMyState(newHand, false);
      }
    }, 500);
  }, [enabled, isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id]);

  const handleToggleHold = useCallback(
    (index: number) => {
      if (!enabled) return;
      if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining === 3) return;
      setLocalHand((prev) => toggleHold(prev, index));
    },
    [enabled, isMyTurn, localHand.isComplete, localHand.rollsRemaining],
  );

  const handleLockIn = useCallback(async () => {
    if (!enabled) return;
    if (!isMyTurn || localHand.rollsRemaining === 3 || localHand.isComplete) return;

    const lockedHand = lockInHand(localHand);
    setLocalHand(lockedHand);

    const result = evaluateHand(lockedHand.dice);
    await saveMyState(lockedHand, true, result);

    setTimeout(() => {
      advanceToNextTurn(myPlayer?.id ?? null);
    }, 1500);
  }, [enabled, isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id]);

  // Bot auto-play with visible animation
  useEffect(() => {
    if (!enabled) return;
    if (!currentTurnPlayer?.is_bot || gamePhase !== "playing" || !currentRoundId || !horsesState) return;
    if (!currentUserId) return;

    const token = ++botRunTokenRef.current;
    let cancelled = false;

    const run = async () => {
      const botId = currentTurnPlayer.id;
      console.log("[HORSES] (mobile) bot loop start", { roundId: currentRoundId, botId, token });

      // Ensure a SINGLE client drives bot turns.
      // Use an atomic backend claim to avoid overwriting newer horses_state (the main cause of turn flashing).
      let controllerId = horsesState.botControllerUserId ?? null;

      if (!controllerId) {
        const { data, error } = await supabase.rpc("claim_horses_bot_controller", {
          _round_id: currentRoundId,
        });

        if (error) {
          console.error("[HORSES] Failed to claim bot controller (atomic):", error);
        } else {
          controllerId = (data as any)?.botControllerUserId ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
        }
      }

      // Fallback for older rounds / unexpected nulls
      controllerId = controllerId ?? candidateBotControllerUserId ?? null;

      if (controllerId && controllerId !== currentUserId) return;

      if (cancelled || botRunTokenRef.current !== token) return;

      // Preflight: read the latest horses_state to avoid acting on stale props.
      const { data: roundRow, error: roundErr } = await supabase
        .from("rounds")
        .select("horses_state")
        .eq("id", currentRoundId)
        .maybeSingle();

      if (cancelled || botRunTokenRef.current !== token) return;

      if (roundErr) {
        console.error("[HORSES] Failed to preflight round state:", roundErr);
      }

      const latestState = (roundRow as any)?.horses_state as HorsesStateFromDB | null; // eslint-disable-line @typescript-eslint/no-explicit-any

      // If the DB already moved the turn, do nothing.
      if (latestState?.currentTurnPlayerId && latestState.currentTurnPlayerId !== botId) {
        console.log("[HORSES] (mobile) bot loop abort: turn already moved", {
          roundId: currentRoundId,
          expectedBotId: botId,
          currentTurnPlayerId: latestState.currentTurnPlayerId,
        });
        return;
      }

      const latestBotState = latestState?.playerStates?.[botId];

      // If bot already completed but the turn is still stuck on the bot, advance only.
      if (latestState && latestBotState?.isComplete && latestState.currentTurnPlayerId === botId) {
        console.warn("[HORSES] (mobile) bot already complete but turn stuck; advancing only", {
          roundId: currentRoundId,
          botId,
        });

        await horsesAdvanceTurn(currentRoundId, botId);
        return;
      }

      if (latestBotState?.isComplete) {
        console.log("[HORSES] (mobile) bot loop abort: bot already complete", {
          roundId: currentRoundId,
          botId,
        });
        return;
      }

      if (botProcessingRef.current.has(botId)) return;
      botProcessingRef.current.add(botId);

      try {
        let stateForWrites: HorsesStateFromDB = latestState
          ? controllerId
            ? { ...latestState, botControllerUserId: controllerId }
            : latestState
          : controllerId
            ? { ...horsesState, botControllerUserId: controllerId }
            : horsesState;

        let botHand: HorsesHand = stateForWrites.playerStates?.[botId]
          ? {
              dice: stateForWrites.playerStates[botId].dice,
              rollsRemaining: stateForWrites.playerStates[botId].rollsRemaining,
              isComplete: stateForWrites.playerStates[botId].isComplete,
            }
          : createInitialHand();

        for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
          if (cancelled || botRunTokenRef.current !== token) return;

          setBotDisplayState({ playerId: botId, dice: botHand.dice, isRolling: true });
          await new Promise((resolve) => setTimeout(resolve, 450));

          if (cancelled || botRunTokenRef.current !== token) return;

          botHand = rollDice(botHand);
          setBotDisplayState({ playerId: botId, dice: botHand.dice, isRolling: false });

          // Save intermediate bot state (atomic per-player)
          await horsesSetPlayerState(currentRoundId, botId, {
            dice: botHand.dice,
            rollsRemaining: botHand.rollsRemaining,
            isComplete: false,
          });

          await new Promise((resolve) => setTimeout(resolve, 450));

          if (shouldBotStopRolling(botHand.dice, botHand.rollsRemaining, currentWinningResult)) {
            break;
          }

          if (botHand.rollsRemaining > 0) {
            const decision = getBotHoldDecision({
              currentDice: botHand.dice,
              rollsRemaining: botHand.rollsRemaining,
              currentWinningResult,
            });

            botHand = applyHoldDecision(botHand, decision);
            setBotDisplayState({ playerId: botId, dice: botHand.dice, isRolling: false });

            // Save hold state (atomic per-player)
            await horsesSetPlayerState(currentRoundId, botId, {
              dice: botHand.dice,
              rollsRemaining: botHand.rollsRemaining,
              isComplete: false,
            });

            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }

        if (cancelled || botRunTokenRef.current !== token) return;

        botHand = lockInHand(botHand);
        const result = evaluateHand(botHand.dice);

        // Keep the final bot dice on-screen until the DB turn actually advances.
        setBotDisplayState({ playerId: botId, dice: botHand.dice, isRolling: false });

        // Save bot final state (atomic per-player)
        await horsesSetPlayerState(currentRoundId, botId, {
          dice: botHand.dice,
          rollsRemaining: 0,
          isComplete: true,
          result,
        });

        await new Promise((resolve) => setTimeout(resolve, 450));

        if (cancelled || botRunTokenRef.current !== token) return;

        // Final guard: if someone already moved the turn, don't overwrite.
        const { data: turnCheck } = await supabase
          .from("rounds")
          .select("horses_state")
          .eq("id", currentRoundId)
          .maybeSingle();

        const checkState = (turnCheck as any)?.horses_state as HorsesStateFromDB | null; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (checkState?.currentTurnPlayerId && checkState.currentTurnPlayerId !== botId) {
          console.log("[HORSES] (mobile) bot advance abort: turn already changed", {
            roundId: currentRoundId,
            botId,
            currentTurnPlayerId: checkState.currentTurnPlayerId,
          });
          return;
        }

        // Advance turn (atomic + guarded)
        await horsesAdvanceTurn(currentRoundId, botId);

      } catch (error) {
        console.error("[HORSES] Bot play failed:", error);
      } finally {
        botProcessingRef.current.delete(botId);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    currentTurnPlayer?.id,
    currentTurnPlayer?.is_bot,
    gamePhase,
    currentRoundId,
    horsesState,
    turnOrder,
    currentWinningResult,
    candidateBotControllerUserId,
    currentUserId,
  ]);

  // Handle game complete - award pot to winner
  useEffect(() => {
    if (!enabled) return;
    if (gamePhase !== "complete" || !gameId || !currentRoundId) return;
    if (winningPlayerIds.length === 0) return;

    const shouldProcess =
      turnOrder[0] && players.find((p) => p.id === turnOrder[0])?.user_id === currentUserId;
    if (!shouldProcess) return;

    const processWin = async () => {
      if (winningPlayerIds.length > 1) {
        toast.info("It's a tie! Everyone re-antes.");
        return;
      }

      const winnerId = winningPlayerIds[0];
      const winnerPlayer = players.find((p) => p.id === winnerId);
      const winnerResult = completedResults.find((r) => r.playerId === winnerId);

      if (!winnerPlayer || !winnerResult) return;

      const { error: updateError } = await supabase
        .from("players")
        .update({ chips: winnerPlayer.chips + pot })
        .eq("id", winnerId);

      if (updateError) return;

      const winnerName = getPlayerUsername(winnerPlayer);
      toast.success(`${winnerName} wins $${pot} with ${winnerResult.result.description}!`);

      await supabase
        .from("games")
        .update({
          awaiting_next_round: true,
          next_round_number: 1,
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
    turnOrder,
    players,
    currentUserId,
    completedResults,
    pot,
    getPlayerUsername,
  ]);

  const rawFeltDice = useMemo(() => {
    if (!enabled || gamePhase !== "playing" || !currentTurnPlayerId) return null;

    // IMPORTANT: avoid flashing unrolled dice during turn transitions.
    // Prefer the authoritative DB state for the current player, then fall back to local state.
    if (isMyTurn) {
      const dbState = myPlayer ? horsesState?.playerStates?.[myPlayer.id] : null;
      const dice = dbState?.dice ?? localHand.dice;
      const rollsRemaining =
        typeof dbState?.rollsRemaining === "number" ? dbState.rollsRemaining : localHand.rollsRemaining;

      const isBlank = dice.every((d: any) => !d?.value);
      if (isBlank && rollsRemaining === 3 && !isRolling) return null;

      return {
        dice,
        isRolling,
        canToggle: rollsRemaining < 3 && rollsRemaining > 0,
      };
    }

    if (currentTurnPlayer?.is_bot && botDisplayState?.playerId === currentTurnPlayerId) {
      const isBlank = botDisplayState.dice.every((d: any) => !d?.value);
      if (isBlank && !botDisplayState.isRolling) return null;
      return botDisplayState;
    }

    const state = horsesState?.playerStates?.[currentTurnPlayerId];
    if (!state) return null;

    const isBlank = state.dice.every((d: any) => !d?.value);
    if (isBlank && state.rollsRemaining === 3) return null;

    return { dice: state.dice, isRolling: false };
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
    return determineWinners(completedResults.map((r) => r.result)).map(
      (i) => completedResults[i].playerId,
    );
  }, [completedResults]);

  // Get a player's completed hand result
  const getPlayerHandResult = useCallback(
    (playerId: string): HorsesHandResult | null => {
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
  };
}
