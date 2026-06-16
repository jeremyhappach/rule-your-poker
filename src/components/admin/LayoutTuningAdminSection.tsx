/**
 * Admin → Layout Tuning section.
 *
 * Two independent first-class layout knobs for the canonical shell:
 *
 *   TOP SAFE AREA    (0..40px, step 2)  —  empty clearance ABOVE the felt.
 *                                          Benefits top seat names + top
 *                                          seat artifacts. Persisted as
 *                                          localStorage('admin.playTopSafeArea').
 *                                          Bound to CSS var
 *                                          `--play-top-safe-area`.
 *
 *   BOTTOM SAFE AREA (0..40px, step 2)  —  empty clearance BELOW the felt.
 *                                          Benefits bottom seat card backs
 *                                          + bottom seat artifacts. Persisted
 *                                          as localStorage('admin.playBottomSafeArea').
 *                                          Bound to CSS var
 *                                          `--play-bottom-safe-area`.
 *
 * Neither knob changes:
 *   - felt size / felt position
 *   - seat ring
 *   - chip anchors
 *   - spotlight
 *   - announcement, timer, tab, or identity rows
 *
 * Both donate pixels exclusively from HUD Row 4 (the active content pane).
 */
import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const TOP_STORAGE_KEY = 'admin.playTopSafeArea';
const BOTTOM_STORAGE_KEY = 'admin.playBottomSafeArea';
const TOP_DEFAULT_PX = 24;
const BOTTOM_DEFAULT_PX = 12;
const MIN_PX = 0;
const MAX_PX = 40;
const STEP_PX = 2;

function clampStep(n: number): number {
  const c = Math.max(MIN_PX, Math.min(MAX_PX, n));
  return Math.round(c / STEP_PX) * STEP_PX;
}

function readStored(key: string, def: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return def;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return def;
    return clampStep(n);
  } catch {
    return def;
  }
}

export function readStoredPlayTopSafeArea(): number {
  return readStored(TOP_STORAGE_KEY, TOP_DEFAULT_PX);
}
export function readStoredPlayBottomSafeArea(): number {
  return readStored(BOTTOM_STORAGE_KEY, BOTTOM_DEFAULT_PX);
}

function applyTop(px: number) {
  document.documentElement.style.setProperty('--play-top-safe-area', `${px}px`);
}
function applyBottom(px: number) {
  document.documentElement.style.setProperty('--play-bottom-safe-area', `${px}px`);
}

/**
 * Call once from main.tsx to rehydrate the saved values before first render.
 * Safe to call repeatedly.
 */
export function bootstrapLayoutTuning() {
  applyTop(readStoredPlayTopSafeArea());
  applyBottom(readStoredPlayBottomSafeArea());
}

interface Diag {
  pane: number;
  topSafe: number;
  bottomSafe: number;
}

function readDiag(): Diag {
  const cs = getComputedStyle(document.documentElement);
  const parse = (name: string) => Number.parseFloat(cs.getPropertyValue(name)) || 0;
  return {
    pane: parse('--hud-h-pane'),
    topSafe: parse('--play-top-safe-area'),
    bottomSafe: parse('--play-bottom-safe-area'),
  };
}

export function LayoutTuningAdminSection() {
  const [top, setTop] = useState<number>(() => readStoredPlayTopSafeArea());
  const [bottom, setBottom] = useState<number>(() => readStoredPlayBottomSafeArea());
  const [diag, setDiag] = useState<Diag>({ pane: 0, topSafe: 0, bottomSafe: 0 });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    applyTop(top);
    try { localStorage.setItem(TOP_STORAGE_KEY, String(top)); } catch { /* noop */ }
  }, [top]);

  useEffect(() => {
    applyBottom(bottom);
    try { localStorage.setItem(BOTTOM_STORAGE_KEY, String(bottom)); } catch { /* noop */ }
  }, [bottom]);

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
          Independent top/bottom safe areas around the felt. Both donate pixels
          exclusively from HUD Row 4 (the active content pane). Neither changes
          felt, seat ring, chip anchors, spotlight, or any HUD row except Row 4.
          Applies live and persists in this browser.
        </p>
      </div>

      {/* TOP SAFE AREA */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="top-safe-slider" className="text-sm">TOP SAFE AREA</Label>
          <span className="font-mono text-base font-semibold">{top} px</span>
        </div>
        <Slider
          id="top-safe-slider"
          min={MIN_PX}
          max={MAX_PX}
          step={STEP_PX}
          value={[top]}
          onValueChange={([v]) => setTop(clampStep(v))}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>0</span><span>20</span><span>40</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={top === 0 ? 'default' : 'outline'} className="flex-1" onClick={() => setTop(0)}>
            MIN (0)
          </Button>
          <Button size="sm" variant={top === TOP_DEFAULT_PX ? 'default' : 'outline'} className="flex-1" onClick={() => setTop(TOP_DEFAULT_PX)}>
            RESET ({TOP_DEFAULT_PX})
          </Button>
          <Button size="sm" variant={top === MAX_PX ? 'default' : 'outline'} className="flex-1" onClick={() => setTop(MAX_PX)}>
            MAX ({MAX_PX})
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Stored as <code>{TOP_STORAGE_KEY}</code>. Benefits top seat names + artifacts.
        </p>
      </div>

      {/* BOTTOM SAFE AREA */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="bottom-safe-slider" className="text-sm">BOTTOM SAFE AREA</Label>
          <span className="font-mono text-base font-semibold">{bottom} px</span>
        </div>
        <Slider
          id="bottom-safe-slider"
          min={MIN_PX}
          max={MAX_PX}
          step={STEP_PX}
          value={[bottom]}
          onValueChange={([v]) => setBottom(clampStep(v))}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>0</span><span>20</span><span>40</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={bottom === 0 ? 'default' : 'outline'} className="flex-1" onClick={() => setBottom(0)}>
            MIN (0)
          </Button>
          <Button size="sm" variant={bottom === BOTTOM_DEFAULT_PX ? 'default' : 'outline'} className="flex-1" onClick={() => setBottom(BOTTOM_DEFAULT_PX)}>
            RESET ({BOTTOM_DEFAULT_PX})
          </Button>
          <Button size="sm" variant={bottom === MAX_PX ? 'default' : 'outline'} className="flex-1" onClick={() => setBottom(MAX_PX)}>
            MAX ({MAX_PX})
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Stored as <code>{BOTTOM_STORAGE_KEY}</code>. Benefits bottom seat card backs + artifacts.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 font-mono text-xs">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Derived
        </div>
        <DiagRow label="Top safe area" value={`${Math.round(diag.topSafe)} px`} />
        <DiagRow label="Bottom safe area" value={`${Math.round(diag.bottomSafe)} px`} />
        <DiagRow label="Row 4 height" value={`${Math.round(diag.pane)} px`} />
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
