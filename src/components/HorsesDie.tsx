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
    // Unrolled dice show a placeholder.
    if (value === 0) {
      return (
        <div className="flex items-center justify-center w-full h-full">
          <span className="text-muted-foreground text-xl">?</span>
        </div>
      );
    }

    // While rolling, keep showing the current face (the die itself animates via the button class).
    // This avoids the UI looking like it "switches modes" into unknown dice.

    const dotClass = cn(
      dotSize,
      "rounded-full",
      value === 1 ? "bg-red-500" : "bg-gray-900"
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
        "rounded-lg border-2 transition-all duration-200",
        "flex items-center justify-center",
        isRolling && "animate-bounce",
        isHeld
          ? "bg-amber-100 border-amber-500 shadow-lg shadow-amber-500/30"
          : "bg-white border-gray-300 shadow-md",
        canToggle && !isHeld && "hover:border-amber-400 hover:shadow-lg cursor-pointer",
        canToggle && isHeld && "hover:border-amber-600 cursor-pointer",
        !canToggle && "cursor-default opacity-90"
      )}
    >
      {renderDots()}
    </button>
  );
}
