import { HorsesDie } from "./HorsesDie";
import { cn } from "@/lib/utils";

interface HorsesHandResultDisplayProps {
  description: string; // e.g., "3 6s", "5 1s (Wilds!)", "6 high"
  isWinning?: boolean;
  size?: "sm" | "md";
}

/**
 * Displays a Horses hand result with dice images instead of text.
 * Parses descriptions like "3 6s" and shows "3×" + die image.
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
        "flex items-center gap-1",
        isWinning && "text-green-400"
      )}>
        <span className={cn(
          "font-bold tabular-nums",
          size === "sm" ? "text-sm" : "text-base"
        )}>
          {count}×
        </span>
        <HorsesDie
          value={dieValue}
          isHeld={false}
          canToggle={false}
          isRolling={false}
          size="sm"
          showWildHighlight={isWild}
        />
        {isWild && (
          <span className={cn(
            "text-poker-gold font-semibold",
            size === "sm" ? "text-xs" : "text-sm"
          )}>
            Wild!
          </span>
        )}
      </div>
    );
  }
  
  // Match "X high" pattern (e.g., "6 high")
  const highCardMatch = description.match(/^(\d+)\s+high$/);
  
  if (highCardMatch) {
    const dieValue = parseInt(highCardMatch[1], 10);
    
    return (
      <div className={cn(
        "flex items-center gap-1",
        isWinning && "text-green-400"
      )}>
        <HorsesDie
          value={dieValue}
          isHeld={false}
          canToggle={false}
          isRolling={false}
          size="sm"
          showWildHighlight={false}
        />
        <span className={cn(
          "text-muted-foreground",
          size === "sm" ? "text-xs" : "text-sm"
        )}>
          high
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
