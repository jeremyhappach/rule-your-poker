import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface HorsesDieProps {
  value: number; // 1-6, 0 for unrolled
  isHeld: boolean;
  canToggle: boolean;
  isRolling?: boolean;
  onToggle?: () => void;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showWildHighlight?: boolean; // Whether 1s should be highlighted as wild (default true for Horses, false for SCC)
  isSCCDie?: boolean; // Whether this is a frozen Ship/Captain/Crew die (gold highlight)
  forceWhiteBackground?: boolean; // Force white background (for Beat: badge cargo dice)
  isUnusedDie?: boolean; // Whether this is an auto-locked die NOT used in final hand (reddish overlay for NQ cargo)
  isCargoDie?: boolean; // Whether this is a cargo die on a qualifying SCC hand (light blue shading)
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
  forceWhiteBackground = false,
  isUnusedDie = false,
  isCargoDie = false,
}: HorsesDieProps) {
  // Track the displayed value during roll animation
  const [displayValue, setDisplayValue] = useState(value);

  // Animation effect: cycle through random values while isRolling && !isHeld
  useEffect(() => {
    if (isRolling && !isHeld) {
      // Start cycling immediately
      const interval = setInterval(() => {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
      }, 60);

      return () => clearInterval(interval);
    }
  }, [isRolling, isHeld]);

  // Sync display value with prop when NOT rolling
  useEffect(() => {
    if (!isRolling) {
      setDisplayValue(value);
    }
  }, [value, isRolling]);

  const animating = isRolling && !isHeld;

  const sizeClasses = {
    xs: "w-7 h-7",
    sm: "w-9 h-9",
    md: "w-12 h-12",
    lg: "w-[72px] h-[72px]",
    xl: "w-[96px] h-[96px]",  // TABLET: Larger dice for active player
  };

  // Pip sizes - readable at all sizes including xs for cargo display
  // NOTE: xl uses explicit pixel values since Tailwind doesn't have w-4.5 etc.
  const dotSizeClasses = {
    xs: "w-1.5 h-1.5",
    sm: "w-1.5 h-1.5",
    md: "w-2.5 h-2.5",
    lg: "w-3.5 h-3.5",
    xl: "w-[18px] h-[18px]",  // TABLET: Larger pips (~4.5 = 18px)
  };

  const dotSize = dotSizeClasses[size];
  // Larger center pip for case 1
  const largeDotSizeClasses = {
    xs: "w-2 h-2",
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
    xl: "w-[20px] h-[20px]",  // TABLET: Larger center pip (~5 = 20px)
  };
  const largeDotSize = largeDotSizeClasses[size];

  // Padding for pip layout
  const pipPadding = size === "xs" ? "p-0.5" : size === "xl" ? "p-3" : "p-2";

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
          <div className={cn("flex flex-col justify-between w-full h-full", pipPadding)}>
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
          <div className={cn("flex flex-col justify-between w-full h-full", pipPadding)}>
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
          <div className={cn("flex flex-col justify-between w-full h-full", pipPadding)}>
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
          <div className={cn("flex flex-col justify-between w-full h-full", pipPadding)}>
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
          <div className={cn("flex flex-col justify-between w-full h-full", pipPadding)}>
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
        "transition-[transform,background-color,border-color,box-shadow,opacity] duration-150",
        "flex items-center justify-center",
        // Rolling animation with shake + glow
        animating && "animate-dice-shake",
        // Force white background for Beat: badge display
        forceWhiteBackground
          ? "bg-white border-gray-300"
          : isCargoDie
            // Cargo dice on qualifying SCC hands - light blue shading
            ? "bg-poker-cargo/70 border-poker-cargo/70 shadow-md ring-2 ring-poker-cargo/50"
            : isUnusedDie
              // Unused dice (auto-locked but not used in hand determination) - reddish semi-transparent
              ? "bg-red-200/60 dark:bg-red-900/50 border-red-400/70 dark:border-red-600/60 opacity-75"
              : isHeld
                ? "bg-amber-200 dark:bg-amber-900 border-amber-500 dark:border-amber-400 shadow-md ring-2 ring-amber-400/50"
                : isWildDie
                  ? "bg-card border-poker-gold shadow-md ring-2 ring-poker-gold/50"
                  : "bg-card border-border",
        canToggle && !isHeld && !isWildDie && "hover:border-primary/60 cursor-pointer active:scale-95",
        canToggle && !isHeld && isWildDie && "hover:border-poker-gold cursor-pointer active:scale-95",
        canToggle && isHeld && "hover:border-amber-600 cursor-pointer active:scale-95",
        !canToggle && "cursor-default",
        // Don't apply full opacity reduction twice for unused dice
        !canToggle && !isUnusedDie && "opacity-95",
      )}
      style={{
        // 3D edge effect with inset highlight and drop shadow
        boxShadow: animating 
          ? '0 0 12px 2px rgba(251, 191, 36, 0.6), inset 0 1px 2px rgba(255,255,255,0.4), 0 3px 6px rgba(0,0,0,0.3)' 
          : isCargoDie
            ? '0 0 8px 1px hsl(var(--poker-cargo) / 0.55), inset 0 1px 2px rgba(255,255,255,0.3), 0 3px 6px rgba(0,0,0,0.25)'
            : isUnusedDie
              ? 'inset 0 1px 2px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.2)'
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