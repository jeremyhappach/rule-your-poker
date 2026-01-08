import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface HorsesDieProps {
  value: number; // 1-6, 0 for unrolled
  isHeld: boolean;
  canToggle: boolean;
  isRolling?: boolean;
  onToggle?: () => void;
  size?: "sm" | "md" | "lg";
  showWildHighlight?: boolean; // Whether 1s should be highlighted as wild (default true for Horses, false for SCC)
  isSCCDie?: boolean; // Whether this is a frozen Ship/Captain/Crew die (gold highlight)
}

export function HorsesDie({
  value,
  isHeld,
  canToggle,
  isRolling = false,
  onToggle,
  size = "md",
  showWildHighlight = true,
  isSCCDie = false,
}: HorsesDieProps) {
  // Track the displayed value during roll animation
  const [displayValue, setDisplayValue] = useState(value);
  const [animating, setAnimating] = useState(false);

  // When rolling starts, cycle through random values for dramatic effect
  useEffect(() => {
    if (isRolling && !isHeld) {
      setAnimating(true);
      let frameCount = 0;
      const maxFrames = 8; // ~400ms of cycling at 50ms intervals
      let cancelled = false;
      
      const interval = setInterval(() => {
        if (cancelled) return;
        frameCount++;
        if (frameCount >= maxFrames) {
          clearInterval(interval);
          // Don't set displayValue here - let the non-rolling branch handle it
          // to avoid stale closure issues
          setTimeout(() => {
            if (!cancelled) setAnimating(false);
          }, 150);
        } else {
          // Random value 1-6 for the cycling effect
          setDisplayValue(Math.floor(Math.random() * 6) + 1);
        }
      }, 50);

      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    } else {
      // When not rolling, always sync display value to prop
      setDisplayValue(value);
      setAnimating(false);
    }
  }, [isRolling, isHeld]);

  // Keep display value synced with prop when NOT rolling
  // This fixes the stale closure issue where the animation would show old values
  useEffect(() => {
    if (!isRolling && !animating) {
      setDisplayValue(value);
    }
  }, [value, isRolling, animating]);

  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };

  // Pip sizes - smaller for sm to avoid looking too thick
  const dotSizeClasses = {
    sm: "w-1.5 h-1.5",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  const dotSize = dotSizeClasses[size];
  // Larger center pip for case 1
  const largeDotSizeClasses = {
    sm: "w-2 h-2",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };
  const largeDotSize = largeDotSizeClasses[size];

  // Dot patterns for each die face
  const renderDots = () => {
    const v = displayValue;
    
    // Unrolled dice show a subtle placeholder (no "?" to avoid flicker).
    if (v === 0) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className={cn(dotSize, "rounded-full bg-muted-foreground/25")} />
        </div>
      );
    }

    const dotClass = cn(
      dotSize,
      "rounded-full bg-foreground/90",
    );

    // Special styling for 1s (wild) - use gold outline on the die itself, not red pip
    const isWild = v === 1;

    switch (v) {
      case 1:
        return (
          <div className="flex items-center justify-center w-full h-full">
            <div className={cn(dotClass, largeDotSize, showWildHighlight ? "bg-poker-gold" : "bg-foreground/90")} />
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col justify-between w-full h-full p-2">
            <div className="flex justify-end">
              <div className={dotClass} />
            </div>
            <div className="flex justify-start">
              <div className={dotClass} />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col justify-between w-full h-full p-2">
            <div className="flex justify-end">
              <div className={dotClass} />
            </div>
            <div className="flex justify-center">
              <div className={dotClass} />
            </div>
            <div className="flex justify-start">
              <div className={dotClass} />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col justify-between w-full h-full p-2">
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
          </div>
        );
      case 5:
        return (
          <div className="flex flex-col justify-between w-full h-full p-2">
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
            <div className="flex justify-center">
              <div className={dotClass} />
            </div>
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
          </div>
        );
      case 6:
        return (
          <div className="flex flex-col justify-between w-full h-full p-2">
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
            <div className="flex justify-between">
              <div className={dotClass} />
              <div className={dotClass} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Check if this die shows a wild (1) - only highlight if showWildHighlight is true
  // Or if it's a frozen SCC die (6-5-4), show gold highlight
  const isWildDie = (showWildHighlight && displayValue === 1 && !animating) || isSCCDie;

  return (
    <button
      type="button"
      onClick={canToggle ? onToggle : undefined}
      disabled={!canToggle}
      className={cn(
        sizeClasses[size],
        "rounded-lg border-2 relative",
        "transition-all duration-150",
        "flex items-center justify-center",
        // Rolling animation with shake + glow
        animating && "animate-dice-shake",
        isHeld
          ? "bg-amber-200 dark:bg-amber-900 border-amber-500 dark:border-amber-400 shadow-md ring-2 ring-amber-400/50"
          : isWildDie
            ? "bg-card border-poker-gold shadow-md ring-2 ring-poker-gold/50"
            : "bg-card border-border",
        canToggle && !isHeld && !isWildDie && "hover:border-primary/60 cursor-pointer active:scale-95",
        canToggle && !isHeld && isWildDie && "hover:border-poker-gold cursor-pointer active:scale-95",
        canToggle && isHeld && "hover:border-amber-600 cursor-pointer active:scale-95",
        !canToggle && "cursor-default opacity-95",
      )}
      style={{
        // 3D edge effect with inset highlight and drop shadow
        boxShadow: animating 
          ? '0 0 12px 2px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255,255,255,0.4), 0 3px 6px rgba(0,0,0,0.3)' 
          : isWildDie 
            ? '0 0 8px 1px rgba(212, 175, 55, 0.5), inset 0 1px 2px rgba(255,255,255,0.3), 0 3px 6px rgba(0,0,0,0.25)' 
            : 'inset 0 1px 2px rgba(255,255,255,0.4), 0 3px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(0,0,0,0.1)',
      }}
    >
      {renderDots()}
      {/* HOLD indicator for held dice - only show if more rolls remain */}
      {isHeld && value > 0 && canToggle && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wide bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded-sm shadow-sm">
          Hold
        </span>
      )}
    </button>
  );
}