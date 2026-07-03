/**
 * Geometry Lab — Gin → Gameplay Artifacts → Stock/Discard → Stock Count.
 *
 * Renders coupling controls for the remaining-stock count. The count is
 * part of the stock/discard cluster assembly; its only independent
 * geometry is placement + gap (+ vertical trim for left-center only).
 * Edits stage into the modal-wide draft and propagate atomically on
 * Apply through GeometryLabDraftProvider.
 */

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BufferedRatioInput } from './BufferedRatioInput';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  GIN_STOCK_COUNT_DEFAULTS,
  GIN_STOCK_COUNT_KEY,
  type GinStockCountPlacement,
  type GinStockCountSettings,
} from '@/lib/ginRummy/stockCountSettings';

const PLACEMENTS: readonly GinStockCountPlacement[] = ['left-center', 'top-center'];

export function GinStockCountAdminSection() {
  const { value, setValue } = useDomainDraft<GinStockCountSettings>(
    GIN_STOCK_COUNT_KEY,
    GIN_STOCK_COUNT_DEFAULTS,
  );

  const patch = (next: Partial<GinStockCountSettings>) =>
    setValue({ ...value, ...next });

  const isLeftCenter = value.placement === 'left-center';

  return (
    <div className="space-y-3 pt-2 border-t">
      <h3 className="font-semibold">Stock Count</h3>
      <p className="text-[11px] text-muted-foreground">
        Count is part of the Stock + Discard cluster. It follows the
        cluster automatically — its only independent geometry is
        Placement, Gap, and (left-center only) a small Vertical Trim.
        Transport anchors and hit targets are unaffected.
      </p>

      <div className="space-y-1">
        <Label className="text-sm font-medium">Placement</Label>
        <Select
          value={value.placement}
          onValueChange={(v) => patch({ placement: v as GinStockCountPlacement })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLACEMENTS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Gap (px)</Label>
          <BufferedRatioInput
            value={value.gapPx}
            min={0}
            max={64}
            ariaLabel="Stock count gap"
            onCommit={(n) => patch({ gapPx: n })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Gap in pixels between the count and the stock card.
        </p>
      </div>

      {isLeftCenter && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-sm font-medium">Vertical trim (px)</Label>
            <BufferedRatioInput
              value={value.verticalTrimPx}
              min={-32}
              max={32}
              ariaLabel="Stock count vertical trim"
              onCommit={(n) => patch({ verticalTrimPx: n })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Left-center only. Nudges the count up (negative) or down
            (positive) relative to the stock card's vertical center.
          </p>
        </div>
      )}
    </div>
  );
}
