/**
 * Admin → Geometry Lab → Shell / Global → Seat Cluster → Nameplate.
 *
 * Five controls (in display order):
 *   1. Anchor Start          (upper / lower / inner / outer)
 *   2. Nameplate Attachment  (inner / center / outer)
 *   3. X Offset              (chip diameters, signed; +inward / −outward)
 *   4. Y Offset              (chip diameters, signed; +down / −up)
 *   5. Max Width             (chip diameters)
 *
 * Inner/outer mirror automatically by opponent seat side. Live preview
 * runs through `previewShellNameplate(...)` so every mounted
 * CanonicalSeatCluster updates in place via useSyncExternalStore. The
 * modal footer **Apply Changes** commits via the shared draft pipeline
 * (single `system_settings` upsert) and the realtime channel pushes
 * the value to every other client.
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  DEFAULT_SHELL_NAMEPLATE,
  previewShellNameplate,
  SHELL_NAMEPLATE_ANCHOR_OPTIONS,
  SHELL_NAMEPLATE_ATTACHMENT_OPTIONS,
  SHELL_NAMEPLATE_BOUNDS,
  SHELL_NAMEPLATE_KEY,
  type ShellNameplateAnchorStart,
  type ShellNameplateAttachment,
  type ShellNameplateConfig,
} from '@/lib/canonicalShell/shellNameplateConfig';
import { cn } from '@/lib/utils';

function SegmentedControl<T extends string>(props: {
  ariaLabel: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.ariaLabel}
      className="inline-flex overflow-hidden rounded-md border border-border bg-background"
    >
      {props.options.map((opt) => {
        const active = opt === props.value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => props.onChange(opt)}
            className={cn(
              'px-2 py-1 text-[11px] uppercase tracking-wide transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function ShellNameplateAdminSection() {
  const { value: draft, setValue, reset, dirty } = useDomainDraft<ShellNameplateConfig>(
    SHELL_NAMEPLATE_KEY,
    DEFAULT_SHELL_NAMEPLATE,
  );

  useEffect(() => { previewShellNameplate(draft); }, [draft]);
  useEffect(() => {
    return () => { previewShellNameplate(null); };
  }, []);

  const setAnchor = (v: ShellNameplateAnchorStart) =>
    setValue((d) => ({ ...d, anchorStart: v }));
  const setAttachment = (v: ShellNameplateAttachment) =>
    setValue((d) => ({ ...d, attachment: v }));
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
          nameplate. <strong>Anchor Start</strong> picks the reference
          point on the chip-circle perimeter (upper / lower / inner /
          outer). <strong>Attachment</strong> picks which horizontal
          point of the pill pins to that anchor (inner / center /
          outer). <strong>X / Y</strong> offsets are signed chip
          diameters. Inner / outer mirror automatically by seat side.
          Click <strong>Apply Changes</strong> to persist and broadcast.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Anchor Start</Label>
          <SegmentedControl<ShellNameplateAnchorStart>
            ariaLabel="Nameplate Anchor Start"
            options={SHELL_NAMEPLATE_ANCHOR_OPTIONS}
            value={draft.anchorStart}
            onChange={setAnchor}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Nameplate Attachment</Label>
          <SegmentedControl<ShellNameplateAttachment>
            ariaLabel="Nameplate Attachment"
            options={SHELL_NAMEPLATE_ATTACHMENT_OPTIONS}
            value={draft.attachment}
            onChange={setAttachment}
          />
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
          Reset to defaults (anchor={DEFAULT_SHELL_NAMEPLATE.anchorStart},
          attach={DEFAULT_SHELL_NAMEPLATE.attachment},
          x={DEFAULT_SHELL_NAMEPLATE.xOffsetDia},
          y={DEFAULT_SHELL_NAMEPLATE.yOffsetDia},
          maxW={DEFAULT_SHELL_NAMEPLATE.maxWidthDia})
        </button>
      </div>
    </div>
  );
}
