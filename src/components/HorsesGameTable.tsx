import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { HorsesPlayerArea } from "./HorsesPlayerArea";
import {
  HorsesHand,
  HorsesHandResult,
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
  onGameEnd: (winnerId: string | null, isTie: boolean) => void;
}

interface PlayerTurnResult {
  playerId: string;
  hand: HorsesHand;
  result: HorsesHandResult;
}

export function HorsesGameTable({
  gameId,
  players,
  currentUserId,
  pot,
  anteAmount,
  dealerPosition,
  onGameEnd,
}: HorsesGameTableProps) {
  // Game state
  const [turnResults, setTurnResults] = useState<Map<string, PlayerTurnResult>>(new Map());
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [myHand, setMyHand] = useState<HorsesHand>(createInitialHand());
  const [isRolling, setIsRolling] = useState(false);
  const [gamePhase, setGamePhase] = useState<"playing" | "complete">("playing");
  
  // Get active players sorted by position (clockwise from dealer's left)
  const activePlayers = players
    .filter(p => !p.sitting_out)
    .sort((a, b) => {
      // Sort by distance from dealer position (clockwise)
      const aDistance = (a.position - dealerPosition + players.length) % players.length;
      const bDistance = (b.position - dealerPosition + players.length) % players.length;
      return aDistance - bDistance;
    })
    // Skip the dealer (position 0 in sorted list) - start from position 1
    .slice(1)
    .concat(players.filter(p => !p.sitting_out && p.position === dealerPosition));

  const currentPlayer = activePlayers[currentTurnIndex];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const currentUserPlayer = players.find(p => p.user_id === currentUserId);

  // Calculate winning hand(s)
  const allResults = Array.from(turnResults.values());
  const winningIndices = allResults.length > 0 
    ? determineWinners(allResults.map(r => r.result))
    : [];
  const winningPlayerIds = winningIndices.map(i => allResults[i].playerId);

  // Handle roll dice
  const handleRoll = useCallback(() => {
    if (!isMyTurn || myHand.isComplete || myHand.rollsRemaining <= 0) return;
    
    setIsRolling(true);
    
    // Animate for a moment then show result
    setTimeout(() => {
      const newHand = rollDice(myHand);
      setMyHand(newHand);
      setIsRolling(false);
      
      // If hand is complete after this roll, record result
      if (newHand.isComplete) {
        recordMyResult(newHand);
      }
    }, 500);
  }, [isMyTurn, myHand]);

  // Handle toggle hold
  const handleToggleHold = useCallback((index: number) => {
    if (!isMyTurn || myHand.isComplete || myHand.rollsRemaining === 3) return;
    setMyHand(prev => toggleHold(prev, index));
  }, [isMyTurn, myHand.isComplete, myHand.rollsRemaining]);

  // Handle lock in (end turn early)
  const handleLockIn = useCallback(() => {
    if (!isMyTurn || myHand.rollsRemaining === 3 || myHand.isComplete) return;
    
    const lockedHand = lockInHand(myHand);
    setMyHand(lockedHand);
    recordMyResult(lockedHand);
  }, [isMyTurn, myHand]);

  // Record result and advance turn
  const recordMyResult = useCallback((hand: HorsesHand) => {
    if (!currentPlayer) return;
    
    const result = evaluateHand(hand.dice);
    const turnResult: PlayerTurnResult = {
      playerId: currentPlayer.id,
      hand,
      result,
    };
    
    setTurnResults(prev => new Map(prev).set(currentPlayer.id, turnResult));
    
    // Advance to next turn
    setTimeout(() => {
      advanceToNextTurn();
    }, 1000);
  }, [currentPlayer]);

  // Advance to next player's turn
  const advanceToNextTurn = useCallback(() => {
    const nextIndex = currentTurnIndex + 1;
    
    if (nextIndex >= activePlayers.length) {
      // All players done - determine winner
      setGamePhase("complete");
      handleGameComplete();
    } else {
      setCurrentTurnIndex(nextIndex);
      setMyHand(createInitialHand()); // Reset hand for potentially new turn
    }
  }, [currentTurnIndex, activePlayers.length]);

  // Handle game completion
  const handleGameComplete = useCallback(async () => {
    const results = Array.from(turnResults.values());
    if (results.length === 0) return;
    
    const winnerIndices = determineWinners(results.map(r => r.result));
    
    if (winnerIndices.length > 1) {
      // Tie - trigger re-ante
      toast.info("It's a tie! Everyone re-antes.");
      onGameEnd(null, true);
    } else if (winnerIndices.length === 1) {
      // Single winner
      const winner = results[winnerIndices[0]];
      const winnerPlayer = players.find(p => p.id === winner.playerId);
      const winnerName = winnerPlayer?.profiles?.username || "Unknown";
      
      toast.success(`${winnerName} wins with ${winner.result.description}!`);
      onGameEnd(winner.playerId, false);
    }
  }, [turnResults, players, onGameEnd]);

  // Bot auto-play
  useEffect(() => {
    if (!currentPlayer?.is_bot || gamePhase !== "playing") return;
    
    // Simulate bot thinking and rolling
    const botPlay = async () => {
      let botHand = createInitialHand();
      
      // Roll up to 3 times with some strategy
      for (let roll = 0; roll < 3; roll++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        botHand = rollDice(botHand);
        
        // Simple strategy: lock in if we have 4 or 5 of a kind
        const result = evaluateHand(botHand.dice);
        if (result.ofAKindCount >= 4) {
          break;
        }
        
        // Hold dice that match the most common value (excluding 1s which are wild)
        if (roll < 2) {
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
      
      // Record result
      const result = evaluateHand(botHand.dice);
      setTurnResults(prev => new Map(prev).set(currentPlayer.id, {
        playerId: currentPlayer.id,
        hand: botHand,
        result,
      }));
      
      // Advance turn
      setTimeout(() => advanceToNextTurn(), 500);
    };
    
    botPlay();
  }, [currentPlayer, gamePhase]);

  // Get username for player
  const getPlayerUsername = (player: Player) => {
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
        {activePlayers.map((player, idx) => {
          const result = turnResults.get(player.id);
          const isWinner = winningPlayerIds.includes(player.id);
          const isCurrent = idx === currentTurnIndex && gamePhase === "playing";
          const hasCompleted = !!result;
          
          return (
            <HorsesPlayerArea
              key={player.id}
              username={getPlayerUsername(player)}
              position={player.position}
              isCurrentTurn={isCurrent}
              isCurrentUser={player.user_id === currentUserId}
              handResult={result?.result || null}
              isWinningHand={isWinner && gamePhase === "complete"}
              hasTurnCompleted={hasCompleted}
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
                : "bg-gray-700/50 border-gray-500 text-gray-300"
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
              Rolls remaining: <span className="font-bold">{myHand.rollsRemaining}</span>
            </span>
          </div>

          {/* Dice */}
          <div className="flex gap-3">
            {myHand.dice.map((die, idx) => (
              <HorsesDie
                key={idx}
                value={die.value}
                isHeld={die.isHeld}
                isRolling={isRolling && !die.isHeld}
                canToggle={myHand.rollsRemaining < 3 && myHand.rollsRemaining > 0}
                onToggle={() => handleToggleHold(idx)}
                size="lg"
              />
            ))}
          </div>

          {/* Instructions */}
          {myHand.rollsRemaining < 3 && myHand.rollsRemaining > 0 && (
            <p className="text-sm text-amber-200/70">
              Click dice to hold/unhold them
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleRoll}
              disabled={myHand.rollsRemaining <= 0 || isRolling}
              className="bg-green-600 hover:bg-green-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Roll {myHand.rollsRemaining === 3 ? "" : "Again"}
            </Button>
            
            {myHand.rollsRemaining < 3 && myHand.rollsRemaining > 0 && (
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

      {/* Game complete message */}
      {gamePhase === "complete" && (
        <div className="text-center p-6 bg-amber-900/30 rounded-xl border-2 border-amber-600">
          <h3 className="text-2xl font-bold text-poker-gold mb-2">Round Complete!</h3>
          {winningPlayerIds.length > 1 ? (
            <p className="text-amber-200">It's a tie! Re-ante to continue...</p>
          ) : (
            <p className="text-amber-200">
              {(() => {
                const winner = allResults.find(r => r.playerId === winningPlayerIds[0]);
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
