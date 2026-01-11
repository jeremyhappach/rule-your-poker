import { useState, useEffect, useRef } from "react";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie } from "./HorsesDie";

interface DiceRollAnimationProps {
  /** The dice to animate */
  dice: (HorsesDieType | SCCDieType)[];
  /** Indices of dice that should animate (unheld dice) */
  animatingIndices: number[];
  /** Final scatter positions for each animating die */
  targetPositions: { x: number; y: number; rotate: number }[];
  /** Origin position relative to the container (where dice come from) */
  originPosition: { x: number; y: number };
  /** Called when animation completes */
  onComplete: () => void;
  /** Die size */
  size?: "sm" | "md" | "lg";
  /** Whether this is an SCC game */
  isSCC?: boolean;
  /** Y offset for the scatter area (must match DiceTableLayout's unheldYOffset) */
  scatterYOffset?: number;
}

// Animation duration in ms (reduced for snappier feel)
const ANIMATION_DURATION = 900;
const START_SCALE = 0.25;

export function DiceRollAnimation({
  dice,
  animatingIndices,
  targetPositions,
  originPosition,
  onComplete,
  size = "sm",
  isSCC = false,
  scatterYOffset = 50,
}: DiceRollAnimationProps) {
  const [phase, setPhase] = useState<"flying" | "landing">("flying");
  const [flyProgress, setFlyProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const completionTimeoutRef = useRef<number | null>(null);

  // Granular timing instrumentation (helps detect main-thread stalls / timer drift)
  const perfRef = useRef({
    wallStart: 0,
    perfStart: 0,
    lastRafTs: 0,
    frames: 0,
    lastMilestone: -1,
  });

  // Avoid re-starting the animation when the parent re-renders and passes a new onComplete fn.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Random tumble rotations and display sequences for each die (memoized to prevent switching)
  const [tumbleData] = useState(() =>
    animatingIndices.map(() => ({
      rotations: Math.floor(Math.random() * 3) + 2, // 2-4 full rotations
      axis: Math.random() > 0.5 ? 1 : -1, // direction
      // Pre-generate a sequence of random values for tumbling display
      tumbleSequence: Array.from({ length: 8 }, () => Math.floor(Math.random() * 6) + 1),
    })),
  );

  useEffect(() => {
    if (animatingIndices.length === 0) return;

    // Reset per-run timing stats
    perfRef.current = {
      wallStart: Date.now(),
      perfStart: typeof performance !== "undefined" ? performance.now() : 0,
      lastRafTs: 0,
      frames: 0,
      lastMilestone: -1,
    };

    // Cancel anything in-flight before starting a new run
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

    completedRef.current = false;
    setPhase("flying");
    setFlyProgress(0);
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
        perfRef.current.lastRafTs = timestamp;
      }

      // Detect RAF gaps (usually means main thread was blocked)
      const frameGap = timestamp - perfRef.current.lastRafTs;
      perfRef.current.lastRafTs = timestamp;
      perfRef.current.frames += 1;

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

      // Easing function: ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setFlyProgress(eased);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Land, then signal completion. Keep rendering until parent clears indices.
      setPhase("landing");
      if (!completedRef.current) {
        completedRef.current = true;

        completionTimeoutRef.current = window.setTimeout(() => {
          onCompleteRef.current();
        }, 100);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
    };
    // IMPORTANT: depend only on length so parent rerenders don't restart the animation
  }, [animatingIndices.length]);

  if (animatingIndices.length === 0) return null;

  // Y offset is now passed in as a prop to match DiceTableLayout's unheldYOffset

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {animatingIndices.map((dieIndex, animIdx) => {
        const die = dice[dieIndex];
        const target = targetPositions[animIdx];
        if (!die || !target) return null;

        // Interpolate position from origin to target
        const currentX = originPosition.x + (target.x - originPosition.x) * flyProgress;
        const currentY = originPosition.y + (target.y + scatterYOffset - originPosition.y) * flyProgress;
        
        // Scale from 25% to 100%
        const currentScale = START_SCALE + (1 - START_SCALE) * flyProgress;
        
        // Tumbling rotation
        const tumble = tumbleData[animIdx];
        const totalTumbleRotation = tumble.rotations * 360 * tumble.axis * flyProgress;
        const finalRotation = target.rotate;
        // Blend tumble rotation into final rotation
        const currentRotation = totalTumbleRotation + finalRotation * flyProgress;
        
        // During flight, show pre-generated tumbling values (based on progress)
        // As we approach landing, show the final value
        const showFinalValue = flyProgress > 0.7;
        // Use progress to pick from pre-generated sequence (prevents random switching)
        const sequenceIndex = Math.floor(flyProgress * (tumble.tumbleSequence.length - 1));
        const displayValue = showFinalValue ? die.value : tumble.tumbleSequence[sequenceIndex];

        const sccDie = die as SCCDieType;
        const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

        return (
          <div
            key={`flying-${dieIndex}`}
            className="absolute transition-none"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px)) rotate(${currentRotation}deg) scale(${currentScale})`,
              // Add motion blur effect during fast movement
              filter: flyProgress < 0.5 ? 'blur(1px)' : 'none',
            }}
          >
            <HorsesDie
              value={displayValue}
              isHeld={false}
              isRolling={!showFinalValue}
              canToggle={false}
              onToggle={() => {}}
              size={size}
              showWildHighlight={!isSCC}
              isSCCDie={isSCCDie}
            />
          </div>
        );
      })}
    </div>
  );
}
