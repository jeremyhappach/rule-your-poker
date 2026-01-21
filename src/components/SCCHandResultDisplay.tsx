import { cn } from "@/lib/utils";
import { useDeviceSize } from "@/hooks/useDeviceSize";

interface SCCHandResultDisplayProps {
  description: string | undefined; // e.g., "8", "12", "NQ"
  isWinning?: boolean;
  size?: "sm" | "md";
}

/**
 * Displays a Ship Captain Crew hand result with cargo sum
 * Shows "Cargo: X" with gold background if winning
 */
export function SCCHandResultDisplay({
  description,
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
          "font-bold text-muted-foreground",
          effectiveSize === "sm" ? "text-sm" : "text-base"
        )}>
          NQ
        </span>
      </div>
    );
  }
  
  // Parse cargo sum from description
  const cargoSum = parseInt(description, 10);
  
  if (isNaN(cargoSum)) {
    // Fallback for unknown format
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
  
  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-md px-3 py-1.5",
      isWinning 
        ? "bg-poker-gold border-2 border-poker-gold" 
        : "bg-card border border-border"
    )}>
      {/* Cargo label */}
      <span 
        className={cn(
          "font-semibold leading-none",
          effectiveSize === "sm" ? "text-sm" : "text-base",
          isWinning ? "text-black" : "text-muted-foreground"
        )}
      >
        Cargo:
      </span>
      
      {/* Cargo sum - large and prominent */}
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
