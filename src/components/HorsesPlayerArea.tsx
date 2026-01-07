import { Badge } from "@/components/ui/badge";
import { HorsesHandResult, HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { SCCHandResult, SCCDie as SCCDieType, getSCCDisplayOrder, SCCHand } from "@/lib/sccGameLogic";
import { HorsesDie } from "./HorsesDie";
import { HorsesHandResultDisplay } from "./HorsesHandResultDisplay";
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
  gameType?: string | null;
  onClick?: () => void;
  isBot?: boolean;
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
  gameType,
  onClick,
  isBot,
}: HorsesPlayerAreaProps) {
  // For Horses: hide username/seat when showing completed hand result to save space
  const showCompactResult = gameType === 'horses' && hasTurnCompleted && handResult;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1 p-2 rounded-lg border-2",
        showCompactResult ? "min-w-[100px]" : "min-w-[140px]",
        isCurrentTurn && "border-yellow-500 bg-yellow-500/10 z-[110]",
        isWinningHand && "border-green-500 bg-green-500/20",
        !isCurrentTurn && !isWinningHand && "border-border/50 bg-black/30",
        isCurrentUser && "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent",
        onClick && "cursor-pointer hover:bg-white/5 transition-colors"
      )}
    >
      {/* Bouncing dice icon for current turn */}
      {isCurrentTurn && !hasTurnCompleted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Dice5 className="w-5 h-5 text-yellow-400 animate-bounce" />
        </div>
      )}

      {/* Username - hide in compact mode */}
      {!showCompactResult && (
        <>
          <span className="font-semibold text-foreground text-sm">{username}</span>
          <span className="text-xs text-muted-foreground">Seat {position}</span>
        </>
      )}

      {/* Compact mode: just show username initial + result */}
      {showCompactResult && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground truncate max-w-[50px]">
            {username}
          </span>
          <HorsesHandResultDisplay 
            description={handResult.description} 
            isWinning={isWinningHand}
          />
        </div>
      )}

      {/* For current user: show status-based content (non-compact) */}
      {!showCompactResult && isCurrentUser && myStatus && (
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
                  {gameType === 'ship-captain-crew' ? (
                    getSCCDisplayOrder({ dice: diceValues as SCCDieType[] } as SCCHand).map(({ die, originalIndex }) => (
                      <HorsesDie
                        key={originalIndex}
                        value={die.value}
                        isHeld={false}
                        isRolling={false}
                        canToggle={false}
                        onToggle={() => {}}
                        size="sm"
                        showWildHighlight={false}
                        isSCCDie={(die as SCCDieType).isSCC}
                      />
                    ))
                  ) : (
                    diceValues.map((die, idx) => (
                      <HorsesDie
                        key={idx}
                        value={die.value}
                        isHeld={false}
                        isRolling={false}
                        canToggle={false}
                        onToggle={() => {}}
                        size="sm"
                        showWildHighlight={true}
                      />
                    ))
                  )}
                </div>
              )}
              <Badge
                variant={isWinningHand ? "default" : "secondary"}
                className={cn(
                  "mt-1 px-2 py-1",
                  isWinningHand && "bg-green-600 text-white"
                )}
              >
                {gameType === 'horses' ? (
                  <HorsesHandResultDisplay 
                    description={handResult.description} 
                    isWinning={isWinningHand}
                  />
                ) : (
                  handResult.description
                )}
              </Badge>
            </>
          )}
        </div>
      )}

      {/* For other players: show completed dice (non-compact, non-Horses) */}
      {!showCompactResult && !isCurrentUser && hasTurnCompleted && diceValues && (
        <div className="flex gap-1">
          {gameType === 'ship-captain-crew' ? (
            getSCCDisplayOrder({ dice: diceValues as SCCDieType[] } as SCCHand).map(({ die, originalIndex }) => (
              <HorsesDie
                key={originalIndex}
                value={die.value}
                isHeld={false}
                isRolling={false}
                canToggle={false}
                onToggle={() => {}}
                size="sm"
                showWildHighlight={false}
                isSCCDie={(die as SCCDieType).isSCC}
              />
            ))
          ) : (
            diceValues.map((die, idx) => (
              <HorsesDie
                key={idx}
                value={die.value}
                isHeld={false}
                isRolling={false}
                canToggle={false}
                onToggle={() => {}}
                size="sm"
                showWildHighlight={true}
              />
            ))
          )}
        </div>
      )}

      {/* Hand result or status for other players (non-compact) */}
      {!showCompactResult && !isCurrentUser && (
        <div className="min-h-[24px] flex items-center">
          {hasTurnCompleted && handResult ? (
            <Badge
              variant={isWinningHand ? "default" : "secondary"}
              className={cn(
                "px-2 py-1",
                isWinningHand && "bg-green-600 text-white"
              )}
            >
              {gameType === 'horses' ? (
                <HorsesHandResultDisplay 
                  description={handResult.description} 
                  isWinning={isWinningHand}
                />
              ) : (
                handResult.description
              )}
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
