/**
 * DEBUG PILLS ADMIN SECTION
 *
 * Admin → Settings → Debug Tools.
 *
 * Per-pill toggles render exactly one pill viewer inside the canonical
 * Debug Pill Tray. Harnesses (assertions, lifecycle tracing) are
 * independent and continue to run whenever Global Debug Mode is on.
 *
 * Default: every pill OFF. Enable All / Disable All for bulk control.
 */

import { useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  DEBUG_PILL_REGISTRY,
  getDebugPillsState,
  isDebugPillEnabled,
  setAllDebugPills,
  setDebugPillEnabled,
  subscribeDebugPills,
} from '@/lib/debugTray/debugPillsStore';

export function DebugPillsAdminSection() {
  // Re-render on any toggle.
  useSyncExternalStore(subscribeDebugPills, getDebugPillsState, getDebugPillsState);
  const [open, setOpen] = useState(false);

  const enabledCount = DEBUG_PILL_REGISTRY.reduce(
    (n, p) => n + (isDebugPillEnabled(p.key) ? 1 : 0),
    0,
  );

  return (
    <div className="space-y-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded border border-border px-3 py-2 text-left hover:bg-muted/50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Label className="cursor-pointer text-sm font-semibold">Debug Tools</Label>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {enabledCount}/{DEBUG_PILL_REGISTRY.length} on
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Toggle individual debug pills surfaced inside the canonical Debug
            Pill Tray. Harnesses (assertions, lifecycle tracing) run
            independently — these toggles only control viewer visibility, so
            gameplay is not obscured.
          </p>

          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setAllDebugPills(true)}>
              Enable All
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAllDebugPills(false)}>
              Disable All
            </Button>
          </div>

          <div className="divide-y divide-border rounded border border-border">
            {DEBUG_PILL_REGISTRY.map((pill) => {
              const enabled = isDebugPillEnabled(pill.key);
              return (
                <div key={pill.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
                        {pill.abbreviation}
                      </span>
                      <span className="text-sm text-foreground">{pill.fullName}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{pill.description}</p>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => setDebugPillEnabled(pill.key, v)}
                    aria-label={`Toggle ${pill.fullName} pill`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

