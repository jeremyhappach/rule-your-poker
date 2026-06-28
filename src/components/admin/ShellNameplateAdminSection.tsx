/**
 * Admin → Geometry Lab → Shell / Global → Seat Cluster → Nameplate.
 *
 * Edits the global `shell_nameplate` config. Coordinate origin is the
 * chip-circle CENTER and the vector points to the nameplate VISUAL
 * CENTER (see shellNameplateConfig.ts header). Live preview happens
 * in this admin's session through `previewShellNameplate(...)` so the
 * draft propagates to every CanonicalSeatCluster on the felt via
 * useSyncExternalStore. The footer **Apply Changes** commits via the
 * modal-wide draft pipeline (single `system_settings` upsert), and
 * the realtime channel pushes the new value to every other client.
 *
 * Controls:
 *   - X Offset      (chip-DIAMETER ratio, +inward / -outward; mirrored)
 *   - Y Offset      (chip-DIAMETER ratio, +down / -up)
 *   - Max Width     (chip-DIAMETER ratio)
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  DEFAULT_SHELL_NAMEPLATE,
  previewShellNameplate,
  SHELL_NAMEPLATE_BOUNDS,
  SHELL_NAMEPLATE_KEY,
  type ShellNameplateConfig,
} from '@/lib/canonicalShell/shellNameplateConfig';

export function ShellNameplateAdminSection() {
  const { value: draft, setValue, reset, dirty } = useDomainDraft<ShellNameplateConfig>(
    SHELL_NAMEPLATE_KEY,
    DEFAULT_SHELL_NAMEPLATE,
  );

  // Push draft into the live in-memory store for instant preview
  // across every mounted CanonicalSeatCluster. On unmount, clear the
  // preview so the committed snapshot is shown again.
  useEffect(() => { previewShellNameplate(draft); }, [draft]);
  useEffect(() => {
    return () => { previewShellNameplate(null); };
  }, []);

  const setX = (n: number) => setValue((d) => ({ ...d, xOffsetDia: n }));
  const setY = (n: number) => setValue((d) => ({ ...d, yOffsetDia: n }));
  const setW = (n: number) => setValue((d) => ({ ...d, maxWidthDia: n }));

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">
          Nameplate (Global)
          {dirty && <span className="ml-2 text-[10px] text-amber-500">(draft)</span>}
        </Label>
        <p className="text-xs text-muted-foreground">
          Global Shell defaults for the canonical opponent seat-cluster
          nameplate. Coordinate origin is the <strong>chip-circle
          center</strong>; the vector points to the <strong>nameplate
          visual center</strong>. At <strong>X = 0, Y = 0</strong> the
          nameplate sits directly over the chip center.{' '}
          <strong>X</strong>: + inward / − outward (mirrored both seat
          sides). <strong>Y</strong>: + down / − up. Units are chip
          diameters. Click the modal footer <strong>Apply Changes</strong>{' '}
          to persist and broadcast to every client.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Nameplate X Offset</Label>
          <BufferedRatioInput
            value={draft.xOffsetDia}
            min={SHELL_NAMEPLATE_BOUNDS.offset.min}
            max={SHELL_NAMEPLATE_BOUNDS.offset.max}
            unitLabel="× dia"
            onCommit={setX}
            ariaLabel="Nameplate X Offset (chip-diameter ratio, +inward / -outward)"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Nameplate Y Offset</Label>
          <BufferedRatioInput
            value={draft.yOffsetDia}
            min={SHELL_NAMEPLATE_BOUNDS.offset.min}
            max={SHELL_NAMEPLATE_BOUNDS.offset.max}
            unitLabel="× dia"
            onCommit={setY}
            ariaLabel="Nameplate Y Offset (chip-diameter ratio, +down / -up)"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Nameplate Max Width</Label>
          <BufferedRatioInput
            value={draft.maxWidthDia}
            min={SHELL_NAMEPLATE_BOUNDS.maxWidth.min}
            max={SHELL_NAMEPLATE_BOUNDS.maxWidth.max}
            unitLabel="× dia"
            onCommit={setW}
            ariaLabel="Nameplate Max Width (chip-diameter ratio)"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => reset()}
        >
          Reset section to defaults (x={DEFAULT_SHELL_NAMEPLATE.xOffsetDia},
          y={DEFAULT_SHELL_NAMEPLATE.yOffsetDia},
          maxW={DEFAULT_SHELL_NAMEPLATE.maxWidthDia})
        </button>
      </div>
    </div>
  );
}
