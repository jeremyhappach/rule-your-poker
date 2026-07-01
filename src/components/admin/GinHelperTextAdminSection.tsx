/**
 * Geometry Lab — Gin → Gameplay Artifacts → Stock/Discard → Helper Text.
 *
 * Renders the coupling controls for the Gin helper text. Helper text is
 * a child of the stock pile; its only independent geometry is Placement
 * + Offset (% of resolved stock-pile card size). Edits stage into the
 * modal-wide draft; persistence + realtime echo runs through the
 * standard GeometryLabDraftProvider contract.
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
  GIN_HELPER_TEXT_DEFAULTS,
  GIN_HELPER_TEXT_KEY,
  type GinHelperTextPlacement,
  type GinHelperTextSettings,
} from '@/lib/ginRummy/helperTextSettings';

const PLACEMENTS: readonly GinHelperTextPlacement[] = [
  'Above',
  'Below',
  'Left',
  'Right',
];

export function GinHelperTextAdminSection() {
  const { value, setValue } = useDomainDraft<GinHelperTextSettings>(
    GIN_HELPER_TEXT_KEY,
    GIN_HELPER_TEXT_DEFAULTS,
  );

  const patch = (next: Partial<GinHelperTextSettings>) =>
    setValue({ ...value, ...next });

  return (
    <div className="space-y-3 pt-2 border-t">
      <h3 className="font-semibold">Helper Text</h3>
      <p className="text-[11px] text-muted-foreground">
        Helper text is a child of the stock pile. It follows Stock X/Y
        automatically — its only independent geometry is Placement and
        Offset. Applies to first-upcard instructions and normal
        stock/discard helper text.
      </p>

      <div className="space-y-1">
        <Label className="text-sm font-medium">Placement</Label>
        <Select
          value={value.placement}
          onValueChange={(v) => patch({ placement: v as GinHelperTextPlacement })}
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
        <p className="text-[11px] text-muted-foreground">
          Above/Below: horizontally center on stock pile.
          Left/Right: vertically center on stock pile.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-sm font-medium">Offset</Label>
          <BufferedRatioInput
            value={value.offsetPct}
            min={-1}
            max={1}
            ariaLabel="Helper text offset"
            onCommit={(n) => patch({ offsetPct: n })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fraction of the resolved stock-pile card size. Above/Below use
          card height; Left/Right use card width. Range [-1, 1].
        </p>
      </div>
    </div>
  );
}
