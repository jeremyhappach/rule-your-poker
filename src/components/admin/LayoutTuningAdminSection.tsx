/**
 * Admin → Layout Tuning section.
 *
 * First-class, persistent layout tuning knob for the canonical shell.
 * NOT a debug instrument — lives in Admin Settings, not in the Debug Tray.
 *
 * Knob: PLAY VERTICAL RESERVE (0..40px, step 4)
 *   - Binds to CSS variable `--play-vertical-reserve` on :root (live, no reload).
 *   - Persists to localStorage('admin.playVerticalReserve').
 *   - Rehydrates on app boot (see useEffect in this component AND
 *     bootstrapLayoutTuning() called from main).
 *
 * Diagnostics derived from computed styles:
 *   Row 4 (pane) height, Play height, Felt height, Felt width, Aspect cap.
 */
import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const STORAGE_KEY = 'admin.playVerticalReserve';
const DEFAULT_PX = 20;
const MIN_PX = 0;
const MAX_PX = 40;
const STEP_PX = 4;

function clampStep(n: number): number {
  const c = Math.max(MIN_PX, Math.min(MAX_PX, n));
  return Math.round(c / STEP_PX) * STEP_PX;
}

export function readStoredPlayVerticalReserve(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_PX;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_PX;
    return clampStep(n);
  } catch {
    return DEFAULT_PX;
  }
}

function applyVar(px: number) {
  document.documentElement.style.setProperty('--play-vertical-reserve', `${px}px`);
}

/**
 * Call once from main.tsx to rehydrate the saved value before first render.
 * Safe to call repeatedly.
 */
export function bootstrapLayoutTuning() {
  applyVar(readStoredPlayVerticalReserve());
}

interface Diag {
  pane: number;
  topClear: number;
  bottomClear: number;
}

function readDiag(): Diag {
  const cs = getComputedStyle(document.documentElement);
  const parse = (name: string) => Number.parseFloat(cs.getPropertyValue(name)) || 0;
  const pane = parse('--hud-h-pane');
  const play = parse('--shell-play-h');
  const felt = parse('--shell-felt-h');
  const reserve = parse('--play-vertical-reserve');
  // Play assembly shifts down by reserve/2 from top of play region;
  // remaining space sits below the felt as bottom clearance.
  const topClear = reserve / 2;
  const bottomClear = Math.max(0, play - felt - reserve / 2);
  return { pane, topClear, bottomClear };
}

export function LayoutTuningAdminSection() {
  const [value, setValue] = useState<number>(() => readStoredPlayVerticalReserve());
  const [diag, setDiag] = useState<Diag>({ pane: 0, play: 0, felt: 0, feltW: 0, capActive: false });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    applyVar(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* noop */ }
  }, [value]);

  // Poll diagnostics ~4Hz while section is mounted.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setDiag(readDiag());
      timerRef.current = window.setTimeout(tick, 250) as unknown as number;
    };
    tick();
    return () => {
      alive = false;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="space-y-3 py-2 border-t border-border">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">Layout Tuning</Label>
        <p className="text-xs text-muted-foreground">
          First-class canonical shell tuning. Applies live and persists in this browser.
          Use to balance gameplay (felt + seat ring clearance) vs. the Active Content Pane.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="pvr-slider" className="text-sm">PLAY VERTICAL RESERVE</Label>
          <span className="font-mono text-base font-semibold">{value} px</span>
        </div>

        <Slider
          id="pvr-slider"
          min={MIN_PX}
          max={MAX_PX}
          step={STEP_PX}
          value={[value]}
          onValueChange={([v]) => setValue(clampStep(v))}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>0</span><span>20</span><span>40</span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={value === 0 ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setValue(0)}
          >
            MIN (0)
          </Button>
          <Button
            size="sm"
            variant={value === 20 ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setValue(20)}
          >
            RESET (20)
          </Button>
          <Button
            size="sm"
            variant={value === 40 ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setValue(40)}
          >
            MAX (40)
          </Button>
        </div>

        <div className="border-t border-border pt-3 space-y-1 font-mono text-xs">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Derived
          </div>
          <DiagRow label="Row 4 height" value={`${Math.round(diag.pane)} px`} />
          <DiagRow label="Play height" value={`${Math.round(diag.play)} px`} />
          <DiagRow label="Felt height" value={`${Math.round(diag.felt)} px`} />
          <DiagRow label="Felt width" value={`${Math.round(diag.feltW)} px`} />
          <DiagRow
            label="Aspect cap"
            value={diag.capActive ? 'ACTIVE' : 'FREE'}
            highlight={diag.capActive}
          />
          {diag.capActive && (
            <div className="mt-2 rounded bg-amber-600 px-2 py-1 text-center text-[11px] font-bold text-white tracking-wider">
              ASPECT CAP ACTIVE
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          Stored in this browser as <code>{STORAGE_KEY}</code>. Default 20.
          Affects every game (Holm, Cribbage, Gin, Yahtzee) uniformly; no per-game branching.
        </p>
      </div>
    </div>
  );
}

function DiagRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-amber-500' : 'font-semibold'}>{value}</span>
    </div>
  );
}
