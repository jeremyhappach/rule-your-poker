/**
 * Geometry Lab — per-game "Active Player Settings → Hand Layout" panel.
 *
 * Renders the three policy controls for the selected game:
 *   - Preferred overlap %
 *   - Maximum adaptive overlap %
 *   - Minimum readable card size (px)
 *
 * Edits stage into the modal-wide draft; persistence + realtime echo
 * runs through the standard GeometryLabDraftProvider contract.
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
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Per-game active-hand resolver policy. Resolver starts at <em>Preferred
        overlap</em> and grows cards until they fit the hand-stage; if cards
        fall below <em>Minimum readable card size</em>, overlap escalates
        toward <em>Maximum adaptive overlap</em>. Locked per phase.
      </p>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Preferred overlap</Label>
          <BufferedRatioInput
            value={value.preferredOverlap}
            min={0}
            max={0.9}
            ariaLabel="Preferred overlap"
            onCommit={(n) => patch({ preferredOverlap: n })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Normalized to card width. e.g. <code>0.07</code> ≈ 7% of each card
          tucked under its neighbour. Range [0, 0.9].
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Maximum adaptive overlap</Label>
          <BufferedRatioInput
            value={value.maxOverlap}
            min={0}
            max={0.9}
            ariaLabel="Maximum adaptive overlap"
            onCommit={(n) => patch({ maxOverlap: n })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Hard ceiling. Resolver never exceeds this even when cards fall
          below the readable minimum.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Minimum readable card size</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={8}
              max={120}
              step={1}
              value={value.minCardWidthPx}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) patch({ minCardWidthPx: n });
              }}
              className="h-8 w-24 font-mono"
              aria-label="Minimum readable card width"
            />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              px
            </span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cards smaller than this trigger overlap escalation (up to the
          maximum). Range [8, 120].
        </p>
      </div>
    </div>
  );
}
