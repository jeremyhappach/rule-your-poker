/**
 * Admin → Geometry Lab → Shell / Global → Seat Cluster → Chip Balance.
 *
 * Three controls — all percent-of-chip-circle-diameter:
 *   1. Maximum usable width  (hard fit envelope)
 *   2. Preferred font size
 *   3. Minimum font size
 *
 * The defaults are tuned so the -$999 stress case fits inside the
 * 40 px cluster chip disc without touching the rim on phones. Live
 * preview routes through `previewShellChipBalance(...)`; **Apply
 * Changes** commits via the shared draft pipeline and broadcasts to
 * every client.
 */
import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import { BufferedRatioInput } from './BufferedRatioInput';
import {
  DEFAULT_SHELL_CHIP_BALANCE,
  previewShellChipBalance,
  SHELL_CHIP_BALANCE_BOUNDS,
  SHELL_CHIP_BALANCE_KEY,
  type ShellChipBalanceConfig,
} from '@/lib/canonicalShell/shellChipBalanceConfig';

export function ShellChipBalanceAdminSection() {
  const { value: draft, setValue, reset, dirty } = useDomainDraft<ShellChipBalanceConfig>(
    SHELL_CHIP_BALANCE_KEY,
    DEFAULT_SHELL_CHIP_BALANCE,
  );

  useEffect(() => { previewShellChipBalance(draft); }, [draft]);
  useEffect(() => {
    return () => { previewShellChipBalance(null); };
  }, []);

  const setMaxW = (n: number) => setValue((d) => ({ ...d, maxWidthPct: n }));
  const setPref = (n: number) => setValue((d) => ({ ...d, prefSizePct: n }));
  const setMin = (n: number) => setValue((d) => ({ ...d, minSizePct: n }));

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">
          Chip Balance (Global)
          {dirty && <span className="ml-2 text-[10px] text-amber-500">(draft)</span>}
        </Label>
        <p className="text-xs text-muted-foreground">
          Global typography for the chip-circle balance text — applies
          everywhere a chip balance renders inside a chip disc (waiting,
          interstitial, gameplay, every game family). All three values
          are <strong>percentages of chip-circle diameter</strong>.
          Font size adapts per label: the largest size between min and
          preferred that fits the maximum usable width. Stress case for
          phone: <code>-$999</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Maximum usable width</Label>
          <BufferedRatioInput
            value={draft.maxWidthPct}
            min={SHELL_CHIP_BALANCE_BOUNDS.maxWidth.min}
            max={SHELL_CHIP_BALANCE_BOUNDS.maxWidth.max}
            unitLabel="× dia"
            onCommit={setMaxW}
            ariaLabel="Chip balance max width (chip-diameter ratio)"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Preferred font size</Label>
          <BufferedRatioInput
            value={draft.prefSizePct}
            min={SHELL_CHIP_BALANCE_BOUNDS.size.min}
            max={SHELL_CHIP_BALANCE_BOUNDS.size.max}
            unitLabel="× dia"
            onCommit={setPref}
            ariaLabel="Chip balance preferred font size (chip-diameter ratio)"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Minimum font size</Label>
          <BufferedRatioInput
            value={draft.minSizePct}
            min={SHELL_CHIP_BALANCE_BOUNDS.size.min}
            max={SHELL_CHIP_BALANCE_BOUNDS.size.max}
            unitLabel="× dia"
            onCommit={setMin}
            ariaLabel="Chip balance minimum font size (chip-diameter ratio)"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => reset()}
        >
          Reset to defaults (maxW={DEFAULT_SHELL_CHIP_BALANCE.maxWidthPct},
          pref={DEFAULT_SHELL_CHIP_BALANCE.prefSizePct},
          min={DEFAULT_SHELL_CHIP_BALANCE.minSizePct})
        </button>
      </div>
    </div>
  );
}
