/**
 * DealTimingAdminSection — Geometry Lab "Deal Timing" panel.
 *
 *   How things move.
 *
 * GLOBAL — values are written to `public.system_settings` and shared
 * across every player, observer, and device in realtime. NOT a
 * per-user preference. Edit requires admin role (enforced by RLS).
 *
 * Persistence contract:
 *   This panel edits the modal-wide draft only. Per-section Save/Reset
 *   buttons are forbidden — the footer **Apply Changes** is the only
 *   commit path. **Cancel / X** discards every section's draft.
 */

import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  DEAL_TIMING_BOUNDS,
  DEAL_TIMING_DEFAULTS,
  DEAL_TIMING_KEY,
  type DealTimingConfig,
  useDealTimingSnapshot,
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
  const liveSnapshot = useDealTimingSnapshot();
  const { value: draft, setValue, reset, dirty } = useDomainDraft<DealTimingConfig>(
    DEAL_TIMING_KEY,
    DEAL_TIMING_DEFAULTS,
  );

  return (
    <div className="space-y-3 py-2 border-t border-border">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">
          Deal Timing
          {dirty && <span className="ml-2 text-[10px] text-amber-500">(draft)</span>}
        </Label>
        <p className="text-xs text-muted-foreground">
          Geometry Lab values are shared globally. Edits stage to the modal
          draft — use the footer <strong>Apply Changes</strong> to commit
          to every player, observer, and device.
        </p>
        <div className="rounded border border-border bg-muted/40 px-2 py-1 text-[10px] font-mono text-muted-foreground">
          AUTH STORE v{liveSnapshot.storeVersion} · source={liveSnapshot.source} · updatedAt={liveSnapshot.updatedAt}<br />
          launch={liveSnapshot.launchSpacingMs} duration={liveSnapshot.durationMs} ownership={liveSnapshot.ownershipClaimDelayMs}
          {dirty ? ` · DRAFT launch=${draft.launchSpacingMs} duration=${draft.durationMs} ownership=${draft.ownershipClaimDelayMs}` : ''}
        </div>
      </div>

      <TimingRow
        label="Launch Spacing"
        description="Time between successive card launches."
        field="launchSpacingMs"
        value={draft.launchSpacingMs}
        onChange={(v) => setValue((d) => ({ ...d, launchSpacingMs: v }))}
      />
      <TimingRow
        label="Flight Duration"
        description="Per-card translate(0)→translate(dx,dy) flight time."
        field="durationMs"
        value={draft.durationMs}
        onChange={(v) => setValue((d) => ({ ...d, durationMs: v }))}
      />
      <TimingRow
        label="Ownership Claim Delay"
        description="Pause between transport arrival and destination claiming ownership (transport destroyed)."
        field="ownershipClaimDelayMs"
        value={draft.ownershipClaimDelayMs}
        onChange={(v) => setValue((d) => ({ ...d, ownershipClaimDelayMs: v }))}
      />

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Reset section (draft only)
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Reset re-seeds this section's draft to baked defaults. Nothing is
        persisted until you click <strong>Apply Changes</strong> in the modal footer.
      </p>
    </div>
  );
}
