import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HorsesDie } from "./HorsesDie";
import { DiceDebugOverlay } from "./DiceDebugOverlay";
import { cn, formatChipValue } from "@/lib/utils";
import { Lock, RotateCcw, Bug } from "lucide-react";
import { HorsesPlayerForController } from "@/hooks/useHorsesMobileController";
import { useHorsesMobileController } from "@/hooks/useHorsesMobileController";

// Active-player dice roll mask durations (matches useHorsesMobileController constants)
const ACTIVE_FIRST_ROLL_MS = 1300;   // Roll 1: ~1.3s
const ACTIVE_ROLL_AGAIN_MS = 1800;   // Rolls 2/3: ~1.8s

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

  // UI-owned rolling mask (do NOT rely solely on horses.isRolling; we need this to be
  // consistent even if the controller state rehydrates during roll 3).
  const [uiRolling, setUiRolling] = useState(false);
  const uiRollingTimerRef = useRef<number | null>(null);
  const heldSnapshotRef = useRef<boolean[] | null>(null);

  useEffect(() => {
    return () => {
      if (uiRollingTimerRef.current != null) {
        window.clearTimeout(uiRollingTimerRef.current);
        uiRollingTimerRef.current = null;
      }
    };
  }, []);

  const startUiRollingMask = useCallback(() => {
    const isFirstRoll = horses.localHand.rollsRemaining === 3;
    const duration = isFirstRoll ? ACTIVE_FIRST_ROLL_MS : ACTIVE_ROLL_AGAIN_MS;

    // Snapshot holds at the instant the roll starts so roll-3 doesn't get suppressed
    // if the controller marks everything held when it locks in.
    heldSnapshotRef.current = (horses.localHand.dice as any[]).map((d) => !!d?.isHeld);

    setUiRolling(true);
    if (uiRollingTimerRef.current != null) {
      window.clearTimeout(uiRollingTimerRef.current);
    }
    uiRollingTimerRef.current = window.setTimeout(() => {
      setUiRolling(false);
      heldSnapshotRef.current = null;
      uiRollingTimerRef.current = null;
    }, duration);
  }, [horses.localHand.dice, horses.localHand.rollsRemaining]);

  const handleRollClick = useCallback(() => {
    startUiRollingMask();
    horses.handleRoll();
  }, [horses, startUiRollingMask]);

  const rolling = uiRolling || horses.isRolling;

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
              onClick={handleRollClick}
              disabled={horses.localHand.rollsRemaining <= 0 || rolling}
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
          <Badge className="text-sm px-3 py-0.5 border-transparent bg-primary/20 text-white">
            ✓ Locked: {myResult?.description ?? "Complete"}
          </Badge>
        ) : isWaitingForYourTurn ? (
          <Badge className="text-sm px-3 py-0.5 border-transparent bg-secondary text-white">
            Waiting — {horses.currentTurnPlayerName ? `${horses.currentTurnPlayerName}'s turn` : "Next turn"}
          </Badge>
        ) : (
          <Badge className="text-sm px-3 py-0.5 border-transparent bg-secondary text-white">
            Ready
          </Badge>
        )}
      </div>

      {/* Dice display when rolling - horizontal line layout (below buttons) */}
      {showMyDice && (
        <div className="flex items-center justify-center gap-1 mb-3">
          {horses.localHand.dice.map((die, idx) => {
            // Determine if this die was held at the START of the current roll
            const heldAtRollStart = heldSnapshotRef.current?.[idx] ?? (die as any).isHeld;
            
            // Animate dice that were NOT held at the start of this roll.
            const shouldAnimate = rolling && !heldAtRollStart;

            // For held styling:
            // - Don't show held styling on dice that are currently animating (to allow the roll animation)
            // - On roll 3 (rollsRemaining=0), all dice are "locked in" so none should show held styling
            // - During animation, dice that weren't held at roll start should NOT show held styling
            //   even if they are now held (e.g., SCC auto-held 6/5/4) - this allows the animation to play
            const showHeldStyling = horses.localHand.rollsRemaining > 0 && 
              (die as any).isHeld && 
              !shouldAnimate; // Don't show held styling while animating

            return (
              <HorsesDie
                key={idx}
                value={(die as any).value}
                isHeld={showHeldStyling}
                isRolling={shouldAnimate}
                canToggle={!isSCC && !rolling && horses.localHand.rollsRemaining > 0 && horses.localHand.rollsRemaining < 3}
                onToggle={() => horses.handleToggleHold(idx)}
                size="lg"
                showWildHighlight={!isSCC}
              />
            );
          })}
        </div>
      )}

      {/* Auto-fold checkbox for reconnection - only show during active play, not after completion */}
      {currentUserPlayer.auto_fold && horses.gamePhase === "playing" && !hasCompleted && (
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
