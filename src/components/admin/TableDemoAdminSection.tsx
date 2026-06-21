/**
 * TableDemoAdminSection — Geometry Lab "Table Demo" panel.
 *
 *   How things feel — without having to play a hand.
 *
 * GLOBAL — values are written to `public.system_settings` and shared
 * across every player, observer, device, and table in realtime.
 * Edit requires admin role (enforced by RLS).
 *
 * Contract (v1 — pre-population):
 *   When Demo is ON, gameplay is skipped and the table's natural
 *   lifecycle (deal → pause → advance → deal) keeps running so the
 *   admin can audit motion/geometry without anyone making decisions.
 *
 *   This is intentionally destructive in a multiplayer world — see
 *   the project memory on the "ONE TABLE, ONE FEEL" philosophy.
 */

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  TABLE_DEMO_BOUNDS,
  TABLE_DEMO_DEFAULTS,
  type TableDemoConfig,
  saveTableDemo,
  resetTableDemo,
  useTableDemo,
} from '@/lib/geometryLab/tableDemoStore';

export function TableDemoAdminSection() {
  const live = useTableDemo();
  const [draft, setDraft] = useState<TableDemoConfig>(live);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraft((prev) => {
      const dirty =
        prev.enabled !== live.enabled
        || prev.pauseBetweenHandsMs !== live.pauseBetweenHandsMs;
      return dirty ? prev : live;
    });
  }, [live]);

  const dirty =
    draft.enabled !== live.enabled
    || draft.pauseBetweenHandsMs !== live.pauseBetweenHandsMs;

  const handleSave = async () => {
    setSaving(true);
    const res = await saveTableDemo(draft);
    setSaving(false);
    if (res.ok === true) {
      toast.success(draft.enabled ? 'Demo Mode ENABLED globally' : 'Demo Mode disabled globally');
    } else {
      toast.error(`Save failed: ${res.error}`);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    const res = await resetTableDemo();
    setSaving(false);
    if (res.ok === true) {
      setDraft({ ...TABLE_DEMO_DEFAULTS });
      toast.success('Table Demo reset globally');
    } else {
      toast.error(`Reset failed: ${res.error}`);
    }
  };

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
            Geometry Lab values are shared globally and affect all players,
            observers, and devices in real time. Enabling Demo Mode skips
            gameplay at every table — destructive in multiplayer; intended
            for the current tuning phase.
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
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v === true }))}
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
              onValueChange={([v]) => setDraft((d) => ({ ...d, pauseBetweenHandsMs: v }))}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>0s</span>
              <span>{(TABLE_DEMO_DEFAULTS.pauseBetweenHandsMs / 1000).toFixed(1)}s</span>
              <span>{(pauseBounds.max / 1000).toFixed(0)}s</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" disabled={!dirty || saving} onClick={handleSave} className="flex-1">
              {saving ? 'Saving…' : dirty ? 'Save globally' : 'Saved'}
            </Button>
            <Button variant="outline" size="sm" disabled={saving} onClick={handleReset}>
              Reset to defaults
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
