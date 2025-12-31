import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { cn, formatChipValue } from "@/lib/utils";
import { Lock, RotateCcw } from "lucide-react";
import { HorsesPlayerForController } from "@/hooks/useHorsesMobileController";
import { useHorsesMobileController } from "@/hooks/useHorsesMobileController";

export function HorsesMobileCardsTab({
  currentUserPlayer,
  horses,
}: {
  currentUserPlayer: HorsesPlayerForController;
  horses: ReturnType<typeof useHorsesMobileController>;
}) {
  const isWaitingForYourTurn = horses.gamePhase === "playing" && !horses.isMyTurn;
  const hasCompleted = !!horses.myState?.isComplete;
  const myResult = horses.myState?.result ?? null;
  
  // Show dice when it's my turn and I've rolled at least once
  const showMyDice = horses.isMyTurn && horses.gamePhase === "playing" && horses.localHand.rollsRemaining < 3;

  return (
    <div className="px-2 flex flex-col flex-1">
      {/* Dice display when rolling */}
      {showMyDice && (
        <div className="flex items-center justify-center gap-1.5 mb-2">
          {horses.localHand.dice.map((die, idx) => (
            <HorsesDie
              key={idx}
              value={die.value}
              isHeld={die.isHeld}
              isRolling={horses.isRolling && !die.isHeld}
              canToggle={horses.localHand.rollsRemaining > 0 && horses.localHand.rollsRemaining < 3}
              onToggle={() => horses.handleToggleHold(idx)}
              size="sm"
            />
          ))}
        </div>
      )}
      
      {/* Action area (fixed height) */}
      <div className="flex items-center justify-center min-h-[36px]">
        {horses.gamePhase === "playing" && horses.isMyTurn ? (
          <div className="flex gap-2 justify-center">
            <Button
              size="default"
              onClick={horses.handleRoll}
              disabled={horses.localHand.rollsRemaining <= 0 || horses.isRolling}
              className="flex-1 max-w-[170px] text-sm font-bold h-9"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Roll{horses.localHand.rollsRemaining === 3 ? "" : " Again"}
            </Button>

            {horses.localHand.rollsRemaining < 3 && horses.localHand.rollsRemaining > 0 && (
              <Button
                variant="outline"
                size="default"
                onClick={horses.handleLockIn}
                className="flex-1 max-w-[140px] text-sm font-bold h-9"
              >
                <Lock className="w-4 h-4 mr-2" />
                Lock In
              </Button>
            )}
          </div>
        ) : horses.gamePhase === "complete" && hasCompleted ? (
          <Badge className="text-sm px-3 py-0.5 border-transparent bg-primary/20 text-foreground">
            ✓ Locked: {myResult?.description ?? "Complete"}
          </Badge>
        ) : isWaitingForYourTurn ? (
          <Badge className="text-sm px-3 py-0.5 border-transparent bg-secondary/30 text-foreground">
            Waiting — {horses.currentTurnPlayerName ? `${horses.currentTurnPlayerName}'s turn` : "Next turn"}
          </Badge>
        ) : (
          <Badge className="text-sm px-3 py-0.5 border-transparent bg-secondary/30 text-foreground">
            Ready
          </Badge>
        )}
      </div>

      {/* Small helper text */}
      <div className="mt-2 flex items-center justify-center">
        {horses.isMyTurn && horses.localHand.rollsRemaining < 3 && horses.localHand.rollsRemaining > 0 ? (
          <p className="text-xs text-muted-foreground">Tap dice to hold/unhold</p>
        ) : (
          <div className="h-4" />
        )}
      </div>

      {/* Player info (bottom) */}
      <div className={cn("flex flex-col gap-1 mt-3 pb-2")}
      >
        <div className="flex items-center justify-center gap-3">
          <p className="text-sm font-semibold text-foreground">{currentUserPlayer.profiles?.username || "You"}</p>
          <span className="text-lg font-bold text-poker-gold">
            ${formatChipValue(Math.round(currentUserPlayer.chips))}
          </span>
          {horses.isMyTurn && horses.gamePhase === "playing" && (
            <Badge variant="outline" className="text-xs">
              Rolls: {horses.localHand.rollsRemaining}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
