/**
 * Admin → Geometry Lab → Shell / Global → Seat Cluster → Nameplate.
 *
 * Edits the global `shell_nameplate` config. Live preview happens in
 * this admin's session by writing the same `--shell-nameplate-*` CSS
 * vars that CanonicalSeatCluster reads. The footer **Apply Changes**
 * commits via the modal-wide draft pipeline (single `system_settings`
 * upsert), and the realtime channel pushes the new value to every
 * other client.
 *
 * Coordinate contract (mirrors shellNameplateConfig.ts):
 *   X negative = outward (away from felt center); positive = inward.
 *      Mirrored automatically by seat side at the renderer.
 *   Y negative = upward;     positive = downward.
 *   Units are normalized to the chip-circle DIAMETER, not viewport px.
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  applyShellNameplateCssVars,
  DEFAULT_SHELL_NAMEPLATE,
  getShellNameplateConfig,
  SHELL_NAMEPLATE_BOUNDS,
  SHELL_NAMEPLATE_KEY,
  type ShellNameplateConfig,
} from '@/lib/canonicalShell/shellNameplateConfig';

export function ShellNameplateAdminSection() {
  const { value: draft, setValue, reset, dirty } = useDomainDraft<ShellNameplateConfig>(
    SHELL_NAMEPLATE_KEY,
    DEFAULT_SHELL_NAMEPLATE,
  );

  // Live preview: write the same CSS vars the renderer reads. On
  // unmount, snap back to the committed authoritative snapshot so a
  // mid-edit close does not leak.
  useEffect(() => { applyShellNameplateCssVars(draft); }, [draft]);
  useEffect(() => {
    return () => { applyShellNameplateCssVars(getShellNameplateConfig()); };
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
          nameplate. Offsets are measured from the CENTER of the chip
          circle in units of its DIAMETER. <strong>X</strong>: positive
          = inward toward felt center (mirrored automatically by seat
          side). <strong>Y</strong>: positive = downward, negative =
          upward. <strong>Max Width</strong>: rendered text container
          width; longer names truncate with ellipsis. Click the modal
          footer <strong>Apply Changes</strong> to persist and broadcast.
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
          Reset section to defaults (x=0, y=0, maxW=
          {DEFAULT_SHELL_NAMEPLATE.maxWidthDia})
        </button>
      </div>
    </div>
  );
}
