import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { HorsesDie } from "./HorsesDie";
import { HorsesHandResultDisplay } from "./HorsesHandResultDisplay";
import { DiceDebugOverlay } from "./DiceDebugOverlay";
import { QuickEmoticonPicker } from "./QuickEmoticonPicker";
import { ValueChangeFlash } from "./ValueChangeFlash";
import { cn, formatChipValue } from "@/lib/utils";
import { Lock, RotateCcw, Bug } from "lucide-react";
import { HorsesPlayerForController } from "@/hooks/useHorsesMobileController";
import { useHorsesMobileController } from "@/hooks/useHorsesMobileController";
import { EmoticonOverlay } from "@/hooks/useChipStackEmoticons";
import { useDeviceSize } from "@/hooks/useDeviceSize";

// Active-player dice roll mask durations (matches useHorsesMobileController constants)
const ACTIVE_FIRST_ROLL_MS = 1300;   // Roll 1: ~1.3s
const ACTIVE_ROLL_AGAIN_MS = 1800;   // Rolls 2/3: ~1.8s

interface HorsesMobileCardsTabProps {
  currentUserPlayer: HorsesPlayerForController & { auto_fold?: boolean; sitting_out?: boolean; waiting?: boolean };
  horses: ReturnType<typeof useHorsesMobileController>;
  onAutoFoldChange?: (autoFold: boolean) => void;
  gameType?: string | null;
  // Emoticon props for consistency with card games
  onEmoticonSelect?: (emoticon: string) => void;
  isEmoticonSending?: boolean;
  emoticonOverlays?: Record<string, EmoticonOverlay>;
  // Flash triggers for win animations
  winnerLegsFlashTrigger?: { playerId: string; id: string; amount: number } | null;
  winnerPotFlashTrigger?: { playerId: string; id: string; amount: number } | null;
}

export function HorsesMobileCardsTab({
  currentUserPlayer,
  horses,
  onAutoFoldChange,
  gameType,
  onEmoticonSelect,
  isEmoticonSending,
  emoticonOverlays,
  winnerLegsFlashTrigger,
  winnerPotFlashTrigger,
}: HorsesMobileCardsTabProps) {
  const [debugOpen, setDebugOpen] = useState(false);
  const { isTablet, isDesktop } = useDeviceSize();
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

  // Haptic feedback interval ref for cleanup
  const hapticIntervalRef = useRef<number | null>(null);

  const triggerRollHaptics = useCallback((durationMs: number) => {
    // Check if vibration API is available
    if (!navigator.vibrate) return;

    // Clear any existing haptic interval
    if (hapticIntervalRef.current != null) {
      window.clearInterval(hapticIntervalRef.current);
    }

    // Initial strong vibration for the "throw"
    navigator.vibrate(50);

    // Create a rumbling pattern during the roll animation
    // Vibrate every 80ms with varying intensity to simulate dice tumbling
    let elapsed = 0;
    const interval = 80;
    hapticIntervalRef.current = window.setInterval(() => {
      elapsed += interval;
      if (elapsed >= durationMs - 100) {
        // Final "landing" vibration
        navigator.vibrate([30, 20, 40]);
        if (hapticIntervalRef.current != null) {
          window.clearInterval(hapticIntervalRef.current);
          hapticIntervalRef.current = null;
        }
        return;
      }
      // Light rumble during roll
      navigator.vibrate(15 + Math.floor(Math.random() * 10));
    }, interval);
  }, []);

  // Clean up haptic interval on unmount
  useEffect(() => {
    return () => {
      if (hapticIntervalRef.current != null) {
        window.clearInterval(hapticIntervalRef.current);
        hapticIntervalRef.current = null;
      }
    };
  }, []);

  const startUiRollingMask = useCallback(() => {
    const isFirstRoll = horses.localHand.rollsRemaining === 3;
    const duration = isFirstRoll ? ACTIVE_FIRST_ROLL_MS : ACTIVE_ROLL_AGAIN_MS;

    // Snapshot holds at the instant the roll starts so roll-3 doesn't get suppressed
    // if the controller marks everything held when it locks in.
    heldSnapshotRef.current = (horses.localHand.dice as any[]).map((d) => !!d?.isHeld);

    // Trigger haptic feedback for the duration of the roll animation
    triggerRollHaptics(duration);

    setUiRolling(true);
    if (uiRollingTimerRef.current != null) {
      window.clearTimeout(uiRollingTimerRef.current);
    }
    uiRollingTimerRef.current = window.setTimeout(() => {
      setUiRolling(false);
      heldSnapshotRef.current = null;
      uiRollingTimerRef.current = null;
    }, duration);
  }, [horses.localHand.dice, horses.localHand.rollsRemaining, triggerRollHaptics]);

  const handleRollClick = useCallback(() => {
    startUiRollingMask();
    horses.handleRoll();
  }, [horses, startUiRollingMask]);

  const rolling = uiRolling || horses.isRolling;

  const isWaitingForYourTurn = horses.gamePhase === "playing" && !horses.isMyTurn;
  const hasCompleted = !!horses.myState?.isComplete;
  const myResult = horses.myState?.result ?? null;

  // Check if we're in a completed turn hold period for the current player
  const isInMyCompletedHold = horses.completedTurnHold && 
    horses.completedTurnHold.playerId === horses.myPlayer?.id &&
    Date.now() < horses.completedTurnHold.expiresAt;
  
  // Get hold dice if in hold period
  const holdDice = isInMyCompletedHold ? horses.completedTurnHold?.dice : null;
  const holdResult = isInMyCompletedHold ? horses.completedTurnHold?.result : null;

  // Show dice when it's my turn and I've rolled at least once, OR during hold period
  const showMyDice = (horses.isMyTurn && horses.gamePhase === "playing" && horses.localHand.rollsRemaining < 3);
  
  // Show completed hold dice (after locking in, before transitioning to badge)
  const showHoldDice = isInMyCompletedHold && holdDice && holdDice.length > 0;
  
  // Check if hold period just started showing result badge (last 1.5 seconds of hold)
  const showHoldResultBadge = isInMyCompletedHold && holdResult && 
    horses.completedTurnHold && 
    (horses.completedTurnHold.expiresAt - Date.now() < 1500);

  // Show "rolling against" when it's my turn and there's already a winning hand to beat
  const showRollingAgainst = horses.isMyTurn && horses.gamePhase === "playing" && horses.currentWinningResult;

  // CRITICAL FIX: Only show result badge in ONE place to avoid duplicates.
  // When hold period is active with badge, the dice area shows it (lines ~202-222).
  // When hold period ends, the action area shows it (lines ~322-341).
  // We NEVER want both to render simultaneously.
  const showResultInDiceArea = showHoldResultBadge;
  const showResultInActionArea = hasCompleted && myResult && !showHoldResultBadge;

  const isSCC = gameType === "ship-captain-crew";

  // TABLET: Use larger dice for active player
  const diceSize = isTablet || isDesktop ? "lg" : "lg";
  // roll label should never exceed 3 (and we hide the button after roll 3)
  const rollNumber = Math.min(3, Math.max(1, 4 - horses.localHand.rollsRemaining));

  return (
    <div className="px-2 flex flex-col flex-1 relative">
      {/* Debug overlay toggle + panel (DEV only) - TEMPORARILY HIDDEN
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
      */}

      {/* Dice area - always reserve space so button doesn't move */}
      {/* TABLET: Larger dice area to accommodate bigger dice */}
      <div className={cn(
        "flex items-center justify-center mb-1",
        isTablet || isDesktop ? "gap-2 min-h-[100px]" : "gap-1 min-h-[60px]"
      )}>
        {/* Show hold result badge in last 1.5 seconds of hold period */}
        {showHoldResultBadge && holdResult ? (
          <div className="flex flex-col items-center gap-2 animate-in fade-in duration-300">
            <Badge 
              variant="secondary" 
              className={cn(
                "font-bold",
                isTablet || isDesktop ? "text-xl px-6 py-3" : "text-lg px-4 py-2",
                horses.currentlyWinningPlayerIds.includes(horses.myPlayer?.id ?? '') && "bg-green-600 text-white"
              )}
            >
              {gameType === 'horses' ? (
                <HorsesHandResultDisplay 
                  description={holdResult.description} 
                  isWinning={horses.currentlyWinningPlayerIds.includes(horses.myPlayer?.id ?? '')}
                  size={isTablet || isDesktop ? "md" : "sm"}
                />
              ) : (
                holdResult.description
              )}
            </Badge>
          </div>
        ) : showHoldDice && holdDice ? (
          // Show hold dice during first 1.5 seconds of hold period (no flicker)
          holdDice.map((die: any, idx: number) => (
            <HorsesDie
              key={idx}
              value={die.value}
              isHeld={false}
              isRolling={false}
              canToggle={false}
              size={isTablet || isDesktop ? "xl" : "lg"}
              showWildHighlight={!isSCC}
            />
          ))
        ) : showMyDice ? (
          horses.localHand.dice.map((die, idx) => {
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
                size={isTablet || isDesktop ? "xl" : "lg"}
                showWildHighlight={!isSCC}
              />
            );
          })
        ) : (
          // Placeholder to reserve space before first roll
          <div className={isTablet || isDesktop ? "h-[100px]" : "h-[52px]"} />
        )}
      </div>

      {/* Action buttons (always in same position below dice area) */}
      {/* TABLET: Larger buttons with more height/width */}
      <div className={cn(
        "flex items-center justify-center",
        isTablet || isDesktop ? "min-h-[64px] mt-2 mb-2" : "min-h-[36px] mt-1 mb-1"
      )}>
        {horses.gamePhase === "playing" && horses.isMyTurn ? (
          horses.localHand.rollsRemaining > 0 ? (
            <div className={cn(
              "flex items-center justify-center",
              isTablet || isDesktop ? "gap-4" : "gap-2"
            )}>
              {/* Left spacer keeps the Roll button perfectly centered even when Lock appears */}
              <div className={cn(isTablet || isDesktop ? "h-14 w-14" : "h-9 w-9")} aria-hidden="true" />

              <Button
                size="default"
                onClick={handleRollClick}
                disabled={rolling}
                className={cn(
                  "font-bold",
                  isTablet || isDesktop ? "text-xl h-14 px-10" : "text-sm h-9 px-6"
                )}
              >
                <RotateCcw className={cn(
                  "mr-2 animate-slow-pulse-red",
                  isTablet || isDesktop ? "w-6 h-6" : "w-4 h-4"
                )} />
                Roll {rollNumber}
              </Button>

              {horses.localHand.rollsRemaining < 3 ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={horses.handleLockIn}
                  className={cn(isTablet || isDesktop ? "h-14 w-14" : "h-9 w-9")}
                  title="Lock In"
                >
                  <Lock className={cn(isTablet || isDesktop ? "w-6 h-6" : "w-4 h-4")} />
                </Button>
              ) : (
                // Right placeholder keeps layout stable on roll 1
                <div className={cn(isTablet || isDesktop ? "h-14 w-14" : "h-9 w-9")} aria-hidden="true" />
              )}
            </div>
          ) : (
            // After roll 3, hide the Roll button entirely
            <Badge className="text-sm px-3 py-1.5 font-medium">✓ Locked In</Badge>
          )
        ) : showResultInActionArea ? (
          // Styled result badge persists from turn completion through game end (including win animations)
          // CRITICAL: Only shows when NOT displaying in dice area (showHoldResultBadge is false)
          <Badge 
            variant="secondary" 
            className={cn(
              "font-bold",
              isTablet || isDesktop ? "text-xl px-6 py-3" : "text-lg px-4 py-2",
              horses.currentlyWinningPlayerIds.includes(horses.myPlayer?.id ?? '') && "bg-green-600 text-white"
            )}
          >
            {gameType === 'horses' ? (
              <HorsesHandResultDisplay 
                description={myResult!.description} 
                isWinning={horses.currentlyWinningPlayerIds.includes(horses.myPlayer?.id ?? '')}
                size={isTablet || isDesktop ? "md" : "sm"}
              />
            ) : (
              myResult!.description
            )}
          </Badge>
        ) : isWaitingForYourTurn ? (
          <Badge variant="secondary" className="text-sm px-3 py-1.5 font-medium">
            Waiting — {horses.currentTurnPlayerName ? `${horses.currentTurnPlayerName}'s turn` : "Next turn"}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-sm px-3 py-1.5 font-medium">
            Ready
          </Badge>
        )}
      </div>

      {/* Auto-fold checkbox for reconnection - always show when auto_fold is true */}
      {currentUserPlayer.auto_fold && (
        <div className="flex items-center justify-center mt-2">
          <label className="flex items-center gap-2 text-xs text-amber-500 cursor-pointer">
            <Checkbox
              checked={true}
              onCheckedChange={(checked) => {
                // Show this only when auto_fold is true; unchecking disables auto-fold.
                if (checked === false) onAutoFoldChange?.(false);
              }}
              className="h-4 w-4"
            />
            <span>Auto-roll enabled (uncheck to rejoin)</span>
          </label>
        </div>
      )}

      {/* Player info (bottom) - consistent with card games layout */}
      <div className={cn(
        "flex items-center justify-center mt-auto pt-0 pb-2",
        isTablet || isDesktop ? "gap-3" : "gap-2"
      )}>
        {/* Quick emoticon picker - left of player name */}
        {onEmoticonSelect && (
          <QuickEmoticonPicker 
            onSelect={onEmoticonSelect} 
            disabled={isEmoticonSending || !currentUserPlayer}
          />
        )}
        <p className={cn(
          "font-semibold text-foreground",
          isTablet || isDesktop ? "text-xl" : "text-sm"
        )}>
          {currentUserPlayer.profiles?.username || 'You'}
          {(currentUserPlayer.auto_fold || currentUserPlayer.sitting_out) && !currentUserPlayer.waiting ? (
            <span className="ml-1 text-destructive font-bold">(sitting out)</span>
          ) : currentUserPlayer.waiting ? (
            <span className="ml-1 text-yellow-500">(waiting)</span>
          ) : (
            <span className="ml-1 text-green-500">(active)</span>
          )}
        </p>
        <div className="relative pr-6">
          {/* Show emoticon overlay OR chipstack value */}
          {emoticonOverlays && emoticonOverlays[currentUserPlayer.id] ? (
            <span
              className={cn(
                "animate-in fade-in zoom-in duration-200",
                isTablet || isDesktop ? "text-3xl" : "text-2xl"
              )}
              style={{
                animation:
                  emoticonOverlays[currentUserPlayer.id].expiresAt - Date.now() < 500
                    ? 'fadeOutEmoticon 0.5s ease-out forwards'
                    : undefined,
              }}
            >
              {emoticonOverlays[currentUserPlayer.id].emoticon}
            </span>
          ) : (
            <span
              className={cn(
                "font-bold",
                isTablet || isDesktop ? "text-xl" : "text-lg",
                currentUserPlayer.chips < 0 ? "text-destructive" : "text-poker-gold"
              )}
            >
              ${formatChipValue(Math.round(currentUserPlayer.chips))}
            </span>
          )}
          <ValueChangeFlash 
            value={0}
            prefix="+L"
            position="top-right"
            manualTrigger={winnerLegsFlashTrigger?.playerId === currentUserPlayer.id ? { id: winnerLegsFlashTrigger.id, amount: winnerLegsFlashTrigger.amount } : null}
          />
          <ValueChangeFlash 
            value={0}
            prefix="+$"
            position="top-left"
            manualTrigger={winnerPotFlashTrigger?.playerId === currentUserPlayer.id ? { id: winnerPotFlashTrigger.id, amount: winnerPotFlashTrigger.amount } : null}
          />
        </div>
        {horses.isMyTurn && horses.gamePhase === "playing" && (
          <Badge variant="outline" className={isTablet || isDesktop ? "text-sm" : "text-xs"}>
            Rolls: {horses.localHand.rollsRemaining}
          </Badge>
        )}
      </div>
      
      {/* Emoticon fade-out animation */}
      <style>{`
        @keyframes fadeOutEmoticon {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(0.8);
          }
        }
      `}</style>
    </div>
  );
}
