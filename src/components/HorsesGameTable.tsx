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
import {
  getBotHoldDecision,
  shouldBotStopRolling,
  applyHoldDecision,
} from "@/lib/horsesBotLogic";
import { Dice5, Lock, RotateCcw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

  // Local state for dice rolling animation
  const [localHand, setLocalHand] = useState<HorsesHand>(createInitialHand());
  const [isRolling, setIsRolling] = useState(false);
  const botProcessingRef = useRef<Set<string>>(new Set());
  const initializingRef = useRef(false);
  
  // Bot animation state - show intermediate dice/holds
  const [botDisplayState, setBotDisplayState] = useState<{
    dice: HorsesDieType[];
    isRolling: boolean;
  } | null>(null);

  // Get active players sorted by position
  const activePlayers = players
    .filter(p => !p.sitting_out)
    .sort((a, b) => a.position - b.position);

  // Mobile seating grid players are derived after we know the active turn player (see below).

  // Determine turn order: start LEFT of dealer (dealer goes LAST)
  const getTurnOrder = useCallback(() => {
    if (activePlayers.length === 0) return [];
    
    // Find dealer's index in activePlayers
    const dealerIdx = activePlayers.findIndex(p => p.position === dealerPosition);
    if (dealerIdx === -1) {
      // Fallback: just use position order
      return activePlayers.map(p => p.id);
    }
    
    // Start with player after dealer, wrap around
    const order: string[] = [];
    for (let i = 1; i <= activePlayers.length; i++) {
      const idx = (dealerIdx + i) % activePlayers.length;
      order.push(activePlayers[idx].id);
    }
    return order;
  }, [activePlayers, dealerPosition]);

  // Current player from DB state
  const turnOrder = horsesState?.turnOrder || [];
  const currentTurnPlayerId = horsesState?.currentTurnPlayerId;
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const gamePhase = horsesState?.gamePhase || "waiting";

  // Mobile: show the active-turn player in the fixed Active Player section, and everyone else in the table row.
  const mobileSeatPlayers = currentTurnPlayerId
    ? activePlayers.filter(p => p.id !== currentTurnPlayerId)
    : activePlayers;

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

  // Calculate winning hands (best result so far among completed players)
  const completedResults = Object.entries(horsesState?.playerStates || {})
    .filter(([_, state]) => state.isComplete && state.result)
    .map(([playerId, state]) => ({
      playerId,
      result: state.result!,
    }));

  // Get current winning result (best hand completed so far)
  const currentWinningResult = completedResults.length > 0
    ? completedResults.reduce((best, curr) => 
        curr.result.rank > best.result.rank ? curr : best
      ).result
    : null;

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
      // Use proper turn order: left of dealer first
      const order = getTurnOrder();
      
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
  }, [currentRoundId, activePlayers.length, horsesState?.turnOrder?.length, gameId, getTurnOrder]);

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

  // Bot auto-play with visible animation
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

      // Roll up to 3 times with visible animation
      for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
        // Show "rolling" animation
        setBotDisplayState({ dice: botHand.dice, isRolling: true });
        await new Promise(resolve => setTimeout(resolve, 800));

        // Roll the dice
        botHand = rollDice(botHand);
        
        // Show result of roll
        setBotDisplayState({ dice: botHand.dice, isRolling: false });
        
        // Save intermediate state to DB so others can see
        const intermediateState = {
          ...(horsesState?.playerStates || {}),
          [currentPlayer.id]: {
            dice: botHand.dice,
            rollsRemaining: botHand.rollsRemaining,
            isComplete: false,
          },
        };
        await updateHorsesState(currentRoundId, {
          ...horsesState,
          playerStates: intermediateState,
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if we should stop rolling based on current hand vs winning hand
        if (shouldBotStopRolling(botHand.dice, botHand.rollsRemaining, currentWinningResult)) {
          console.log(`[Bot] Stopping early - good enough hand`);
          break;
        }

        // Determine which dice to hold using smart decision logic
        if (botHand.rollsRemaining > 0) {
          const decision = getBotHoldDecision({
            currentDice: botHand.dice,
            rollsRemaining: botHand.rollsRemaining,
            currentWinningResult,
          });
          
          console.log(`[Bot] Hold decision: ${decision.reasoning}`);
          botHand = applyHoldDecision(botHand, decision);
          
          // Show the hold decision
          setBotDisplayState({ dice: botHand.dice, isRolling: false });
          
          // Save hold state so others can see
          const holdState = {
            ...(horsesState?.playerStates || {}),
            [currentPlayer.id]: {
              dice: botHand.dice,
              rollsRemaining: botHand.rollsRemaining,
              isComplete: false,
            },
          };
          await updateHorsesState(currentRoundId, {
            ...horsesState,
            playerStates: holdState,
          });
          
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }

      // Mark complete
      botHand = lockInHand(botHand);
      const result = evaluateHand(botHand.dice);
      
      // Clear bot display state
      setBotDisplayState(null);

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
  }, [currentPlayer?.id, currentPlayer?.is_bot, gamePhase, currentRoundId, horsesState, turnOrder, currentWinningResult]);

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

  // Get my status for the player area display
  const getMyStatus = (): 'waiting' | 'rolling' | 'done' => {
    if (!myPlayer) return 'waiting';
    if (myState?.isComplete) return 'done';
    if (isMyTurn) return 'rolling';
    return 'waiting';
  };

  // Get dice to display for current turn (bot or from DB)
  const getCurrentTurnDice = () => {
    if (currentPlayer?.is_bot && botDisplayState) {
      return botDisplayState;
    }
    const state = horsesState?.playerStates?.[currentTurnPlayerId || ""];
    return state ? { dice: state.dice, isRolling: false } : null;
  };

  return (
    <div
      className={cn(
        "relative w-full rounded-xl",
        isMobile ? "h-[100svh] overflow-hidden" : "h-full min-h-[500px] overflow-hidden"
      )}
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(142 30% 25%) 0%, hsl(142 40% 15%) 60%, hsl(142 50% 10%) 100%)",
        boxShadow: "inset 0 0 100px rgba(0,0,0,0.5)",
      }}
    >
      {isMobile ? (
        <div className="grid h-full grid-rows-[auto_1fr_auto_auto]">
          {/* Header */}
          <header className="px-4 pt-4 pb-2 text-center">
            <h1 className="text-xl font-bold text-poker-gold">Horses</h1>
            <p className="text-sm text-amber-200/80">Ante: ${anteAmount}</p>

            <div className="mt-2 flex justify-center">
              <div className="flex items-center gap-2 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-600/50">
                <span className="text-amber-200 text-sm">Pot:</span>
                <span className="text-lg font-bold text-poker-gold">${pot}</span>
              </div>
            </div>

            {gamePhase === "playing" && currentPlayer && (
              <div className="mt-3 flex justify-center">
                <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/20 px-3 py-1 backdrop-blur-sm">
                  <Dice5 className="h-4 w-4 text-amber-300" />
                  <span className="text-sm text-foreground/90">
                    {isMyTurn ? "Your turn" : `${getPlayerUsername(currentPlayer)}'s turn`}
                  </span>
                  {isMyTurn ? (
                    <Badge variant="secondary" className="text-xs">
                      Rolls: {localHand.rollsRemaining}
                    </Badge>
                  ) : horsesState?.playerStates?.[currentTurnPlayerId || ""] ? (
                    <Badge variant="secondary" className="text-xs">
                      Rolls: {horsesState.playerStates[currentTurnPlayerId || ""].rollsRemaining}
                    </Badge>
                  ) : null}
                </div>
              </div>
            )}
          </header>

          {/* Table (fixed area) */}
          <main className="px-3 pb-3 overflow-hidden" aria-label="Horses game table">
            <div className="flex h-full flex-col">
              {/* Other players row (scrolls sideways, never pushes layout) */}
              <section className="flex gap-3 overflow-x-auto pb-2" aria-label="Players">
                {mobileSeatPlayers.map((player) => {
                  const playerState = horsesState?.playerStates?.[player.id];
                  const isWinner = winningPlayerIds.includes(player.id);
                  const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
                  const hasCompleted = playerState?.isComplete || false;
                  const isMe = player.user_id === currentUserId;

                  return (
                    <div key={player.id} className="shrink-0">
                      <HorsesPlayerArea
                        username={getPlayerUsername(player)}
                        position={player.position}
                        isCurrentTurn={isCurrent}
                        isCurrentUser={isMe}
                        handResult={playerState?.result || null}
                        isWinningHand={isWinner && gamePhase === "complete"}
                        hasTurnCompleted={hasCompleted}
                        diceValues={hasCompleted ? playerState?.dice : undefined}
                        myStatus={isMe ? getMyStatus() : undefined}
                      />
                    </div>
                  );
                })}
              </section>

              {/* Felt (rolls happen here) */}
              <section className="flex-1 flex items-center justify-center" aria-label="Felt">
                <div className="w-full max-w-[560px] rounded-[32px] border border-border/40 bg-background/10 p-4 backdrop-blur-sm shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex gap-2">
                      {(() => {
                        // Waiting / no current player yet
                        if (gamePhase !== "playing" || !currentPlayer) {
                          return Array.from({ length: 5 }).map((_, idx) => (
                            <HorsesDie
                              key={idx}
                              value={0}
                              isHeld={false}
                              isRolling={false}
                              canToggle={false}
                              onToggle={() => {}}
                              size="md"
                            />
                          ));
                        }

                        // My turn
                        if (isMyTurn) {
                          return localHand.dice.map((die, idx) => (
                            <HorsesDie
                              key={idx}
                              value={die.value}
                              isHeld={die.isHeld}
                              isRolling={isRolling && !die.isHeld}
                              canToggle={localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0}
                              onToggle={() => handleToggleHold(idx)}
                              size="md"
                            />
                          ));
                        }

                        // Someone else's turn
                        const diceState = getCurrentTurnDice();
                        if (!diceState) return null;

                        return diceState.dice.map((die, idx) => (
                          <HorsesDie
                            key={idx}
                            value={die.value}
                            isHeld={die.isHeld}
                            isRolling={diceState.isRolling}
                            canToggle={false}
                            onToggle={() => {}}
                            size="md"
                          />
                        ));
                      })()}
                    </div>

                    {isMyTurn && localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
                      <p className="text-xs text-amber-200/70">Tap dice to hold</p>
                    )}

                    {gamePhase === "complete" && (
                      <div className="mt-1 text-center p-4 bg-amber-900/50 rounded-xl border-2 border-amber-600 w-full">
                        <h3 className="text-xl font-bold text-poker-gold mb-1">Round Complete!</h3>
                        {winningPlayerIds.length > 1 ? (
                          <p className="text-amber-200">It's a tie! Re-ante to continue...</p>
                        ) : (
                          <p className="text-amber-200">
                            {(() => {
                              const winner = completedResults.find((r) => r.playerId === winningPlayerIds[0]);
                              const winnerPlayer = players.find((p) => p.id === winningPlayerIds[0]);
                              return winner && winnerPlayer
                                ? `${getPlayerUsername(winnerPlayer)} wins with ${winner.result.description}!`
                                : "Winner determined!";
                            })()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </main>

          {/* Active Player (fixed section) */}
          <section className="px-3 pb-2" aria-label="Active player">
            <div className="flex justify-center">
              {currentPlayer ? (
                (() => {
                  const playerState = horsesState?.playerStates?.[currentPlayer.id];
                  const isWinner = winningPlayerIds.includes(currentPlayer.id);
                  const hasCompleted = playerState?.isComplete || false;
                  const isMe = currentPlayer.user_id === currentUserId;

                  return (
                    <HorsesPlayerArea
                      username={getPlayerUsername(currentPlayer)}
                      position={currentPlayer.position}
                      isCurrentTurn={gamePhase === "playing"}
                      isCurrentUser={isMe}
                      handResult={playerState?.result || null}
                      isWinningHand={isWinner && gamePhase === "complete"}
                      hasTurnCompleted={hasCompleted}
                      diceValues={hasCompleted ? playerState?.dice : undefined}
                      myStatus={isMe ? getMyStatus() : undefined}
                    />
                  );
                })()
              ) : (
                <div className="rounded-lg border border-border/50 bg-background/15 px-4 py-3 text-sm text-muted-foreground">
                  Waiting for the next turn...
                </div>
              )}
            </div>
          </section>

          {/* Actions (fixed bottom bar) */}
          <footer
            className="px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            aria-label="Actions"
          >
            {isMyTurn && gamePhase === "playing" ? (
              <div className="mx-auto w-fit flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-2 backdrop-blur-sm">
                <Button
                  onClick={handleRoll}
                  disabled={localHand.rollsRemaining <= 0 || isRolling}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Roll{localHand.rollsRemaining === 3 ? "" : " Again"}
                </Button>

                {localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
                  <Button
                    onClick={handleLockIn}
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-400 hover:bg-amber-500/20"
                  >
                    <Lock className="w-4 h-4 mr-1" />
                    Lock In
                  </Button>
                )}
              </div>
            ) : (
              <div className="h-2" />
            )}
          </footer>
        </div>
      ) : (
        <>
          {/* Header - Horses + Ante */}
          <header className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <h1 className="text-xl font-bold text-poker-gold">Horses</h1>
            <p className="text-sm text-amber-200/80">Ante: ${anteAmount}</p>
          </header>

          {/* Pot display */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-600/50">
              <span className="text-amber-200 text-sm">Pot:</span>
              <span className="text-lg font-bold text-poker-gold">${pot}</span>
            </div>
          </div>

          {/* Turn status (kept out of the felt center to avoid a "modal" feel) */}
          {gamePhase === "playing" && currentPlayer && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/20 px-3 py-1 backdrop-blur-sm">
                <Dice5 className="h-4 w-4 text-amber-300" />
                <span className="text-sm text-foreground/90">
                  {isMyTurn ? "Your turn" : `${getPlayerUsername(currentPlayer)}'s turn`}
                </span>
                {isMyTurn ? (
                  <Badge variant="secondary" className="text-xs">
                    Rolls: {localHand.rollsRemaining}
                  </Badge>
                ) : horsesState?.playerStates?.[currentTurnPlayerId || ""] ? (
                  <Badge variant="secondary" className="text-xs">
                    Rolls: {horsesState.playerStates[currentTurnPlayerId || ""].rollsRemaining}
                  </Badge>
                ) : null}
              </div>
            </div>
          )}

          <main
            className={cn("absolute inset-0 pt-32", isMobile ? "px-3 pb-24" : "p-4")}
            aria-label="Horses dice table"
          >
            <div className="relative w-full h-full">
              {/* Position players around the table */}
              {activePlayers.map((player, idx) => {
                const playerState = horsesState?.playerStates?.[player.id];
                const isWinner = winningPlayerIds.includes(player.id);
                const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
                const hasCompleted = playerState?.isComplete || false;
                const isMe = player.user_id === currentUserId;

                // Calculate position around the table (desktop ring)
                const totalPlayers = activePlayers.length;
                const angle = (idx / totalPlayers) * 2 * Math.PI - Math.PI / 2;
                const centerX = 50;
                const centerY = 48;
                const radiusX = 40;
                const radiusY = 28;
                const x = centerX + radiusX * Math.cos(angle);
                const y = centerY + radiusY * Math.sin(angle);

                return (
                  <div
                    key={player.id}
                    className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <HorsesPlayerArea
                      username={getPlayerUsername(player)}
                      position={player.position}
                      isCurrentTurn={isCurrent}
                      isCurrentUser={isMe}
                      handResult={playerState?.result || null}
                      isWinningHand={isWinner && gamePhase === "complete"}
                      hasTurnCompleted={hasCompleted}
                      diceValues={hasCompleted ? playerState?.dice : undefined}
                      myStatus={isMe ? getMyStatus() : undefined}
                    />
                  </div>
                );
              })}

              {/* Dice on the felt center */}
              {gamePhase === "playing" && currentPlayer && !isMyTurn && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
                  {(() => {
                    const diceState = getCurrentTurnDice();
                    if (!diceState) return null;

                    return (
                      <div className="flex gap-2">
                        {diceState.dice.map((die, idx) => (
                          <HorsesDie
                            key={idx}
                            value={die.value}
                            isHeld={die.isHeld}
                            isRolling={diceState.isRolling}
                            canToggle={false}
                            onToggle={() => {}}
                            size="md"
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* My turn - dice on felt center */}
              {isMyTurn && gamePhase === "playing" && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
                  <div className="flex gap-2">
                    {localHand.dice.map((die, idx) => (
                      <HorsesDie
                        key={idx}
                        value={die.value}
                        isHeld={die.isHeld}
                        isRolling={isRolling && !die.isHeld}
                        canToggle={localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0}
                        onToggle={() => handleToggleHold(idx)}
                        size="md"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Game complete message */}
              {gamePhase === "complete" && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="text-center p-6 bg-amber-900/50 rounded-xl border-2 border-amber-600 backdrop-blur-sm">
                    <h3 className="text-2xl font-bold text-poker-gold mb-2">Round Complete!</h3>
                    {winningPlayerIds.length > 1 ? (
                      <p className="text-amber-200">It's a tie! Re-ante to continue...</p>
                    ) : (
                      <p className="text-amber-200">
                        {(() => {
                          const winner = completedResults.find((r) => r.playerId === winningPlayerIds[0]);
                          const winnerPlayer = players.find((p) => p.id === winningPlayerIds[0]);
                          return winner && winnerPlayer
                            ? `${getPlayerUsername(winnerPlayer)} wins with ${winner.result.description}!`
                            : "Winner determined!";
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Bottom action bar for my turn (fixed) */}
          {isMyTurn && gamePhase === "playing" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30">
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-2 backdrop-blur-sm">
                <Button
                  onClick={handleRoll}
                  disabled={localHand.rollsRemaining <= 0 || isRolling}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Roll{localHand.rollsRemaining === 3 ? "" : " Again"}
                </Button>

                {localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
                  <Button
                    onClick={handleLockIn}
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-400 hover:bg-amber-500/20"
                  >
                    <Lock className="w-4 h-4 mr-1" />
                    Lock In
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
