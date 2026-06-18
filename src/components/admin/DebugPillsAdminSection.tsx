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

import { useSyncExternalStore } from 'react';
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

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <Label className="text-sm font-semibold">Debug Tools</Label>
        <p className="text-xs text-muted-foreground">
          Toggle individual debug pills surfaced inside the canonical Debug
          Pill Tray. Harnesses (assertions, lifecycle tracing) run
          independently — these toggles only control viewer visibility, so
          gameplay is not obscured.
        </p>
      </div>

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
  );
}
