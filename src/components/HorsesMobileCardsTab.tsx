import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HorsesDie } from "./HorsesDie";
import { DiceDebugOverlay } from "./DiceDebugOverlay";
import { cn, formatChipValue } from "@/lib/utils";
import { Lock, RotateCcw, Bug } from "lucide-react";
import { HorsesPlayerForController } from "@/hooks/useHorsesMobileController";
import { useHorsesMobileController } from "@/hooks/useHorsesMobileController";

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
  const [debugOpen, setDebugOpen] = useState(false);

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
      {/* Debug overlay toggle + panel (DEV only) */}
      {import.meta.env.DEV && (
        <>
          <button
            type="button"
            className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground backdrop-blur"
            onClick={() => setDebugOpen((v) => !v)}
            title="Toggle dice debug"
          >
            <Bug className="h-4 w-4" />
          </button>
          <DiceDebugOverlay
            open={debugOpen}
            onOpenChange={setDebugOpen}
            events={horses.debugEvents}
            onClear={horses.clearDebugEvents}
            title="Dice Debug (mobile)"
          />
        </>
      )}

      {/* Action buttons (always above dice, centered) */}
      <div className="flex items-center justify-center min-h-[36px] mb-3">
        {horses.gamePhase === "playing" && horses.isMyTurn ? (
          <div className="flex gap-2 justify-center items-center">
            <Button
              size="default"
              onClick={horses.handleRoll}
              disabled={horses.localHand.rollsRemaining <= 0 || horses.isRolling}
              className="text-sm font-bold h-9 px-6"
            >
              <RotateCcw className="w-4 h-4 mr-2 animate-slow-pulse-red" />
              Roll{horses.localHand.rollsRemaining === 3 ? "" : " Again"}
            </Button>

            {horses.localHand.rollsRemaining < 3 && horses.localHand.rollsRemaining > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={horses.handleLockIn}
                className="h-9 w-9"
                title="Lock In"
              >
                <Lock className="w-4 h-4" />
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

      {/* Dice display when rolling - horizontal line layout (below buttons) */}
      {showMyDice && (
        <div className="flex items-center justify-center gap-1 mb-3">
          {horses.localHand.dice.map((die, idx) => {
            // On roll 3 (rollsRemaining=0), all dice are "locked in" so none should show held styling
            // But for animation: if the die was held BEFORE this roll, it shouldn't animate
            const showHeldStyling = horses.localHand.rollsRemaining > 0 && die.isHeld;
            // For animation: dice that were NOT held before this roll should animate
            // On final roll (rollsRemaining=0), we still want unheld dice to animate
            const shouldAnimate = horses.isRolling && !die.isHeld;
            
            return (
              <HorsesDie
                key={idx}
                value={die.value}
                isHeld={showHeldStyling}
                isRolling={shouldAnimate}
                canToggle={!isSCC && !horses.isRolling && horses.localHand.rollsRemaining > 0 && horses.localHand.rollsRemaining < 3}
                onToggle={() => horses.handleToggleHold(idx)}
                size="lg"
                showWildHighlight={!isSCC}
              />
            );
          })}
        </div>
      )}

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
