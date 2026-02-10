import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
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
    if (scores.length === 0) return null;
    const hi = Math.max(...scores);
    // If only one player has scored points, the other scored 0
    const lo = scores.length >= 2 ? Math.min(...scores) : 0;
    return `${hi}-${lo}`;
  })();

  const skunkIcons = isCribbage && group.cribbageSkunkLevel ? "🦨".repeat(group.cribbageSkunkLevel) : "";

  const winnerLine = [group.winner || "No winner", !isCribbage ? cribbageScoreline : null, skunkIcons].filter(Boolean).join(" ");

  return (
    <AccordionItem
      value={`game-${group.dealerGameId}`}
      className="border border-border/50 rounded-lg mb-2 overflow-hidden bg-card/50"
    >
      <AccordionTrigger className="px-3 py-2 items-start hover:no-underline hover:bg-muted/30">
        <div className="flex w-full items-start gap-2 pr-1">
          {/* Left: game number + type + started */}
          <div className="min-w-0 flex flex-col items-start gap-0.5">
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="text-sm font-medium">#{displayNumber}</span>
              {gameTypeDisplay && (
                <span className="text-xs text-muted-foreground truncate">{gameTypeDisplay}</span>
              )}
            </div>
            {startedText && (
              <div className="text-[10px] text-muted-foreground leading-tight truncate">
                {startedText}
              </div>
            )}
          </div>

          {/* Middle: winner line + cribbage final score beneath */}
          <div className="flex-1 min-w-0 pt-0.5 text-center">
            <span
              className={cn(
                "text-xs truncate block",
                group.winner === "Pussy Tax"
                  ? "text-poker-gold font-medium"
                  : "text-muted-foreground"
              )}
            >
              {winnerLine}
            </span>
            {isCribbage && cribbageScoreline && (
              <span className="text-[10px] text-muted-foreground block">{cribbageScoreline}{skunkIcons ? ` ${skunkIcons}` : ""}</span>
            )}
          </div>

          {/* Right: chip change (chevron lives after children, so keep this tight) */}
          <div className="flex-shrink-0 pt-0.5">
            <span
              className={cn(
                "text-sm font-bold tabular-nums text-right",
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
