/**
 * TableDemoAdminSection — Geometry Lab "Table Demo" panel.
 *
 *   How things feel — without having to play a hand.
 *
 * GLOBAL — values are written to `public.system_settings` and shared
 * across every player, observer, device, and table in realtime.
 * Edit requires admin role (enforced by RLS).
 *
 * Persistence contract:
 *   This panel edits the modal-wide draft only. Per-section Save/Reset
 *   buttons are forbidden — the footer **Apply Changes** is the only
 *   commit path. **Cancel / X** discards every section's draft.
 */

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  TABLE_DEMO_BOUNDS,
  TABLE_DEMO_DEFAULTS,
  TABLE_DEMO_KEY,
  type TableDemoConfig,
  useTableDemo,
} from '@/lib/geometryLab/tableDemoStore';

export function TableDemoAdminSection() {
  const live = useTableDemo();
  const { value: draft, setValue, reset, dirty } = useDomainDraft<TableDemoConfig>(
    TABLE_DEMO_KEY,
    TABLE_DEMO_DEFAULTS,
  );
  const [open, setOpen] = useState(false);

  const pauseBounds = TABLE_DEMO_BOUNDS.pauseBetweenHandsMs;
  const pauseSec = (draft.pauseBetweenHandsMs / 1000).toFixed(1);

  return (
    <div className="space-y-3 py-2 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="space-y-0.5">
          <Label className="text-sm font-semibold cursor-pointer">
            ▼ Table Demo {live.enabled && <span className="ml-2 text-[10px] text-amber-500">(ON · global)</span>}
            {dirty && <span className="ml-2 text-[10px] text-amber-500">(draft)</span>}
          </Label>
          {!open && (
            <p className="text-[11px] text-muted-foreground">
              Skip gameplay; let the lifecycle run so you can tune motion and geometry.
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <p className="text-xs text-muted-foreground">
            Geometry Lab values are shared globally. Edits stage to the
            modal draft — use the footer <strong>Apply Changes</strong> to
            commit to every player, observer, and device.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Enable Demo</Label>
              <p className="text-[11px] text-muted-foreground">
                Skip turns. Let the table deal, pause, advance dealer, and deal again.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setValue((d) => ({ ...d, enabled: v === true }))}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Pause Between Hands</Label>
              <span className="font-mono text-base font-semibold">
                {pauseSec}s
                {draft.pauseBetweenHandsMs !== TABLE_DEMO_DEFAULTS.pauseBetweenHandsMs && (
                  <span className="ml-2 text-[10px] text-amber-500">
                    (default {(TABLE_DEMO_DEFAULTS.pauseBetweenHandsMs / 1000).toFixed(1)}s)
                  </span>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Wall-clock pause after a hand settles before the next deal begins.
            </p>
            <Slider
              min={pauseBounds.min}
              max={pauseBounds.max}
              step={pauseBounds.step}
              value={[draft.pauseBetweenHandsMs]}
              onValueChange={([v]) => setValue((d) => ({ ...d, pauseBetweenHandsMs: v }))}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>0s</span>
              <span>{(TABLE_DEMO_DEFAULTS.pauseBetweenHandsMs / 1000).toFixed(1)}s</span>
              <span>{(pauseBounds.max / 1000).toFixed(0)}s</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => reset()}>
              Reset section (draft only)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Reset re-seeds this section's draft to baked defaults. Nothing is
            persisted until you click <strong>Apply Changes</strong> in the modal footer.
          </p>
        </>
      )}
    </div>
  );
}
