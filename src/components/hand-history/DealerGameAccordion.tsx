import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn, formatChipValue } from "@/lib/utils";
import { HandAccordionContent } from "./HandAccordionContent";
import type { DealerGameGroup } from "./types";

interface DealerGameAccordionProps {
  group: DealerGameGroup;
  currentPlayerId?: string;
  currentUserId?: string;
  playerNames?: Map<string, string>;
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
    case "cribbage":
      return "Cribbage";
    default:
      return type;
  }
};

export function DealerGameAccordion({
  group,
  currentPlayerId,
  currentUserId,
  playerNames,
}: DealerGameAccordionProps) {
  const displayNumber = group.displayNumber;
  const gameTypeDisplay = formatGameType(group.gameType);

  const startedAt = group.dealerGame?.started_at || group.latestTimestamp;
  const startedText = startedAt ? `Started: ${new Date(startedAt).toLocaleString()}` : "";

  const isCribbage = group.gameType === "cribbage";
  const cribbageScoreline = (() => {
    if (!isCribbage || !group.cribbageFinalScores) return null;
    const scores = Object.values(group.cribbageFinalScores).filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (scores.length < 2) return null;
    const hi = Math.max(...scores);
    const lo = Math.min(...scores);
    return `${hi}-${lo}`;
  })();

  const skunkIcons = isCribbage && group.cribbageSkunkLevel ? "🦨".repeat(group.cribbageSkunkLevel) : "";

  const winnerLine = [group.winner || "No winner", cribbageScoreline, skunkIcons].filter(Boolean).join(" ");

  return (
    <AccordionItem
      value={`game-${group.dealerGameId}`}
      className="border border-border/50 rounded-lg mb-2 overflow-hidden bg-card/50"
    >
      <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-muted/30 overflow-hidden">
        <div className="grid grid-cols-[5rem_1fr_4.5rem] items-center w-full gap-1 overflow-hidden">
          {/* Game number + type */}
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <div className="flex items-center gap-1 truncate">
              <span className="text-sm font-medium">#{displayNumber}</span>
              {gameTypeDisplay && (
                <span className="text-xs text-muted-foreground">{gameTypeDisplay}</span>
              )}
            </div>
            {startedText && (
              <div className="text-[10px] text-muted-foreground truncate">
                {startedText}
              </div>
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
              {winnerLine}
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
          playerNames={playerNames}
        />
      </AccordionContent>
    </AccordionItem>
  );
}
