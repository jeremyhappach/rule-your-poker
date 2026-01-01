import { Badge } from "@/components/ui/badge";
import { HorsesHandResult, HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { SCCHandResult, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie } from "./HorsesDie";
import { cn } from "@/lib/utils";
import { Dice5 } from "lucide-react";

// Union type for dice and hand results to support both Horses and SCC games
type DiceGameHandResult = HorsesHandResult | SCCHandResult;
type DiceGameDieType = HorsesDieType | SCCDieType;

interface HorsesPlayerAreaProps {
  username: string;
  position: number;
  isCurrentTurn: boolean;
  isCurrentUser: boolean;
  handResult: DiceGameHandResult | null;
  isWinningHand: boolean;
  hasTurnCompleted: boolean;
  diceValues?: DiceGameDieType[];
  myStatus?: 'waiting' | 'rolling' | 'done';
}

export function HorsesPlayerArea({
  username,
  position,
  isCurrentTurn,
  isCurrentUser,
  handResult,
  isWinningHand,
  hasTurnCompleted,
  diceValues,
  myStatus,
}: HorsesPlayerAreaProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 min-w-[140px]",
        isCurrentTurn && "border-yellow-500 bg-yellow-500/10",
        isWinningHand && "border-green-500 bg-green-500/20",
        !isCurrentTurn && !isWinningHand && "border-border/50 bg-black/30",
        isCurrentUser && "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent"
      )}
    >
      {/* Bouncing dice icon for current turn */}
      {isCurrentTurn && !hasTurnCompleted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Dice5 className="w-5 h-5 text-yellow-400 animate-bounce" />
        </div>
      )}

      {/* Username */}
      <span className="font-semibold text-foreground text-sm">{username}</span>
      <span className="text-xs text-muted-foreground">Seat {position}</span>

      {/* For current user: show status-based content */}
      {isCurrentUser && myStatus && (
        <div className="min-h-[50px] flex flex-col items-center justify-center gap-1">
          {myStatus === 'waiting' && !hasTurnCompleted && (
            <span className="text-sm text-muted-foreground italic">Waiting to roll...</span>
          )}
          {myStatus === 'rolling' && (
            <div className="flex items-center gap-1">
              <Dice5 className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-yellow-400">Your turn!</span>
            </div>
          )}
          {myStatus === 'done' && handResult && (
            <>
              {diceValues && (
                <div className="flex gap-1">
                  {diceValues.map((die, idx) => (
                    <HorsesDie
                      key={idx}
                      value={die.value}
                      isHeld={false}
                      isRolling={false}
                      canToggle={false}
                      onToggle={() => {}}
                      size="sm"
                    />
                  ))}
                </div>
              )}
              <Badge
                variant={isWinningHand ? "default" : "secondary"}
                className={cn(
                  "mt-1",
                  isWinningHand && "bg-green-600 text-white"
                )}
              >
                {handResult.description}
              </Badge>
            </>
          )}
        </div>
      )}

      {/* For other players: show completed dice */}
      {!isCurrentUser && hasTurnCompleted && diceValues && (
        <div className="flex gap-1">
          {diceValues.map((die, idx) => (
            <HorsesDie
              key={idx}
              value={die.value}
              isHeld={false}
              isRolling={false}
              canToggle={false}
              onToggle={() => {}}
              size="sm"
            />
          ))}
        </div>
      )}

      {/* Hand result or status for other players */}
      {!isCurrentUser && (
        <div className="min-h-[24px] flex items-center">
          {hasTurnCompleted && handResult ? (
            <Badge
              variant={isWinningHand ? "default" : "secondary"}
              className={cn(
                isWinningHand && "bg-green-600 text-white"
              )}
            >
              {handResult.description}
            </Badge>
          ) : isCurrentTurn ? (
            <span className="text-sm text-yellow-400">Rolling...</span>
          ) : (
            <span className="text-sm text-muted-foreground">Waiting</span>
          )}
        </div>
      )}
    </div>
  );
}
