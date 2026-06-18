import { useState, useEffect, useCallback } from "react";
import { Bug } from "lucide-react";
import { refreshDebugEventFlag } from "@/lib/debugEventLogger";
import { useHideDebugUI } from "@/lib/debugUIVisibility";

const STORAGE_KEY = "ptp_debug_events";

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function DebugLogToggle() {
  const [enabled, setEnabled] = useState(readFlag);

  const toggle = useCallback(() => {
    const next = !enabled;
    try {
      if (next) {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* */ }
    refreshDebugEventFlag();
    setEnabled(next);
  }, [enabled]);

  // Sync if changed in another tab
  useEffect(() => {
    const handler = () => setEnabled(readFlag());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (useHideDebugUI()) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed bottom-2 left-2 z-[150] flex items-center gap-1 rounded-md bg-background/80 border border-border px-1.5 py-1 text-[10px] font-mono backdrop-blur hover:bg-accent transition-colors"
      title={enabled ? "Disable debug logging" : "Enable debug logging"}
    >
      <Bug className={`h-3.5 w-3.5 ${enabled ? "text-destructive" : "text-muted-foreground"}`} />
      {enabled && (
        <span className="text-destructive font-semibold tracking-wider">DEBUG</span>
      )}
    </button>
  );
}
