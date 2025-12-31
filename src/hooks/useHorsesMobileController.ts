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
}

async function updateHorsesState(roundId: string, state: HorsesStateFromDB): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ horses_state: state } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq("id", roundId);
  return error;
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
  const initializingRef = useRef(false);

  // Bot animation state - show intermediate dice/holds
  const [botDisplayState, setBotDisplayState] = useState<{
    playerId: string; dice: HorsesDieType[];
    isRolling: boolean;
  } | null>(null);

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

      const initialState: HorsesStateFromDB = {
        currentTurnPlayerId: order[0] ?? null,
        playerStates: {},
        gamePhase: "playing",
        turnOrder: order,
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
      if (!currentRoundId || !myPlayer || !horsesState) return;

      const newPlayerState: HorsesPlayerDiceState = {
        dice: hand.dice,
        rollsRemaining: hand.rollsRemaining,
        isComplete: completed,
        result,
      };

      const updatedState: HorsesStateFromDB = {
        ...horsesState,
        playerStates: {
          ...horsesState.playerStates,
          [myPlayer.id]: newPlayerState,
        },
      };

      const error = await updateHorsesState(currentRoundId, updatedState);
      if (error) console.error("[HORSES] Failed to save state:", error);
    },
    [enabled, currentRoundId, myPlayer, horsesState],
  );

  const advanceToNextTurn = useCallback(async () => {
    if (!enabled) return;
    if (!currentRoundId || !horsesState) return;

    const currentIndex = turnOrder.indexOf(currentTurnPlayerId || "");
    const nextIndex = currentIndex + 1;

    if (nextIndex >= turnOrder.length) {
      const updatedState: HorsesStateFromDB = {
        ...horsesState,
        gamePhase: "complete",
        currentTurnPlayerId: null,
      };
      const error = await updateHorsesState(currentRoundId, updatedState);
      if (error) console.error("[HORSES] Failed to complete game:", error);
      return;
    }

    const nextPlayerId = turnOrder[nextIndex];
    const nextPlayerState = horsesState.playerStates[nextPlayerId] || {
      dice: createInitialHand().dice,
      rollsRemaining: 3,
      isComplete: false,
    };

    const updatedState: HorsesStateFromDB = {
      ...horsesState,
      currentTurnPlayerId: nextPlayerId,
      playerStates: {
        ...horsesState.playerStates,
        [nextPlayerId]: nextPlayerState,
      },
    };

    const error = await updateHorsesState(currentRoundId, updatedState);
    if (error) console.error("[HORSES] Failed to advance turn:", error);
  }, [enabled, currentRoundId, horsesState, turnOrder, currentTurnPlayerId]);

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
          advanceToNextTurn();
        }, 1500);
      } else {
        await saveMyState(newHand, false);
      }
    }, 500);
  }, [enabled, isMyTurn, localHand, saveMyState, advanceToNextTurn]);

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
      advanceToNextTurn();
    }, 1500);
  }, [enabled, isMyTurn, localHand, saveMyState, advanceToNextTurn]);

  // Bot auto-play with visible animation
  useEffect(() => {
    if (!enabled) return;
    if (!currentTurnPlayer?.is_bot || gamePhase !== "playing" || !currentRoundId || !horsesState) return;
    if (botProcessingRef.current.has(currentTurnPlayer.id)) return;

    botProcessingRef.current.add(currentTurnPlayer.id);

    const botPlay = async () => {
      let botHand: HorsesHand = horsesState?.playerStates?.[currentTurnPlayer.id]
        ? {
            dice: horsesState.playerStates[currentTurnPlayer.id].dice,
            rollsRemaining: horsesState.playerStates[currentTurnPlayer.id].rollsRemaining,
            isComplete: horsesState.playerStates[currentTurnPlayer.id].isComplete,
          }
        : createInitialHand();

      for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
        setBotDisplayState({ playerId: currentTurnPlayer.id, dice: botHand.dice, isRolling: true });
        await new Promise((resolve) => setTimeout(resolve, 450));

        botHand = rollDice(botHand);
        setBotDisplayState({ playerId: currentTurnPlayer.id, dice: botHand.dice, isRolling: false });

        const intermediateState = {
          ...(horsesState?.playerStates || {}),
          [currentTurnPlayer.id]: {
            dice: botHand.dice,
            rollsRemaining: botHand.rollsRemaining,
            isComplete: false,
          },
        };

        await updateHorsesState(currentRoundId, {
          ...horsesState,
          playerStates: intermediateState,
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
          setBotDisplayState({ playerId: currentTurnPlayer.id, dice: botHand.dice, isRolling: false });

          const holdState = {
            ...(horsesState?.playerStates || {}),
            [currentTurnPlayer.id]: {
              dice: botHand.dice,
              rollsRemaining: botHand.rollsRemaining,
              isComplete: false,
            },
          };

          await updateHorsesState(currentRoundId, {
            ...horsesState,
            playerStates: holdState,
          });

          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }

      botHand = lockInHand(botHand);
      const result = evaluateHand(botHand.dice);
      setBotDisplayState(null);

      const updatedStates = {
        ...(horsesState?.playerStates || {}),
        [currentTurnPlayer.id]: {
          dice: botHand.dice,
          rollsRemaining: 0,
          isComplete: true,
          result,
        },
      };

      await updateHorsesState(currentRoundId, {
        ...horsesState,
        playerStates: updatedStates,
      });

      await new Promise((resolve) => setTimeout(resolve, 450));

      const currentIndex = turnOrder.indexOf(currentTurnPlayer.id);
      const nextIndex = currentIndex + 1;

      if (nextIndex >= turnOrder.length) {
        await updateHorsesState(currentRoundId, {
          ...horsesState,
          playerStates: updatedStates,
          gamePhase: "complete",
          currentTurnPlayerId: null,
        });
      } else {
        const nextPlayerId = turnOrder[nextIndex];
        const nextPlayerState = horsesState?.playerStates?.[nextPlayerId] || {
          dice: createInitialHand().dice,
          rollsRemaining: 3,
          isComplete: false,
        };

        await updateHorsesState(currentRoundId, {
          ...horsesState,
          playerStates: {
            ...updatedStates,
            [nextPlayerId]: nextPlayerState,
          },
          currentTurnPlayerId: nextPlayerId,
        });
      }

      botProcessingRef.current.delete(currentTurnPlayer.id);
    };

    botPlay();
  }, [
    enabled,
    currentTurnPlayer?.id,
    currentTurnPlayer?.is_bot,
    gamePhase,
    currentRoundId,
    horsesState,
    turnOrder,
    currentWinningResult,
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

  const feltDice = useMemo(() => {
    if (!enabled || gamePhase !== "playing" || !currentTurnPlayerId) return null;

    if (isMyTurn) {
      return {
        dice: localHand.dice,
        isRolling,
        canToggle: localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0,
      };
    }

    if (currentTurnPlayer?.is_bot && botDisplayState?.playerId === currentTurnPlayerId) return botDisplayState;

    const state = horsesState?.playerStates?.[currentTurnPlayerId];
    return state ? { dice: state.dice, isRolling: false } : null;
  }, [
    enabled,
    gamePhase,
    currentTurnPlayerId,
    isMyTurn,
    localHand.dice,
    localHand.rollsRemaining,
    isRolling,
    currentTurnPlayer?.is_bot,
    botDisplayState,
    horsesState?.playerStates,
  ]);

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
