/**
 * DealTimingAdminSection — Geometry Lab "Deal Timing" panel.
 *
 *   How things move.
 *
 * GLOBAL — values are written to `public.system_settings` and shared
 * across every player, observer, and device in realtime. NOT a
 * per-user preference. Edit requires admin role (enforced by RLS).
 *
 * Pattern mirrors LayoutTuningAdminSection (safe areas): sliders edit
 * a local draft, "Save" upserts the row, and realtime broadcasts the
 * new values to every other client (including the caller).
 */

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  DEAL_TIMING_BOUNDS,
  DEAL_TIMING_DEFAULTS,
  type DealTimingConfig,
  saveDealTiming,
  resetDealTiming,
  useDealTiming,
} from '@/lib/geometryLab/dealTimingStore';

type Field = keyof DealTimingConfig;

interface RowProps {
  label: string;
  description: string;
  field: Field;
  value: number;
  onChange: (v: number) => void;
}

function TimingRow({ label, description, field, value, onChange }: RowProps) {
  const b = DEAL_TIMING_BOUNDS[field];
  const def = DEAL_TIMING_DEFAULTS[field];
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="font-mono text-base font-semibold">
          {value} ms
          {value !== def && (
            <span className="ml-2 text-[10px] text-amber-500">(default {def})</span>
          )}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Slider
        min={b.min}
        max={b.max}
        step={b.step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>{b.min}</span>
        <span>{def}</span>
        <span>{b.max}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={value === b.min ? 'default' : 'outline'} className="flex-1" onClick={() => onChange(b.min)}>
          MIN ({b.min})
        </Button>
        <Button size="sm" variant={value === def ? 'default' : 'outline'} className="flex-1" onClick={() => onChange(def)}>
          DEFAULT ({def})
        </Button>
        <Button size="sm" variant={value === b.max ? 'default' : 'outline'} className="flex-1" onClick={() => onChange(b.max)}>
          MAX ({b.max})
        </Button>
      </div>
    </div>
  );
}

export function DealTimingAdminSection() {
  const live = useDealTiming();
  const [draft, setDraft] = useState<DealTimingConfig>(live);
  const [saving, setSaving] = useState(false);

  // When the global authoritative value changes (realtime), snap the
  // draft to it ONLY if the admin has no unsaved edits. Otherwise leave
  // the dirty draft alone so the diff stays meaningful.
  useEffect(() => {
    setDraft((prev) => {
      const dirty =
        prev.launchSpacingMs !== live.launchSpacingMs
        || prev.durationMs !== live.durationMs
        || prev.ownershipClaimDelayMs !== live.ownershipClaimDelayMs;
      // First mount: prev === initial live snapshot, so treat as clean.
      return dirty ? prev : live;
    });
  }, [live]);

  const dirty =
    draft.launchSpacingMs !== live.launchSpacingMs
    || draft.durationMs !== live.durationMs
    || draft.ownershipClaimDelayMs !== live.ownershipClaimDelayMs;

  const handleSave = async () => {
    setSaving(true);
    const res = await saveDealTiming(draft);
    setSaving(false);
    if (res.ok) toast.success('Deal Timing saved globally');
    else toast.error(`Save failed: ${res.error}`);
  };

  const handleReset = async () => {
    setSaving(true);
    const res = await resetDealTiming();
    setSaving(false);
    if (res.ok) {
      setDraft({ ...DEAL_TIMING_DEFAULTS });
      toast.success('Deal Timing reset globally');
    } else {
      toast.error(`Reset failed: ${res.error}`);
    }
  };

  return (
    <div className="space-y-3 py-2 border-t border-border">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">Deal Timing</Label>
        <p className="text-xs text-muted-foreground">
          Geometry Lab values are shared globally and affect all players,
          observers, and devices in real time. Edits save to the canonical
          shell config — there is one table, one deal, one feel.
        </p>
      </div>

      <TimingRow
        label="Launch Spacing"
        description="Time between successive card launches."
        field="launchSpacingMs"
        value={draft.launchSpacingMs}
        onChange={(v) => setDraft((d) => ({ ...d, launchSpacingMs: v }))}
      />
      <TimingRow
        label="Flight Duration"
        description="Per-card translate(0)→translate(dx,dy) flight time."
        field="durationMs"
        value={draft.durationMs}
        onChange={(v) => setDraft((d) => ({ ...d, durationMs: v }))}
      />
      <TimingRow
        label="Ownership Claim Delay"
        description="Pause between transport arrival and destination claiming ownership (transport destroyed)."
        field="ownershipClaimDelayMs"
        value={draft.ownershipClaimDelayMs}
        onChange={(v) => setDraft((d) => ({ ...d, ownershipClaimDelayMs: v }))}
      />

      <div className="flex gap-2">
        <Button size="sm" disabled={!dirty || saving} onClick={handleSave} className="flex-1">
          {saving ? 'Saving…' : dirty ? 'Save globally' : 'Saved'}
        </Button>
        <Button variant="outline" size="sm" disabled={saving} onClick={handleReset}>
          Reset all to defaults
        </Button>
      </div>
    </div>
  );
}
