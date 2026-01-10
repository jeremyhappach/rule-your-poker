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
}

// Animation duration in ms
const ANIMATION_DURATION = 600;
const START_SCALE = 0.25;

export function DiceRollAnimation({
  dice,
  animatingIndices,
  targetPositions,
  originPosition,
  onComplete,
  size = "sm",
  isSCC = false,
}: DiceRollAnimationProps) {
  const [phase, setPhase] = useState<"flying" | "landing" | "complete">("flying");
  const [flyProgress, setFlyProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  
  // Random tumble rotations for each die
  const [tumbleRotations] = useState(() => 
    animatingIndices.map(() => ({
      rotations: Math.floor(Math.random() * 3) + 2, // 2-4 full rotations
      axis: Math.random() > 0.5 ? 1 : -1, // direction
    }))
  );

  useEffect(() => {
    if (animatingIndices.length === 0) {
      onComplete();
      return;
    }

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }
      
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
      
      // Easing function: ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setFlyProgress(eased);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setPhase("landing");
        // Brief settling pause then complete
        setTimeout(() => {
          setPhase("complete");
          onComplete();
        }, 100);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animatingIndices.length, onComplete]);

  if (phase === "complete" || animatingIndices.length === 0) {
    return null;
  }

  // Y offset for scatter area (unheld dice go below held row)
  const scatterYOffset = 50;

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
        const tumble = tumbleRotations[animIdx];
        const totalTumbleRotation = tumble.rotations * 360 * tumble.axis * flyProgress;
        const finalRotation = target.rotate;
        // Blend tumble rotation into final rotation
        const currentRotation = totalTumbleRotation + finalRotation * flyProgress;
        
        // During flight, show random face values for tumbling effect
        // As we approach landing, show the final value
        const showFinalValue = flyProgress > 0.7;
        const displayValue = showFinalValue ? die.value : Math.floor(Math.random() * 6) + 1;

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
