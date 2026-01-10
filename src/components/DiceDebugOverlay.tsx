import { Button } from "@/components/ui/button";
import { Trash2, X, Bug, Copy } from "lucide-react";
import { toast } from "sonner";
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
  const handleCopy = () => {
    const text = events
      .slice(-30) // Last 30 only
      .map((e) => `${new Date(e.t).toLocaleTimeString()} [${e.tag}] ${e.message}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied last 30 events");
    });
  };

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

  // Show only last 30 events, newest first
  const visibleEvents = [...events].slice(-30).reverse();

  return (
    <div className="fixed inset-x-2 bottom-2 z-[200] max-h-[52vh] rounded-lg border border-border bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="text-xs font-semibold text-foreground">{title} ({events.length} total, showing last 30)</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-8 w-8"
            title="Copy last 30"
          >
            <Copy className="h-4 w-4" />
          </Button>
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

      <div className="max-h-[44vh] overflow-auto px-2 py-2 font-mono text-[10px] leading-4 text-foreground select-text">
        {visibleEvents.length === 0 ? (
          <div className="opacity-70">No events yet. Roll dice to see debug info.</div>
        ) : (
          visibleEvents.map((e, idx) => (
            <div key={`${e.t}-${idx}`} className="whitespace-pre-wrap break-words py-0.5 border-b border-border/30 last:border-0">
              <span className="opacity-60">{new Date(e.t).toLocaleTimeString()} </span>
              <span className="font-bold text-primary">[{e.tag}]</span> {e.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
