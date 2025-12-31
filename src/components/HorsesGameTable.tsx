import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { HorsesPlayerArea } from "./HorsesPlayerArea";
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
import { Dice5, Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";

interface Player {
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

interface HorsesGameTableProps {
  gameId: string;
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  anteAmount: number;
  dealerPosition: number;
  currentRoundId: string | null;
  horsesState: HorsesStateFromDB | null;
  onRefetch: () => void;
}

// Database state structure
interface PlayerDiceState {
  dice: HorsesDieType[];
  rollsRemaining: number;
  isComplete: boolean;
  result?: HorsesHandResult;
}

export interface HorsesStateFromDB {
  currentTurnPlayerId: string | null;
  playerStates: Record<string, PlayerDiceState>;
  gamePhase: "waiting" | "playing" | "complete";
  turnOrder: string[]; // Player IDs in turn order
}

// Helper to update horses_state in rounds table (bypasses type checking since column is new)
async function updateHorsesState(roundId: string, state: HorsesStateFromDB): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ horses_state: state } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq("id", roundId);
  return error;
}

export function HorsesGameTable({
  gameId,
  players,
  currentUserId,
  pot,
  anteAmount,
  dealerPosition,
  currentRoundId,
  horsesState,
  onRefetch,
}: HorsesGameTableProps) {
  // Local state for dice rolling animation
  const [localHand, setLocalHand] = useState<HorsesHand>(createInitialHand());
  const [isRolling, setIsRolling] = useState(false);
  const botProcessingRef = useRef<Set<string>>(new Set());
  const initializingRef = useRef(false);

  // Get active players sorted by position (clockwise from dealer's left)
  const activePlayers = players
    .filter(p => !p.sitting_out)
    .sort((a, b) => {
      // Sort by distance from dealer position (clockwise)
      const aDistance = (a.position - dealerPosition + players.length) % players.length || players.length;
      const bDistance = (b.position - dealerPosition + players.length) % players.length || players.length;
      return aDistance - bDistance;
    });

  // Determine turn order (left of dealer first, dealer last)
  const turnOrder = horsesState?.turnOrder || activePlayers.map(p => p.id);
  
  // Current player from DB state
  const currentTurnPlayerId = horsesState?.currentTurnPlayerId;
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const gamePhase = horsesState?.gamePhase || "waiting";

  // Get my player state from DB
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const myState = myPlayer ? horsesState?.playerStates?.[myPlayer.id] : null;

  // Sync local hand with DB state when it's my turn
  useEffect(() => {
    if (myState && isMyTurn) {
      setLocalHand({
        dice: myState.dice,
        rollsRemaining: myState.rollsRemaining,
        isComplete: myState.isComplete,
      });
    } else if (isMyTurn && !myState) {
      // Initialize fresh hand when it becomes my turn
      setLocalHand(createInitialHand());
    }
  }, [isMyTurn, myState?.rollsRemaining, myState?.isComplete]);

  // Calculate winning hands
  const completedResults = Object.entries(horsesState?.playerStates || {})
    .filter(([_, state]) => state.isComplete && state.result)
    .map(([playerId, state]) => ({
      playerId,
      result: state.result!,
    }));

  const winningPlayerIds = completedResults.length > 0 && gamePhase === "complete"
    ? determineWinners(completedResults.map(r => r.result)).map(i => completedResults[i].playerId)
    : [];

  // Initialize game state when round starts
  useEffect(() => {
    if (!currentRoundId || !gameId) return;
    if (horsesState?.turnOrder?.length > 0) return; // Already initialized
    if (initializingRef.current) return;
    if (activePlayers.length === 0) return;

    initializingRef.current = true;

    const initializeGame = async () => {
      const order = activePlayers.map(p => p.id);
      
      const initialState: HorsesStateFromDB = {
        currentTurnPlayerId: order[0],
        playerStates: {},
        gamePhase: "playing",
        turnOrder: order,
      };

      // Initialize each player's state
      order.forEach(playerId => {
        const initHand = createInitialHand();
        initialState.playerStates[playerId] = {
          dice: initHand.dice,
          rollsRemaining: initHand.rollsRemaining,
          isComplete: false,
        };
      });

      const error = await updateHorsesState(currentRoundId, initialState);
      if (error) {
        console.error("[HORSES] Failed to initialize state:", error);
      }
      initializingRef.current = false;
    };

    initializeGame();
  }, [currentRoundId, activePlayers.length, horsesState?.turnOrder?.length, gameId]);

  // Save my dice state to DB
  const saveMyState = useCallback(async (hand: HorsesHand, completed: boolean, result?: HorsesHandResult) => {
    if (!currentRoundId || !myPlayer || !horsesState) return;

    const newPlayerState: PlayerDiceState = {
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
    if (error) {
      console.error("[HORSES] Failed to save state:", error);
    }
  }, [currentRoundId, myPlayer, horsesState]);

  // Advance to next turn
  const advanceToNextTurn = useCallback(async () => {
    if (!currentRoundId || !horsesState) return;

    const currentIndex = turnOrder.indexOf(currentTurnPlayerId || "");
    const nextIndex = currentIndex + 1;

    if (nextIndex >= turnOrder.length) {
      // All players done - mark game complete
      const updatedState: HorsesStateFromDB = {
        ...horsesState,
        gamePhase: "complete",
        currentTurnPlayerId: null,
      };
      const error = await updateHorsesState(currentRoundId, updatedState);
      if (error) {
        console.error("[HORSES] Failed to complete game:", error);
      }
    } else {
      // Move to next player
      const nextPlayerId = turnOrder[nextIndex];
      
      // Initialize next player's hand if not exists
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
      if (error) {
        console.error("[HORSES] Failed to advance turn:", error);
      }
    }
  }, [currentRoundId, horsesState, turnOrder, currentTurnPlayerId]);

  // Handle roll dice
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining <= 0) return;

    setIsRolling(true);

    // Animate for a moment then show result
    setTimeout(async () => {
      const newHand = rollDice(localHand);
      setLocalHand(newHand);
      setIsRolling(false);

      // Save to DB
      if (newHand.rollsRemaining === 0) {
        // Auto-lock when out of rolls
        const result = evaluateHand(newHand.dice);
        await saveMyState(newHand, true, result);
        
        setTimeout(() => {
          advanceToNextTurn();
        }, 1500);
      } else {
        await saveMyState(newHand, false);
      }
    }, 500);
  }, [isMyTurn, localHand, saveMyState, advanceToNextTurn]);

  // Handle toggle hold
  const handleToggleHold = useCallback((index: number) => {
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining === 3) return;
    setLocalHand(prev => toggleHold(prev, index));
  }, [isMyTurn, localHand.isComplete, localHand.rollsRemaining]);

  // Handle lock in (end turn early)
  const handleLockIn = useCallback(async () => {
    if (!isMyTurn || localHand.rollsRemaining === 3 || localHand.isComplete) return;

    const lockedHand = lockInHand(localHand);
    setLocalHand(lockedHand);
    
    const result = evaluateHand(lockedHand.dice);
    await saveMyState(lockedHand, true, result);

    setTimeout(() => {
      advanceToNextTurn();
    }, 1500);
  }, [isMyTurn, localHand, saveMyState, advanceToNextTurn]);

  // Bot auto-play
  useEffect(() => {
    if (!currentPlayer?.is_bot || gamePhase !== "playing" || !currentRoundId || !horsesState) return;
    if (botProcessingRef.current.has(currentPlayer.id)) return;
    
    botProcessingRef.current.add(currentPlayer.id);

    const botPlay = async () => {
      let botHand = horsesState?.playerStates?.[currentPlayer.id] 
        ? {
            dice: horsesState.playerStates[currentPlayer.id].dice,
            rollsRemaining: horsesState.playerStates[currentPlayer.id].rollsRemaining,
            isComplete: horsesState.playerStates[currentPlayer.id].isComplete,
          }
        : createInitialHand();

      // Roll up to 3 times with some strategy
      for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
        await new Promise(resolve => setTimeout(resolve, 1200));

        botHand = rollDice(botHand);

        // Simple strategy: lock in if we have 4 or 5 of a kind
        const result = evaluateHand(botHand.dice);
        if (result.ofAKindCount >= 4) {
          break;
        }

        // Hold dice that match the most common value (excluding 1s which are wild)
        if (botHand.rollsRemaining > 0) {
          const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
          botHand.dice.forEach(d => counts[d.value]++);

          // Find best value to keep (highest count, prefer higher values)
          let bestValue = 6;
          let bestCount = 0;
          for (let v = 6; v >= 2; v--) {
            const totalWithWilds = counts[v] + counts[1];
            if (totalWithWilds > bestCount) {
              bestCount = totalWithWilds;
              bestValue = v;
            }
          }

          // Hold dice matching best value or 1s
          botHand = {
            ...botHand,
            dice: botHand.dice.map(d => ({
              ...d,
              isHeld: d.value === bestValue || d.value === 1,
            })),
          };
        }
      }

      // Mark complete
      botHand = lockInHand(botHand);
      const result = evaluateHand(botHand.dice);

      // Save bot state to DB
      const updatedStates = {
        ...(horsesState?.playerStates || {}),
        [currentPlayer.id]: {
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

      // Advance turn after a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const currentIndex = turnOrder.indexOf(currentPlayer.id);
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

      botProcessingRef.current.delete(currentPlayer.id);
    };

    botPlay();
  }, [currentPlayer?.id, currentPlayer?.is_bot, gamePhase, currentRoundId, horsesState, turnOrder]);

  // Handle game complete - award pot to winner
  useEffect(() => {
    if (gamePhase !== "complete" || !gameId || !currentRoundId) return;
    if (winningPlayerIds.length === 0) return;

    // Only the first player in turn order processes the win
    const shouldProcess = turnOrder[0] && players.find(p => p.id === turnOrder[0])?.user_id === currentUserId;
    if (!shouldProcess) return;

    const processWin = async () => {
      if (winningPlayerIds.length > 1) {
        // Tie - need to handle re-ante
        toast.info("It's a tie! Everyone re-antes.");
        // TODO: Trigger re-ante flow
      } else {
        const winnerId = winningPlayerIds[0];
        const winnerPlayer = players.find(p => p.id === winnerId);
        const winnerResult = completedResults.find(r => r.playerId === winnerId);
        
        if (winnerPlayer && winnerResult) {
          // Award pot to winner
          const { error: updateError } = await supabase
            .from("players")
            .update({ chips: winnerPlayer.chips + pot })
            .eq("id", winnerId);

          if (!updateError) {
            const winnerName = winnerPlayer.is_bot 
              ? getBotAlias(players, winnerPlayer.user_id)
              : (winnerPlayer.profiles?.username || "Unknown");
            
            toast.success(`${winnerName} wins $${pot} with ${winnerResult.result.description}!`);

            // Transition game to game_over
            await supabase
              .from("games")
              .update({ 
                status: "game_over",
                last_round_result: `${winnerName} wins with ${winnerResult.result.description}`,
              })
              .eq("id", gameId);
          }
        }
      }
    };

    processWin();
  }, [gamePhase, winningPlayerIds, pot, players, currentUserId, gameId, turnOrder, completedResults, currentRoundId]);

  // Get username for player
  const getPlayerUsername = (player: Player) => {
    if (player.is_bot) {
      return getBotAlias(players, player.user_id);
    }
    return player.profiles?.username || `Player ${player.position}`;
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 min-h-[500px]">
      {/* Pot display */}
      <div className="flex items-center gap-2 bg-amber-900/50 px-4 py-2 rounded-lg">
        <span className="text-amber-200">Pot:</span>
        <span className="text-2xl font-bold text-poker-gold">${pot}</span>
      </div>

      {/* Player areas - show all players with their results */}
      <div className="flex flex-wrap justify-center gap-4 max-w-4xl">
        {activePlayers.map((player) => {
          const playerState = horsesState?.playerStates?.[player.id];
          const isWinner = winningPlayerIds.includes(player.id);
          const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
          const hasCompleted = playerState?.isComplete || false;

          return (
            <HorsesPlayerArea
              key={player.id}
              username={getPlayerUsername(player)}
              position={player.position}
              isCurrentTurn={isCurrent}
              isCurrentUser={player.user_id === currentUserId}
              handResult={playerState?.result || null}
              isWinningHand={isWinner && gamePhase === "complete"}
              hasTurnCompleted={hasCompleted}
              diceValues={hasCompleted ? playerState?.dice : undefined}
            />
          );
        })}
      </div>

      {/* Current turn indicator */}
      {gamePhase === "playing" && currentPlayer && (
        <div className="text-center">
          <Badge
            variant="outline"
            className={cn(
              "text-lg px-4 py-2",
              isMyTurn
                ? "bg-yellow-500/20 border-yellow-500 text-yellow-300"
                : "bg-muted/50 border-border text-muted-foreground"
            )}
          >
            {isMyTurn ? "Your Turn!" : `${getPlayerUsername(currentPlayer)}'s Turn`}
          </Badge>
        </div>
      )}

      {/* Dice area - only show when it's my turn */}
      {isMyTurn && gamePhase === "playing" && (
        <div className="flex flex-col items-center gap-4 p-6 bg-green-900/30 rounded-xl border-2 border-green-700">
          {/* Rolls remaining */}
          <div className="flex items-center gap-2">
            <Dice5 className="w-5 h-5 text-amber-400" />
            <span className="text-amber-200">
              Rolls remaining: <span className="font-bold">{localHand.rollsRemaining}</span>
            </span>
          </div>

          {/* Dice */}
          <div className="flex gap-3">
            {localHand.dice.map((die, idx) => (
              <HorsesDie
                key={idx}
                value={die.value}
                isHeld={die.isHeld}
                isRolling={isRolling && !die.isHeld}
                canToggle={localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0}
                onToggle={() => handleToggleHold(idx)}
                size="lg"
              />
            ))}
          </div>

          {/* Instructions */}
          {localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
            <p className="text-sm text-amber-200/70">
              Click dice to hold/unhold them
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleRoll}
              disabled={localHand.rollsRemaining <= 0 || isRolling}
              className="bg-green-600 hover:bg-green-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Roll {localHand.rollsRemaining === 3 ? "" : "Again"}
            </Button>

            {localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
              <Button
                onClick={handleLockIn}
                variant="outline"
                className="border-amber-500 text-amber-400 hover:bg-amber-500/20"
              >
                <Lock className="w-4 h-4 mr-2" />
                Lock In
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Watching other player roll */}
      {!isMyTurn && gamePhase === "playing" && currentPlayer && (
        <div className="flex flex-col items-center gap-4 p-6 bg-muted/30 rounded-xl border-2 border-border">
          <div className="flex items-center gap-2">
            <Dice5 className="w-5 h-5 text-muted-foreground animate-bounce" />
            <span className="text-muted-foreground">
              {getPlayerUsername(currentPlayer)} is rolling...
            </span>
          </div>
          
          {/* Show current player's dice state */}
          {horsesState?.playerStates?.[currentPlayer.id] && (
            <div className="flex gap-3">
              {horsesState.playerStates[currentPlayer.id].dice.map((die, idx) => (
                <HorsesDie
                  key={idx}
                  value={die.value}
                  isHeld={die.isHeld}
                  isRolling={false}
                  canToggle={false}
                  onToggle={() => {}}
                  size="md"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Game complete message */}
      {gamePhase === "complete" && (
        <div className="text-center p-6 bg-amber-900/30 rounded-xl border-2 border-amber-600">
          <h3 className="text-2xl font-bold text-poker-gold mb-2">Round Complete!</h3>
          {winningPlayerIds.length > 1 ? (
            <p className="text-amber-200">It's a tie! Re-ante to continue...</p>
          ) : (
            <p className="text-amber-200">
              {(() => {
                const winner = completedResults.find(r => r.playerId === winningPlayerIds[0]);
                const winnerPlayer = players.find(p => p.id === winningPlayerIds[0]);
                return winner && winnerPlayer
                  ? `${getPlayerUsername(winnerPlayer)} wins with ${winner.result.description}!`
                  : "Winner determined!";
              })()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}