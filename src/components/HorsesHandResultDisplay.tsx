import { cn } from "@/lib/utils";

interface HorsesHandResultDisplayProps {
  description: string; // e.g., "3 6s", "5 1s (Wilds!)", "6 high"
  isWinning?: boolean;
  size?: "sm" | "md";
}

// Dot patterns for the die face overlay
function DieFaceOverlay({ value, isWild }: { value: number; isWild: boolean }) {
  const dotClass = cn(
    "rounded-full",
    isWild ? "bg-poker-gold" : "bg-white"
  );

  const dotSize = "w-[3px] h-[3px]";

  switch (value) {
    case 1:
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className={cn(dotClass, "w-[5px] h-[5px]")} />
        </div>
      );
    case 2:
      return (
        <div className="flex flex-col justify-between w-full h-full p-[3px]">
          <div className="flex justify-end"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-start"><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 3:
      return (
        <div className="flex flex-col justify-between w-full h-full p-[3px]">
          <div className="flex justify-end"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-center"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-start"><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 4:
      return (
        <div className="flex flex-col justify-between w-full h-full p-[3px]">
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 5:
      return (
        <div className="flex flex-col justify-between w-full h-full p-[3px]">
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-center"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 6:
      return (
        <div className="flex flex-col justify-between w-full h-full p-[3px]">
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Displays a Horses hand result as a compact die with overlaid count.
 * Shows "5" overlaid on a die showing 6s for "5 6s".
 */
export function HorsesHandResultDisplay({
  description,
  isWinning = false,
  size = "sm",
}: HorsesHandResultDisplayProps) {
  // Parse the description to extract count and die value
  // Patterns: "3 6s", "5 1s (Wilds!)", "6 high"
  
  // Match "X Ys" pattern (e.g., "3 6s", "5 1s")
  const ofAKindMatch = description.match(/^(\d+)\s+(\d+)s/);
  
  if (ofAKindMatch) {
    const count = parseInt(ofAKindMatch[1], 10);
    const dieValue = parseInt(ofAKindMatch[2], 10);
    const isWild = dieValue === 1;
    
    return (
      <div className={cn(
        "relative inline-flex items-center justify-center",
        size === "sm" ? "w-7 h-7" : "w-9 h-9",
        "rounded-md border",
        isWild 
          ? "bg-gradient-to-br from-amber-800 to-amber-950 border-poker-gold" 
          : "bg-gradient-to-br from-red-700 to-red-900 border-red-500/50",
        isWinning && "ring-1 ring-green-500 ring-offset-1 ring-offset-transparent"
      )}>
        {/* Die face dots in background */}
        <div className="absolute inset-0 opacity-30">
          <DieFaceOverlay value={dieValue} isWild={isWild} />
        </div>
        
        {/* Count overlay */}
        <span className={cn(
          "relative font-bold tabular-nums drop-shadow-lg",
          size === "sm" ? "text-lg" : "text-xl",
          isWild ? "text-poker-gold" : "text-white"
        )}>
          {count}
        </span>
      </div>
    );
  }
  
  // Match "X high" pattern (e.g., "6 high")
  const highCardMatch = description.match(/^(\d+)\s+high$/);
  
  if (highCardMatch) {
    const dieValue = parseInt(highCardMatch[1], 10);
    
    return (
      <div className={cn(
        "relative inline-flex items-center justify-center",
        size === "sm" ? "w-7 h-7" : "w-9 h-9",
        "rounded-md border",
        "bg-gradient-to-br from-gray-600 to-gray-800 border-gray-500/50",
        isWinning && "ring-1 ring-green-500 ring-offset-1 ring-offset-transparent"
      )}>
        {/* Die face dots */}
        <DieFaceOverlay value={dieValue} isWild={false} />
        
        {/* "H" for high in corner */}
        <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold text-muted-foreground bg-background/80 px-0.5 rounded-sm">
          H
        </span>
      </div>
    );
  }
  
  // Fallback: just show the text description
  return (
    <span className={cn(
      size === "sm" ? "text-sm" : "text-base",
      isWinning && "text-green-400"
    )}>
      {description}
    </span>
  );
}
