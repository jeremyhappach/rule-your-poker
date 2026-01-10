import { Button } from "@/components/ui/button";
import { Trash2, X, Bug } from "lucide-react";
import type { DiceDebugEvent } from "@/hooks/useHorsesMobileController";

interface DiceDebugOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: DiceDebugEvent[];
  onClear: () => void;
  title?: string;
}

export function DiceDebugOverlay({
  open,
  onOpenChange,
  events,
  onClear,
  title = "Dice Debug",
}: DiceDebugOverlayProps) {
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-3 right-3 z-[200] h-10 w-10 bg-background/80 backdrop-blur"
        title="Open dice debug"
      >
        <Bug className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-2 z-[200] max-h-[52vh] rounded-lg border border-border bg-background/85 backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="h-8 w-8"
            title="Clear"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-h-[44vh] overflow-auto px-2 py-2 font-mono text-[10px] leading-4 text-foreground">
        {events.length === 0 ? (
          <div className="opacity-70">No events yet.</div>
        ) : (
          [...events]
            .slice(-120)
            .reverse()
            .map((e, idx) => (
              <div key={`${e.t}-${idx}`} className="whitespace-pre-wrap break-words">
                <span className="opacity-70">{new Date(e.t).toLocaleTimeString()} </span>
                <span className="font-semibold">[{e.tag}]</span> {e.message}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
