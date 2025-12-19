import * as React from "react";

import { cn } from "@/lib/utils";

type DebugItem = {
  label: string;
  value: unknown;
};

function formatDebugValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function DevDebugOverlay({
  title = "Debug",
  items,
  className,
}: {
  title?: string;
  items: DebugItem[];
  className?: string;
}) {
  const enabled =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).get("debug") === "1" ||
        window.localStorage.getItem("debugOverlay") === "1"));

  if (!enabled) return null;

  return (
    <aside
      aria-hidden
      className={cn(
        "fixed left-2 top-2 z-[9999] max-w-[92vw] rounded-lg border border-border/60 bg-background/80 text-foreground shadow-sm backdrop-blur-md pointer-events-none",
        className
      )}
    >
      <div className="px-3 py-2">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          {title}
        </div>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
          {items.map((it) => (
            <React.Fragment key={it.label}>
              <dt className="text-muted-foreground">{it.label}</dt>
              <dd className="truncate">{formatDebugValue(it.value)}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </aside>
  );
}
