import { cn } from "@/lib/utils";
import { useDeviceSize } from "@/hooks/useDeviceSize";

interface HorsesHandResultDisplayProps {
  description: string; // e.g., "3 6s", "5 1s (Wilds!)", "6 high"
  isWinning?: boolean;
  size?: "sm" | "md";
}

// Dot patterns for the die face - black pips on white
function DieFacePips({ value, isWild, size = "sm" }: { value: number; isWild: boolean; size?: "sm" | "md" }) {
  const dotClass = "rounded-full bg-black";
  // Thicker pips for better visibility
  const dotSize = size === "sm" ? "w-[4px] h-[4px]" : "w-[5px] h-[5px]";
  const largeDotSize = size === "sm" ? "w-[5px] h-[5px]" : "w-[6px] h-[6px]";
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
  const { isTablet, isDesktop } = useDeviceSize();
  
  // TABLET: Scale up all badges 2x
  const effectiveSize = (isTablet || isDesktop) && size === "sm" ? "md" : size;
  
  // Match "X Ys" pattern (e.g., "3 6s", "5 1s")
  const ofAKindMatch = description.match(/^(\d+)\s+(\d+)s/);
  
  if (ofAKindMatch) {
    const count = parseInt(ofAKindMatch[1], 10);
    const dieValue = parseInt(ofAKindMatch[2], 10);
    const isWild = dieValue === 1;
    
    return (
      <div className={cn(
        "inline-flex items-center gap-0.5 rounded",
        isWinning 
          ? "bg-poker-gold border border-poker-gold px-0.5 py-0.5" 
          : "bg-white border border-gray-300 px-0.5 py-0.5"
      )}>
        {/* Count numeral */}
        <span 
          className={cn(
            "tabular-nums leading-none",
            isWinning 
              ? (effectiveSize === "sm" ? "text-xl font-extrabold text-white" : "text-2xl font-extrabold text-white")
              : (effectiveSize === "sm" ? "text-sm font-bold text-black" : "text-base font-bold text-black")
          )}
          style={isWinning ? { textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" } : undefined}
        >
          {count}
        </span>
        
        {/* Die */}
        <div 
          className={cn(
            "relative inline-flex items-center justify-center",
            effectiveSize === "sm" ? "w-6 h-6" : "w-7 h-7",
            "rounded border",
            "bg-white",
            isWild ? "border-poker-gold" : "border-gray-400"
          )}
          style={{
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.25), 0 1px 0 rgba(0,0,0,0.1)',
          }}
        >
          <DieFacePips value={dieValue} isWild={isWild} size={effectiveSize} />
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
        "inline-flex items-center gap-0.5 rounded",
        isWinning 
          ? "bg-white border border-poker-gold px-0.5 py-0.5" 
          : "bg-white border border-gray-300 px-0.5 py-0.5"
      )}>
        {/* Die */}
        <div 
          className={cn(
            "relative inline-flex items-center justify-center",
            effectiveSize === "sm" ? "w-6 h-6" : "w-7 h-7",
            "rounded border",
            "bg-white border-gray-400"
          )}
          style={{
            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.25), 0 1px 0 rgba(0,0,0,0.1)',
          }}
        >
          <DieFacePips value={dieValue} isWild={false} size={effectiveSize} />
        </div>
        
        {/* "H" for high */}
        <span className={cn(isTablet || isDesktop ? "text-xs" : "text-[10px]", "font-medium text-black")}>H</span>
      </div>
    );
  }
  
  // Fallback: just show the text description
  return (
    <span className={cn(
      effectiveSize === "sm" ? "text-sm" : "text-base",
      isWinning && "text-green-400"
    )}>
      {description}
    </span>
  );
}
