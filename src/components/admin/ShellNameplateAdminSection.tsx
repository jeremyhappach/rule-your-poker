/**
 * Admin → Geometry Lab → Shell / Global → Seat Cluster → Nameplate.
 *
 * Edits the global `shell_nameplate` config. Live preview happens in
 * this admin's session through `previewShellNameplate(...)` so the
 * draft propagates to every CanonicalSeatCluster mounted on the felt
 * via useSyncExternalStore. The footer **Apply Changes** commits via
 * the modal-wide draft pipeline (single `system_settings` upsert), and
 * the realtime channel pushes the new value to every other client.
 *
 * Controls (see shellNameplateConfig.ts for the full contract):
 *   - Vertical Chip Anchor:   Upper | Lower
 *   - Horizontal Chip Anchor: Outer | Center | Inner
 *   - X Offset (chip-DIAMETER ratio, +inward / -outward; mirrored)
 *   - Y Offset (chip-DIAMETER ratio, +down / -up)
 *   - Nameplate Max Width (chip-DIAMETER ratio)
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  DEFAULT_SHELL_NAMEPLATE,
  previewShellNameplate,
  SHELL_NAMEPLATE_BOUNDS,
  SHELL_NAMEPLATE_KEY,
  type ShellNameplateConfig,
  type ShellNameplateHAnchor,
  type ShellNameplateVAnchor,
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

  const setV = (v: ShellNameplateVAnchor) => setValue((d) => ({ ...d, vAnchor: v }));
  const setH = (h: ShellNameplateHAnchor) => setValue((d) => ({ ...d, hAnchor: h }));
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
          nameplate. The selected chip-edge anchor pins the matching
          nameplate edge at zero offset; signed X/Y then shift in
          chip-diameter units. <strong>Vertical Upper</strong>: name
          bottom edge tangent to chip top edge, grows upward.{' '}
          <strong>Vertical Lower</strong>: name top edge tangent to
          chip bottom edge, grows downward.{' '}
          <strong>Horizontal Outer</strong>: name inner edge tangent
          to chip's outer rim, grows outward.{' '}
          <strong>Horizontal Inner</strong>: name outer edge tangent
          to chip's inner rim, grows inward.{' '}
          <strong>Horizontal Center</strong>: name center on chip
          center. Inner/Outer mirror automatically per seat side.
          <strong> X</strong>: + inward / − outward.{' '}
          <strong>Y</strong>: + down / − up. Click the modal footer{' '}
          <strong>Apply Changes</strong> to persist and broadcast.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Vertical Chip Anchor</Label>
          <RadioGroup
            value={draft.vAnchor}
            onValueChange={(v) => setV(v as ShellNameplateVAnchor)}
            className="flex flex-row gap-3"
          >
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem value="upper" /> Upper
            </label>
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem value="lower" /> Lower
            </label>
          </RadioGroup>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Horizontal Chip Anchor</Label>
          <RadioGroup
            value={draft.hAnchor}
            onValueChange={(v) => setH(v as ShellNameplateHAnchor)}
            className="flex flex-row gap-3"
          >
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem value="outer" /> Outer
            </label>
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem value="center" /> Center
            </label>
            <label className="flex items-center gap-1 text-xs">
              <RadioGroupItem value="inner" /> Inner
            </label>
          </RadioGroup>
        </div>

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
          Reset section to defaults (v={DEFAULT_SHELL_NAMEPLATE.vAnchor},
          h={DEFAULT_SHELL_NAMEPLATE.hAnchor}, x={DEFAULT_SHELL_NAMEPLATE.xOffsetDia},
          y={DEFAULT_SHELL_NAMEPLATE.yOffsetDia}, maxW={DEFAULT_SHELL_NAMEPLATE.maxWidthDia})
        </button>
      </div>
    </div>
  );
}
