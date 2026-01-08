import { cn } from "@/lib/utils";

interface HorsesHandResultDisplayProps {
  description: string; // e.g., "3 6s", "5 1s (Wilds!)", "6 high"
  isWinning?: boolean;
  size?: "sm" | "md";
}

// Dot patterns for the die face - black pips on white
function DieFacePips({ value, isWild, size = "sm" }: { value: number; isWild: boolean; size?: "sm" | "md" }) {
  const dotClass = "rounded-full bg-black";
  const dotSize = size === "sm" ? "w-[3px] h-[3px]" : "w-[4px] h-[4px]";
  const largeDotSize = size === "sm" ? "w-[4px] h-[4px]" : "w-[5px] h-[5px]";
  const padding = size === "sm" ? "p-1" : "p-1.5";

  switch (value) {
    case 1:
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className={cn(dotClass, isWild ? "bg-poker-gold" : "bg-black", largeDotSize)} />
        </div>
      );
    case 2:
      return (
        <div className={cn("flex flex-col justify-between w-full h-full", padding)}>
          <div className="flex justify-end"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-start"><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 3:
      return (
        <div className={cn("flex flex-col justify-between w-full h-full", padding)}>
          <div className="flex justify-end"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-center"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-start"><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 4:
      return (
        <div className={cn("flex flex-col justify-between w-full h-full", padding)}>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 5:
      return (
        <div className={cn("flex flex-col justify-between w-full h-full", padding)}>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-center"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 6:
      return (
        <div className={cn("flex flex-col justify-between w-full h-full", padding)}>
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
 * Displays a Horses hand result as a white die with pips and an outlined number overlay.
 */
export function HorsesHandResultDisplay({
  description,
  isWinning = false,
  size = "sm",
}: HorsesHandResultDisplayProps) {
  // Match "X Ys" pattern (e.g., "3 6s", "5 1s")
  const ofAKindMatch = description.match(/^(\d+)\s+(\d+)s/);
  
  if (ofAKindMatch) {
    const count = parseInt(ofAKindMatch[1], 10);
    const dieValue = parseInt(ofAKindMatch[2], 10);
    const isWild = dieValue === 1;
    
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
        isWinning && "bg-white border border-poker-gold"
      )}>
        {/* Count numeral */}
        <span className={cn(
          "font-bold tabular-nums text-black",
          size === "sm" ? "text-sm" : "text-base"
        )}>
          {count}
        </span>
        
        {/* Die */}
        <div className={cn(
          "relative inline-flex items-center justify-center",
          size === "sm" ? "w-6 h-6" : "w-7 h-7",
          "rounded border shadow-sm",
          "bg-white",
          isWild ? "border-poker-gold" : "border-gray-400"
        )}>
          <DieFacePips value={dieValue} isWild={isWild} size={size} />
        </div>
      </div>
    );
  }
  
  // Match "X high" pattern (e.g., "6 high")
  const highCardMatch = description.match(/^(\d+)\s+high$/);
  
  if (highCardMatch) {
    const dieValue = parseInt(highCardMatch[1], 10);
    
    return (
      <div className={cn(
        "inline-flex items-center gap-0.5",
        isWinning && "ring-1 ring-green-500 ring-offset-1 ring-offset-transparent rounded"
      )}>
        {/* Die */}
        <div className={cn(
          "relative inline-flex items-center justify-center",
          size === "sm" ? "w-6 h-6" : "w-7 h-7",
          "rounded border shadow-sm",
          "bg-white border-gray-400"
        )}>
          <DieFacePips value={dieValue} isWild={false} size={size} />
        </div>
        
        {/* "H" for high */}
        <span className="text-[10px] font-medium text-muted-foreground">H</span>
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
