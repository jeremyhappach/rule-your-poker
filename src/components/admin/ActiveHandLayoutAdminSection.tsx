/**
 * Geometry Lab — per-game "Active Player Settings → Hand Layout" panel.
 *
 * Exposes the full v2 `ActiveHandLayoutPolicy` for the selected game:
 *   Composition:
 *     - Preferred overlap %
 *     - Maximum adaptive overlap %
 *     - Minimum readable card size (px)
 *     - Baseline fan arch (deg)
 *   Pane-relative sizing:
 *     - Max stage width % of pane
 *     - Max stage height % of pane
 *     - Reserved lower-zone % of pane
 *     - Inter-zone clearance % of pane
 *   Card scale within stage:
 *     - Preferred card scale % of stage
 *     - Maximum card scale % of stage
 *
 * Edits stage into the modal-wide draft; persistence + realtime echo
 * flow through the standard GeometryLabDraftProvider contract, so
 * mounted `<ActiveHandFan/>` consumers update immediately on Apply and
 * on remote realtime updates.
 */

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { BufferedRatioInput } from './BufferedRatioInput';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  getActiveHandLayoutSpec,
  type ActiveHandLayoutPolicy,
} from '@/lib/activeHand/activeHandLayoutSettings';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';

interface RatioFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onCommit: (n: number) => void;
  help?: string;
}

function RatioField({ label, value, min = 0, max = 1, onCommit, help }: RatioFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        <BufferedRatioInput
          value={value}
          min={min}
          max={max}
          ariaLabel={label}
          onCommit={onCommit}
        />
      </div>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onCommit: (n: number) => void;
  help?: string;
}

function NumberField({ label, value, min, max, step = 1, unit, onCommit, help }: NumberFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onCommit(n);
            }}
            className="h-8 w-24 font-mono"
            aria-label={label}
          />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {unit}
          </span>
        </div>
      </div>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

export function ActiveHandLayoutAdminSection({ game }: { game: GameKey }) {
  const spec = getActiveHandLayoutSpec(game);
  if (!spec) {
    return (
      <p className="text-xs text-muted-foreground">
        No active-hand layout policy registered for this game.
      </p>
    );
  }
  const { value, setValue } = useDomainDraft<ActiveHandLayoutPolicy>(
    spec.key,
    spec.defaults,
  );

  const patch = (next: Partial<ActiveHandLayoutPolicy>) =>
    setValue({ ...value, ...next });

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted-foreground">
        Canonical Active Player Hand policy. The pane / shell measures the
        full active pane and renders the lower action / instruction / identity
        zone as a sibling. This policy resolves the CARD STAGE inside that
        pane and the card composition inside the stage. Locked per phase.
      </p>

      <fieldset className="space-y-3 border-t border-border/40 pt-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pane-relative sizing
        </legend>
        <RatioField
          label="Max stage width % of pane"
          value={value.maxWidthPctOfPane}
          min={0.1}
          onCommit={(n) => patch({ maxWidthPctOfPane: n })}
          help="Upper bound on the card stage horizontal footprint."
        />
        <RatioField
          label="Max stage height % of pane"
          value={value.maxHeightPctOfPane}
          min={0.1}
          onCommit={(n) => patch({ maxHeightPctOfPane: n })}
          help="Upper bound on the card stage vertical footprint before reservations apply."
        />
        <RatioField
          label="Reserved lower-zone % of pane"
          value={value.reservedLowerZonePctOfPane}
          max={0.9}
          onCommit={(n) => patch({ reservedLowerZonePctOfPane: n })}
          help="Vertical share of the pane reserved for the pane's own action / instruction / identity content."
        />
        <RatioField
          label="Inter-zone clearance % of pane"
          value={value.interZoneClearancePctOfPane}
          max={0.5}
          onCommit={(n) => patch({ interZoneClearancePctOfPane: n })}
          help="Breathing room between the resolved hand stage and the lower zone."
        />
      </fieldset>

      <fieldset className="space-y-3 border-t border-border/40 pt-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stage vertical placement
        </legend>
        <RatioField
          label="Stage top inset % of pane"
          value={value.stageTopInsetPctOfPane}
          max={0.9}
          onCommit={(n) => patch({ stageTopInsetPctOfPane: n })}
          help="Pushes the whole hand-stage DOWN from the top of the pane by this fraction of pane height. Does NOT change card size."
        />
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-sm font-medium">Fan alignment within stage</Label>
            <select
              className="h-8 rounded border border-input bg-background px-2 text-xs font-mono"
              value={value.stageVerticalAlignment}
              onChange={(e) =>
                patch({
                  stageVerticalAlignment: e.target.value as
                    | 'top'
                    | 'center'
                    | 'bottom',
                })
              }
              aria-label="Fan alignment within stage"
            >
              <option value="bottom">bottom (legacy)</option>
              <option value="center">center</option>
              <option value="top">top (raise hand)</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Vertical anchor of the fan inside the resolved stage rect.
            'top' raises the hand upward without resizing cards.
          </p>
        </div>
        <RatioField
          label="Content Y offset % of stage"
          value={value.contentYOffsetPctOfStage}
          min={-0.5}
          max={0.5}
          onCommit={(n) => patch({ contentYOffsetPctOfStage: n })}
          help="Final signed Y trim inside the stage. Positive = down, negative = up."
        />
      </fieldset>


      <fieldset className="space-y-3 border-t border-border/40 pt-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Card scale within stage
        </legend>
        <RatioField
          label="Preferred card scale % of stage"
          value={value.preferredCardScalePctOfStage}
          min={0.02}
          onCommit={(n) => patch({ preferredCardScalePctOfStage: n })}
          help="Preferred card width as % of the resolved stage width. Resolver picks the largest card that fits at this scale, capacity, and aspect."
        />
        <RatioField
          label="Maximum card scale % of stage"
          value={value.maxCardScalePctOfStage}
          min={0.02}
          onCommit={(n) => patch({ maxCardScalePctOfStage: n })}
          help="Hard ceiling — cards never exceed this fraction of the stage width regardless of remaining space."
        />
      </fieldset>

      <fieldset className="space-y-3 border-t border-border/40 pt-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Composition
        </legend>
        <RatioField
          label="Preferred overlap"
          value={value.preferredOverlap}
          max={0.9}
          onCommit={(n) =>
            patch({ preferredOverlap: n, baselineOverlapPct: n })
          }
          help="Baseline overlap as a fraction of card width. e.g. 0.07 ≈ 7% tucked under each neighbour."
        />
        <RatioField
          label="Maximum adaptive overlap"
          value={value.maxOverlap}
          max={0.9}
          onCommit={(n) => patch({ maxOverlap: n, maxAdaptiveOverlapPct: n })}
          help="Hard overlap ceiling used only when containment requires it."
        />
        <NumberField
          label="Baseline fan arch"
          value={value.baselineFanArchDeg}
          min={0}
          max={45}
          step={0.5}
          unit="deg"
          onCommit={(n) => patch({ baselineFanArchDeg: n })}
          help="Angular spread between the leftmost and rightmost cards."
        />
        <NumberField
          label="Minimum readable card size"
          value={value.minCardWidthPx}
          min={8}
          max={120}
          unit="px"
          onCommit={(n) => patch({ minCardWidthPx: n })}
          help="Cards smaller than this trigger overlap escalation up to the maximum."
        />
      </fieldset>
    </div>
  );
}
