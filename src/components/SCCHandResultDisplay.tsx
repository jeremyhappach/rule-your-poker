import { cn } from "@/lib/utils";
import { useDeviceSize } from "@/hooks/useDeviceSize";
import { HorsesDie } from "./HorsesDie";

interface SCCDieForDisplay {
  value: number;
  sccType?: 'ship' | 'captain' | 'crew';
}

interface SCCHandResultDisplayProps {
  description: string | undefined; // e.g., "8", "12", "NQ"
  cargoDice?: SCCDieForDisplay[]; // The actual cargo dice (non-SCC dice)
  isWinning?: boolean;
  size?: "sm" | "md";
}

/**
 * Displays a Ship Captain Crew hand result with cargo dice
 * Shows the two cargo dice visually with gold background if winning
 */
export function SCCHandResultDisplay({
  description,
  cargoDice,
  isWinning = false,
  size = "sm",
}: SCCHandResultDisplayProps) {
  const { isTablet, isDesktop } = useDeviceSize();
  
  if (!description) return null;
  
  // TABLET: Scale up all badges
  const effectiveSize = (isTablet || isDesktop) && size === "sm" ? "md" : size;
  
  // Handle NQ (Not Qualified)
  if (description === "NQ") {
    return (
      <div className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5",
        "bg-muted border border-muted-foreground/30"
      )}>
        <span className={cn(
          "font-bold text-destructive",
          effectiveSize === "sm" ? "text-sm" : "text-base"
        )}>
          NQ
        </span>
      </div>
    );
  }
  
  // If we have cargo dice, show them visually
  if (cargoDice && cargoDice.length >= 2) {
    const dieSize = effectiveSize === "sm" ? "sm" : "md";
    
    return (
      <div className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1",
        isWinning 
          ? "bg-poker-gold border-2 border-poker-gold" 
          : "bg-card border border-border"
      )}>
        {cargoDice.slice(0, 2).map((die, idx) => (
          <HorsesDie
            key={idx}
            value={die.value}
            isHeld={false}
            isRolling={false}
            canToggle={false}
            size={dieSize}
            showWildHighlight={false}
            forceWhiteBackground={true}
          />
        ))}
      </div>
    );
  }
  
  // Fallback: just show cargo sum if we don't have dice data
  const cargoSum = parseInt(description, 10);
  
  if (!isNaN(cargoSum)) {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5",
        isWinning 
          ? "bg-poker-gold border-2 border-poker-gold" 
          : "bg-card border border-border"
      )}>
        <span 
          className={cn(
            "font-semibold leading-none",
            effectiveSize === "sm" ? "text-sm" : "text-base",
            isWinning ? "text-black" : "text-muted-foreground"
          )}
        >
          Cargo:
        </span>
        <span 
          className={cn(
            "font-extrabold tabular-nums leading-none",
            isWinning ? "text-black" : "text-foreground",
            effectiveSize === "sm" ? "text-xl" : "text-2xl"
          )}
        >
          {cargoSum}
        </span>
      </div>
    );
  }
  
  // Final fallback
  return (
    <span className={cn(
      effectiveSize === "sm" ? "text-sm" : "text-base",
      "font-bold",
      isWinning ? "text-poker-gold" : "text-foreground"
    )}>
      {description}
    </span>
  );
}
