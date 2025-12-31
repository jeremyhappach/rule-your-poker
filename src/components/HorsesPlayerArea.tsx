import { Badge } from "@/components/ui/badge";
import { HorsesHandResult, HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { HorsesDie } from "./HorsesDie";
import { cn } from "@/lib/utils";
import { Dice5 } from "lucide-react";

interface HorsesPlayerAreaProps {
  username: string;
  position: number;
  isCurrentTurn: boolean;
  isCurrentUser: boolean;
  handResult: HorsesHandResult | null;
  isWinningHand: boolean;
  hasTurnCompleted: boolean;
  diceValues?: HorsesDieType[];
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
}: HorsesPlayerAreaProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 min-w-[160px]",
        isCurrentTurn && "border-yellow-500 bg-yellow-500/10",
        isWinningHand && "border-green-500 bg-green-500/10 animate-pulse",
        !isCurrentTurn && !isWinningHand && "border-border bg-muted/50",
        isCurrentUser && "ring-2 ring-blue-500 ring-offset-2 ring-offset-background"
      )}
    >
      {/* Bouncing dice for current turn */}
      {isCurrentTurn && !hasTurnCompleted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Dice5 className="w-6 h-6 text-yellow-400 animate-bounce" />
        </div>
      )}

      {/* Username */}
      <span className="font-semibold text-foreground">{username}</span>
      <span className="text-xs text-muted-foreground">Seat {position}</span>

      {/* Show completed dice */}
      {hasTurnCompleted && diceValues && (
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

      {/* Hand result or waiting indicator */}
      <div className="min-h-[24px] flex items-center">
        {hasTurnCompleted && handResult ? (
          <Badge
            variant={isWinningHand ? "default" : "secondary"}
            className={cn(
              isWinningHand && "bg-green-600 text-white animate-pulse"
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
    </div>
  );
}