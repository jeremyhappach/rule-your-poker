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
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1.5 min-w-0",
        tone === "gold" ? "bg-poker-gold/10" : "bg-muted/20",
      )}
    >
      <Badge
        variant="secondary"
        className="text-[10px] py-0 h-5 min-w-[45px] flex-shrink-0 justify-center"
      >
        {label}
      </Badge>
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">{description}</span>
      {delta !== null && delta !== undefined && delta !== 0 && (
        <span
          className={cn(
            "text-xs font-medium flex-shrink-0 tabular-nums",
            delta > 0 ? "text-poker-chip-green" : "text-poker-chip-red",
          )}
        >
          {delta > 0 ? "+" : ""}
          {formatChipValue(delta)}
        </span>
      )}
    </div>
  );
}
