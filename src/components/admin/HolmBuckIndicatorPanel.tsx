/**
 * Admin → Geometry Lab → Holm → Chip Ring Artifacts → Buck.
 *
 * Two controls:
 *   1. X Offset (chip diameters, signed; +inward / −outward, mirrored per seat side)
 *   2. Y Offset (chip diameters, signed; +down / −up)
 *
 * Origin = center of the seat's canonical chip circle. Live preview
 * runs through `previewHolmBuck(...)` so the buck on the felt updates
 * in place. Apply Changes commits via the shared draft pipeline.
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  DEFAULT_HOLM_BUCK,
  HOLM_BUCK_BOUNDS,
  HOLM_BUCK_KEY,
  previewHolmBuck,
  type HolmBuckIndicatorConfig,
} from '@/lib/canonicalShell/holmBuckIndicatorConfig';

export function HolmBuckIndicatorPanel() {
  const { value: draft, setValue, reset, dirty } = useDomainDraft<HolmBuckIndicatorConfig>(
    HOLM_BUCK_KEY,
    DEFAULT_HOLM_BUCK,
  );

  useEffect(() => { previewHolmBuck(draft); }, [draft]);
  useEffect(() => {
    return () => { previewHolmBuck(null); };
  }, []);

  const setX = (n: number) => setValue((d) => ({ ...d, xOffsetDia: n }));
  const setY = (n: number) => setValue((d) => ({ ...d, yOffsetDia: n }));

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">
          Buck Indicator
          {dirty && <span className="ml-2 text-[10px] text-amber-500">(draft)</span>}
        </Label>
        <p className="text-xs text-muted-foreground">
          Position the Holm Buck relative to the seat's chip-circle
          center. <strong>X</strong>: positive = inward (toward table
          center), negative = outward — mirrored per seat side.
          <strong> Y</strong>: positive = down, negative = up. Units are
          chip diameters. Click <strong>Apply Changes</strong> to
          persist and broadcast.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Buck X Offset</Label>
          <BufferedRatioInput
            value={draft.xOffsetDia}
            min={HOLM_BUCK_BOUNDS.offset.min}
            max={HOLM_BUCK_BOUNDS.offset.max}
            unitLabel="× dia"
            onCommit={setX}
            ariaLabel="Buck X Offset (chip-diameter ratio, +inward / -outward)"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Buck Y Offset</Label>
          <BufferedRatioInput
            value={draft.yOffsetDia}
            min={HOLM_BUCK_BOUNDS.offset.min}
            max={HOLM_BUCK_BOUNDS.offset.max}
            unitLabel="× dia"
            onCommit={setY}
            ariaLabel="Buck Y Offset (chip-diameter ratio, +down / -up)"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => reset()}
        >
          Reset to defaults (x={DEFAULT_HOLM_BUCK.xOffsetDia}, y={DEFAULT_HOLM_BUCK.yOffsetDia})
        </button>
      </div>
    </div>
  );
}
