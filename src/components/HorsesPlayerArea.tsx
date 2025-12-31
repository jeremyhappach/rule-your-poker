import { cn } from "@/lib/utils";
import { Dice5 } from "lucide-react";
import { HorsesHandResult } from "@/lib/horsesGameLogic";

interface HorsesPlayerAreaProps {
  username: string;
  position: number;
  isCurrentTurn: boolean;
  isCurrentUser: boolean;
  handResult: HorsesHandResult | null;
  isWinningHand: boolean;
  hasTurnCompleted: boolean;
}

export function HorsesPlayerArea({
  username,
  position,
  isCurrentTurn,
  isCurrentUser,
  handResult,
  isWinningHand,
  hasTurnCompleted,
}: HorsesPlayerAreaProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all duration-300",
        isCurrentUser
          ? "bg-blue-900/30 border-blue-500"
          : "bg-gray-900/30 border-gray-600",
        isCurrentTurn && "ring-2 ring-yellow-400 ring-offset-2 ring-offset-transparent"
      )}
    >
      {/* Username */}
      <span
        className={cn(
          "text-sm font-medium",
          isCurrentUser ? "text-blue-300" : "text-gray-300"
        )}
      >
        {username}
      </span>

      {/* Hand result or rolling indicator */}
      <div className="h-8 flex items-center justify-center">
        {isCurrentTurn && !hasTurnCompleted ? (
          // Bouncing dice icon for current roller
          <Dice5
            className="w-6 h-6 text-yellow-400 animate-bounce"
          />
        ) : handResult ? (
          // Hand result label
          <span
            className={cn(
              "text-lg font-bold px-3 py-1 rounded",
              isWinningHand
                ? "text-green-400 bg-green-900/50 animate-pulse"
                : "text-amber-200 bg-amber-900/30"
            )}
          >
            {handResult.description}
          </span>
        ) : (
          // Waiting state
          <span className="text-gray-500 text-sm">—</span>
        )}
      </div>
    </div>
  );
}
