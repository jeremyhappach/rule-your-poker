/**
 * DealTimingAdminSection — Geometry Lab "Deal Timing" panel.
 *
 *   How things move.
 *
 * Controls the three motion knobs that shape ONE DEAL:
 *   - dealLaunchSpacingMs       (gap between launches)
 *   - dealDurationMs            (per-card flight time)
 *   - dealOwnershipClaimDelayMs (arrival → ownership claim → destroy)
 *
 * Persisted via localStorage in dealTimingStore. Live edits apply
 * to the NEXT deal — no reload required.
 */

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DEAL_TIMING_BOUNDS,
  DEAL_TIMING_DEFAULTS,
  resetDealTiming,
  setDealTiming,
  useDealTiming,
} from '@/lib/geometryLab/dealTimingStore';

interface RowProps {
  label: string;
  description: string;
  field: 'launchSpacingMs' | 'durationMs' | 'ownershipClaimDelayMs';
  value: number;
}

function TimingRow({ label, description, field, value }: RowProps) {
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
        onValueChange={([v]) => setDealTiming({ [field]: v } as Record<typeof field, number>)}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>{b.min}</span>
        <span>{def}</span>
        <span>{b.max}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={value === b.min ? 'default' : 'outline'} className="flex-1" onClick={() => setDealTiming({ [field]: b.min } as Record<typeof field, number>)}>
          MIN ({b.min})
        </Button>
        <Button size="sm" variant={value === def ? 'default' : 'outline'} className="flex-1" onClick={() => setDealTiming({ [field]: def } as Record<typeof field, number>)}>
          DEFAULT ({def})
        </Button>
        <Button size="sm" variant={value === b.max ? 'default' : 'outline'} className="flex-1" onClick={() => setDealTiming({ [field]: b.max } as Record<typeof field, number>)}>
          MAX ({b.max})
        </Button>
      </div>
    </div>
  );
}

export function DealTimingAdminSection() {
  const t = useDealTiming();
  return (
    <div className="space-y-3 py-2 border-t border-border">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">Deal Timing</Label>
        <p className="text-xs text-muted-foreground">
          Per-device tuning for how cards are dealt. Values persist in this
          browser only. Defaults aim for deliberate, smooth, obviously-dealt
          motion; max values approach Inspect Mode pacing for visual audit.
        </p>
      </div>

      <TimingRow
        label="Launch Spacing"
        description="Time between successive card launches."
        field="launchSpacingMs"
        value={t.launchSpacingMs}
      />
      <TimingRow
        label="Flight Duration"
        description="Per-card translate(0)→translate(dx,dy) flight time."
        field="durationMs"
        value={t.durationMs}
      />
      <TimingRow
        label="Ownership Claim Delay"
        description="Pause between transport arrival and destination claiming ownership (transport destroyed)."
        field="ownershipClaimDelayMs"
        value={t.ownershipClaimDelayMs}
      />

      <div className="flex">
        <Button variant="outline" size="sm" onClick={resetDealTiming}>
          Reset all to defaults
        </Button>
      </div>
    </div>
  );
}
