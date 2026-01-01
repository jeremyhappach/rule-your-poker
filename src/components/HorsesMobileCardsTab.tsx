import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HorsesDie } from "./HorsesDie";
import { MobilePlayerTimer } from "./MobilePlayerTimer";
import { cn, formatChipValue } from "@/lib/utils";
import { Lock, RotateCcw, Clock } from "lucide-react";
import { HorsesPlayerForController } from "@/hooks/useHorsesMobileController";
import { useHorsesMobileController } from "@/hooks/useHorsesMobileController";
import { getSCCDisplayOrder, SCCHand } from "@/lib/sccGameLogic";

interface HorsesMobileCardsTabProps {
  currentUserPlayer: HorsesPlayerForController & { auto_fold?: boolean };
  horses: ReturnType<typeof useHorsesMobileController>;
  onAutoFoldChange?: (autoFold: boolean) => void;
  gameType?: string | null;
}

export function HorsesMobileCardsTab({
  currentUserPlayer,
  horses,
  onAutoFoldChange,
  gameType,
}: HorsesMobileCardsTabProps) {
  const isWaitingForYourTurn = horses.gamePhase === "playing" && !horses.isMyTurn;
  const hasCompleted = !!horses.myState?.isComplete;
  const myResult = horses.myState?.result ?? null;
  
  // Show dice when it's my turn and I've rolled at least once
  const showMyDice = horses.isMyTurn && horses.gamePhase === "playing" && horses.localHand.rollsRemaining < 3;

  // Timer display for current turn player
  const showTimer = horses.gamePhase === "playing" && horses.currentTurnPlayerId && !horses.currentTurnPlayer?.is_bot;

  return (
    <div className="px-2 flex flex-col flex-1">
      {/* Timer display when someone's turn is active */}
      {showTimer && horses.timeLeft !== null && (
        <div className="flex items-center justify-center mb-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className={cn(
              "text-sm font-mono font-bold",
              horses.timeLeft <= 5 ? "text-destructive" : 
              horses.timeLeft <= 10 ? "text-amber-500" : 
              "text-foreground"
            )}>
              {horses.timeLeft}s
            </span>
            {!horses.isMyTurn && horses.currentTurnPlayerName && (
              <span className="text-xs text-muted-foreground">
                ({horses.currentTurnPlayerName})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Dice display when rolling - LARGER dice, no helper text */}
      {showMyDice && (
        <div className="flex items-center justify-center gap-2 mb-3">
          {gameType === 'ship-captain-crew' ? (
            // SCC: Use display order to put frozen 6-5-4 on the left with gold highlighting
            getSCCDisplayOrder(horses.localHand as SCCHand).map(({ die, originalIndex }) => (
              <HorsesDie
                key={originalIndex}
                value={die.value}
                isHeld={die.isHeld}
                isRolling={horses.isRolling && !die.isHeld}
                canToggle={false} // SCC dice can't be manually toggled
                onToggle={() => {}}
                size="lg"
                showWildHighlight={false}
                isSCCDie={die.isSCC}
              />
            ))
          ) : (
            // Horses: Regular dice display
            horses.localHand.dice.map((die, idx) => (
              <HorsesDie
                key={idx}
                value={die.value}
                isHeld={die.isHeld}
                isRolling={horses.isRolling && !die.isHeld}
                canToggle={horses.localHand.rollsRemaining > 0 && horses.localHand.rollsRemaining < 3}
                onToggle={() => horses.handleToggleHold(idx)}
                size="lg"
                showWildHighlight={true}
              />
            ))
          )}
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

      {/* Auto-fold checkbox for reconnection */}
      {currentUserPlayer.auto_fold && (
        <div className="flex items-center justify-center mt-2">
          <label className="flex items-center gap-2 text-xs text-amber-500 cursor-pointer">
            <Checkbox
              checked={!currentUserPlayer.auto_fold}
              onCheckedChange={(checked) => onAutoFoldChange?.(!checked)}
              className="h-4 w-4"
            />
            <span>You're sitting out (uncheck to rejoin)</span>
          </label>
        </div>
      )}

      {/* Player info (bottom) - moved down with more spacing */}
      <div className={cn("flex flex-col gap-1 mt-auto pt-3 pb-2")}
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
