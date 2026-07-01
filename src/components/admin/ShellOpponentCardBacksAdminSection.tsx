/**
 * Admin → Geometry Lab → Shell / Global → Seat Cluster →
 * Opponent Card Backs.
 *
 * One control:
 *   1. Maximum Fan Span (% of chip-bubble width)
 *
 * Authored as a percentage; runtime pixels are the derived measurement
 * after the canonical chip bubble ([data-chip-center]) resolves at
 * render time. Live preview runs through
 * `previewShellOpponentCardBacks(...)` so every mounted
 * `ShellOpponentCardBacks` fan updates in place via useSyncExternalStore.
 * Apply Changes persists via the shared draft pipeline and the realtime
 * channel pushes the value to every other client.
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  DEFAULT_SHELL_OPPONENT_CARD_BACKS,
  previewShellOpponentCardBacks,
  SHELL_OPPONENT_CARD_BACKS_BOUNDS,
  SHELL_OPPONENT_CARD_BACKS_KEY,
  type ShellOpponentCardBacksConfig,
} from '@/lib/canonicalShell/shellOpponentCardBacksConfig';

export function ShellOpponentCardBacksAdminSection() {
  const { value: draft, setValue, reset, dirty } =
    useDomainDraft<ShellOpponentCardBacksConfig>(
      SHELL_OPPONENT_CARD_BACKS_KEY,
      DEFAULT_SHELL_OPPONENT_CARD_BACKS,
    );

  useEffect(() => {
    previewShellOpponentCardBacks(draft);
  }, [draft]);
  useEffect(() => {
    return () => {
      previewShellOpponentCardBacks(null);
    };
  }, []);

  const setMax = (n: number) =>
    setValue((d) => ({ ...d, maxFanSpanPct: n }));

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">
          Opponent Card Backs (Global)
          {dirty && (
            <span className="ml-2 text-[10px] text-amber-500">(draft)</span>
          )}
        </Label>
        <p className="text-xs text-muted-foreground">
          Global Shell default for every opponent card-back fan.{' '}
          <strong>Maximum Fan Span</strong> is authored as a percentage
          of the resolved chip-bubble width. Low card counts keep their
          natural spread; as the count rises the fan progressively
          tightens (overlap only — canonical card size is preserved) so
          the total footprint never exceeds this cap. Applies to all
          games (no per-game exceptions, no viewport-based constants).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Maximum Fan Span</Label>
          <BufferedRatioInput
            value={draft.maxFanSpanPct}
            min={SHELL_OPPONENT_CARD_BACKS_BOUNDS.maxFanSpanPct.min}
            max={SHELL_OPPONENT_CARD_BACKS_BOUNDS.maxFanSpanPct.max}
            unitLabel="% of chip"
            onCommit={setMax}
            ariaLabel="Opponent Card Backs Maximum Fan Span (% of chip-bubble width)"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => reset()}
        >
          Reset to defaults (maxFanSpan=
          {DEFAULT_SHELL_OPPONENT_CARD_BACKS.maxFanSpanPct}%)
        </button>
      </div>
    </div>
  );
}
