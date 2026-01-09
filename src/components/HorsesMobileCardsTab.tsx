import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HorsesDie } from "./HorsesDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { HorsesHandResultDisplay } from "./HorsesHandResultDisplay";
import { cn, formatChipValue } from "@/lib/utils";
import { Lock, RotateCcw, Target } from "lucide-react";
import { HorsesPlayerForController } from "@/hooks/useHorsesMobileController";
import { useHorsesMobileController } from "@/hooks/useHorsesMobileController";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";

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

  // Show "rolling against" when it's my turn and there's already a winning hand to beat
  const showRollingAgainst = horses.isMyTurn && horses.gamePhase === "playing" && horses.currentWinningResult;

  const isSCC = gameType === 'ship-captain-crew';

  return (
    <div className="px-2 flex flex-col flex-1 relative">
      {/* "Rolling against" indicator - show current best hand to beat */}
      {showRollingAgainst && gameType === 'horses' && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <Target className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Beat:</span>
          <HorsesHandResultDisplay 
            description={horses.currentWinningResult!.description} 
            isWinning={true}
            size="sm"
          />
        </div>
      )}

      {/* Dice display when rolling - staggered layout */}
      {showMyDice && (
        <div className="flex items-center justify-center mb-3">
          <DiceTableLayout
            dice={horses.localHand.dice.map((die, i) => ({
              ...die,
              isHeld: horses.localHand.rollsRemaining > 0 && die.isHeld,
            })) as (HorsesDieType | SCCDieType)[]}
            isRolling={horses.isRolling}
            canToggle={!isSCC && horses.localHand.rollsRemaining > 0 && horses.localHand.rollsRemaining < 3}
            onToggleHold={horses.handleToggleHold}
            size="lg"
            gameType={gameType ?? undefined}
            showWildHighlight={!isSCC}
            useSCCDisplayOrder={isSCC}
            sccHand={isSCC ? horses.localHand as SCCHand : undefined}
          />
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
              <RotateCcw className="w-4 h-4 mr-2 animate-slow-pulse-red" />
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
          <span className={cn(
            "text-lg font-bold",
            currentUserPlayer.chips < 0 ? "text-destructive" : "text-poker-gold"
          )}>
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
