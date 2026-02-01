import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn, formatChipValue } from "@/lib/utils";
import { HandAccordionContent } from "./HandAccordionContent";
import type { DealerGameGroup } from "./types";

interface DealerGameAccordionProps {
  group: DealerGameGroup;
  currentPlayerId?: string;
  currentUserId?: string;
}

// Format game type for display
const formatGameType = (type: string | null | undefined): string => {
  if (!type) return "";
  const normalized = type.toLowerCase().replace(/-/g, "");
  switch (normalized) {
    case "holmgame":
      return "Holm";
    case "357":
      return "3-5-7";
    case "horses":
      return "Horses";
    case "shipcaptaincrew":
      return "SCC";
    default:
      return type;
  }
};

export function DealerGameAccordion({
  group,
  currentPlayerId,
  currentUserId,
}: DealerGameAccordionProps) {
  const displayNumber = group.displayNumber;
  const gameTypeDisplay = formatGameType(group.gameType);

  return (
    <AccordionItem
      value={`game-${group.dealerGameId}`}
      className="border border-border/50 rounded-lg mb-2 overflow-hidden bg-card/50"
    >
      <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30 overflow-hidden">
        <div className="grid grid-cols-[5rem_1fr_4.5rem] items-center w-full gap-1 overflow-hidden">
          {/* Game number + type */}
          <div className="flex items-center gap-1 truncate">
            <span className="text-sm font-medium">#{displayNumber}</span>
            {gameTypeDisplay && (
              <span className="text-xs text-muted-foreground">{gameTypeDisplay}</span>
            )}
          </div>

          {/* Winner info - middle (truncated) */}
          <div className="min-w-0 truncate text-center">
            <span
              className={cn(
                "text-xs",
                group.winner === "Pussy Tax"
                  ? "text-poker-gold font-medium"
                  : "text-muted-foreground"
              )}
            >
              {group.winner || "No winner"}
            </span>
          </div>

          {/* Chip change - right */}
          <span
            className={cn(
              "text-sm font-bold tabular-nums text-right truncate",
              group.totalChipChange > 0
                ? "text-poker-chip-green"
                : group.totalChipChange < 0
                ? "text-poker-chip-red"
                : "text-muted-foreground"
            )}
          >
            {group.totalChipChange > 0 ? "+" : ""}
            {formatChipValue(group.totalChipChange)}
          </span>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-3 pb-3">
        <HandAccordionContent
          group={group}
          currentPlayerId={currentPlayerId}
          currentUserId={currentUserId}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
