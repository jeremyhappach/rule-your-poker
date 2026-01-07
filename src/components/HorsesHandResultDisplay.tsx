import { cn } from "@/lib/utils";

interface HorsesHandResultDisplayProps {
  description: string; // e.g., "3 6s", "5 1s (Wilds!)", "6 high"
  isWinning?: boolean;
  size?: "sm" | "md";
}

// Dot patterns for the die face - black pips on white
function DieFacePips({ value, isWild }: { value: number; isWild: boolean }) {
  const dotClass = "rounded-full bg-black";
  const dotSize = "w-[5px] h-[5px]";
  const largeDotSize = "w-[7px] h-[7px]";

  switch (value) {
    case 1:
      return (
        <div className="flex items-center justify-center w-full h-full">
          <div className={cn(dotClass, isWild ? "bg-poker-gold" : "bg-black", largeDotSize)} />
        </div>
      );
    case 2:
      return (
        <div className="flex flex-col justify-between w-full h-full p-1.5">
          <div className="flex justify-end"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-start"><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 3:
      return (
        <div className="flex flex-col justify-between w-full h-full p-1.5">
          <div className="flex justify-end"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-center"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-start"><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 4:
      return (
        <div className="flex flex-col justify-between w-full h-full p-1.5">
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 5:
      return (
        <div className="flex flex-col justify-between w-full h-full p-1.5">
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-center"><div className={cn(dotClass, dotSize)} /></div>
          <div className="flex justify-between"><div className={cn(dotClass, dotSize)} /><div className={cn(dotClass, dotSize)} /></div>
        </div>
      );
    case 6:
      return (
        <div className="flex flex-col justify-between w-full h-full p-1.5">
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
        "relative inline-flex items-center justify-center",
        size === "sm" ? "w-9 h-9" : "w-11 h-11",
        "rounded-lg border-2 shadow-md",
        "bg-white",
        isWild ? "border-poker-gold" : "border-gray-400",
        isWinning && "ring-2 ring-green-500 ring-offset-1 ring-offset-transparent"
      )}>
        {/* Die face pips */}
        <DieFacePips value={dieValue} isWild={isWild} />
        
        {/* Outlined number overlay */}
        <span 
          className={cn(
            "absolute inset-0 flex items-center justify-center font-black",
            size === "sm" ? "text-3xl" : "text-4xl"
          )}
          style={{
            WebkitTextStroke: isWild ? '2px #d4af55' : '2px #374151',
            color: 'transparent',
            textShadow: '0 0 4px rgba(255,255,255,0.8)',
          }}
        >
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
        size === "sm" ? "w-9 h-9" : "w-11 h-11",
        "rounded-lg border-2 shadow-md",
        "bg-white border-gray-400",
        isWinning && "ring-2 ring-green-500 ring-offset-1 ring-offset-transparent"
      )}>
        {/* Die face pips */}
        <DieFacePips value={dieValue} isWild={false} />
        
        {/* "H" for high in corner */}
        <span className="absolute -bottom-1 -right-1 text-[10px] font-bold text-white bg-gray-600 px-1 rounded-sm shadow">
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
