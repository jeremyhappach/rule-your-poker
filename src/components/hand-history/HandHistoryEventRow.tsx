import { Badge } from "@/components/ui/badge";
import { cn, formatChipValue } from "@/lib/utils";

type Tone = "muted" | "gold";

export function HandHistoryEventRow({
  label,
  description,
  delta,
  tone = "muted",
}: {
  label: string;
  description: string;
  delta?: number | null;
  tone?: Tone;
}) {
  // Normalize labels for display (shorter versions for compact view)
  const displayLabel = label === 'Showdown' ? 'Win' : label;
  
  return (
    <div
      className={cn(
        "grid grid-cols-[3rem_1fr_4rem] items-center gap-1 rounded px-2 py-1.5 w-full overflow-hidden",
        tone === "gold" ? "bg-poker-gold/10" : "bg-muted/20",
      )}
    >
      <Badge
        variant="secondary"
        className="text-[10px] py-0 h-5 justify-center truncate"
      >
        {displayLabel}
      </Badge>
      <span className="text-xs text-muted-foreground truncate">{description}</span>
      <span
        className={cn(
          "text-xs font-medium tabular-nums text-right truncate",
          delta && delta > 0 ? "text-poker-chip-green" : delta && delta < 0 ? "text-poker-chip-red" : "text-muted-foreground",
        )}
      >
        {delta !== null && delta !== undefined && delta !== 0 && (
          <>{delta > 0 ? "+" : ""}{formatChipValue(delta)}</>
        )}
      </span>
    </div>
  );
}
