import { cn } from "@/lib/utils";

interface HorsesDieProps {
  value: number; // 1-6, 0 for unrolled
  isHeld: boolean;
  canToggle: boolean;
  isRolling?: boolean;
  onToggle?: () => void;
  size?: "sm" | "md" | "lg";
}

export function HorsesDie({
  value,
  isHeld,
  canToggle,
  isRolling = false,
  onToggle,
  size = "md",
}: HorsesDieProps) {
  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };

  const dotSizeClasses = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  const dotSize = dotSizeClasses[size];

  // Dot patterns for each die face
  const renderDots = () => {
    // Unrolled dice show a subtle placeholder (no "?" to avoid flicker).
    if (value === 0) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className={cn(dotSize, "rounded-full bg-muted-foreground/25")} />
        </div>
      );
    }

    const dotClass = cn(
      dotSize,
      "rounded-full",
      value === 1 ? "bg-destructive" : "bg-foreground/90",
    );

    switch (value) {
      case 1:
        return (
          <div className="flex items-center justify-center w-full h-full">
            <div className={cn(dotClass, "w-4 h-4")} />
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
        isRolling && "ring-2 ring-primary/30 animate-pulse",
        isHeld
          ? "bg-amber-200 dark:bg-amber-900 border-amber-500 dark:border-amber-400 shadow-md ring-2 ring-amber-400/50"
          : "bg-card border-border shadow-sm",
        canToggle && !isHeld && "hover:border-primary/60 cursor-pointer active:scale-95",
        canToggle && isHeld && "hover:border-amber-600 cursor-pointer active:scale-95",
        !canToggle && "cursor-default opacity-95",
      )}
    >
      {renderDots()}
      {/* HOLD indicator for held dice */}
      {isHeld && value > 0 && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wide bg-amber-500 text-amber-950 px-1.5 py-0.5 rounded-sm shadow-sm">
          Hold
        </span>
      )}
    </button>
  );
}
