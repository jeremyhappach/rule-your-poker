/**
 * Admin → Layout Tuning section.
 *
 * Edits the GLOBAL Canonical Shell Layout config, not a per-user or
 * per-device preference. Sliders update the local DOM live for the
 * admin's session; pressing SAVE writes the values to
 * `system_settings.canonical_shell_layout` and every other client
 * (every user, every device, every game) receives them automatically
 * over realtime — no redeploy, no localStorage.
 *
 * Bound CSS variables:
 *   --play-top-safe-area
 *   --play-bottom-safe-area
 *
 * Donates pixels exclusively from HUD Row 4 (the active content pane).
 * Does not change felt, seat ring, chip anchors, spotlight, or any
 * other HUD row.
 */
import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  CANONICAL_SHELL_LAYOUT_BOUNDS,
  DEFAULT_CANONICAL_SHELL_LAYOUT,
  getCanonicalShellLayout,
  saveCanonicalShellLayout,
  subscribeCanonicalShellLayout,
} from '@/lib/canonicalShell/canonicalShellLayoutConfig';

const { min: MIN_PX, max: MAX_PX, step: STEP_PX } = CANONICAL_SHELL_LAYOUT_BOUNDS;

function clampStep(n: number): number {
  const c = Math.max(MIN_PX, Math.min(MAX_PX, n));
  return Math.round(c / STEP_PX) * STEP_PX;
}

function applyTopLive(px: number) {
  document.documentElement.style.setProperty('--play-top-safe-area', `${px}px`);
}
function applyBottomLive(px: number) {
  document.documentElement.style.setProperty('--play-bottom-safe-area', `${px}px`);
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
  const initial = getCanonicalShellLayout();
  const [top, setTop] = useState<number>(initial.playSafeTop);
  const [bottom, setBottom] = useState<number>(initial.playSafeBottom);
  // Saved baseline = last value written to (or fetched from) the DB.
  const [savedTop, setSavedTop] = useState<number>(initial.playSafeTop);
  const [savedBottom, setSavedBottom] = useState<number>(initial.playSafeBottom);
  const [saving, setSaving] = useState(false);
  const [diag, setDiag] = useState<Diag>({ pane: 0, topSafe: 0, bottomSafe: 0 });
  const timerRef = useRef<number | null>(null);

  // Track the global authoritative value (fetch + realtime updates).
  // When the global changes and the admin has no unsaved edits, snap
  // the sliders to it; otherwise just update the saved baseline so
  // the dirty diff stays meaningful.
  useEffect(() => {
    const unsub = subscribeCanonicalShellLayout((c) => {
      setSavedTop((prevSaved) => {
        setTop((prevTop) => (prevTop === prevSaved ? c.playSafeTop : prevTop));
        return c.playSafeTop;
      });
      setSavedBottom((prevSaved) => {
        setBottom((prevBot) => (prevBot === prevSaved ? c.playSafeBottom : prevBot));
        return c.playSafeBottom;
      });
    });
    return unsub;
  }, []);

  // Live preview for the admin's current session only.
  useEffect(() => { applyTopLive(top); }, [top]);
  useEffect(() => { applyBottomLive(bottom); }, [bottom]);

  // Diagnostic polling.
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

  const dirty = top !== savedTop || bottom !== savedBottom;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveCanonicalShellLayout({
        playSafeTop: top,
        playSafeBottom: bottom,
      });
      if (res.ok) {
        toast.success('Saved as global default');
      } else {
        toast.error(`Save failed: ${res.error}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setTop(savedTop);
    setBottom(savedBottom);
  };

  return (
    <div className="space-y-3 py-2 border-t border-border">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">Layout Tuning (Global)</Label>
        <p className="text-xs text-muted-foreground">
          Canonical shell-owned safe areas around the felt. Sliders preview
          live in this session. Press <strong>Save as global default</strong>{' '}
          to apply for every user, device, and game — no redeploy. Donates
          pixels exclusively from HUD Row 4 (active content pane); does not
          change felt, seat ring, chip anchors, or other HUD rows.
        </p>
      </div>

      {/* TOP SAFE AREA */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="top-safe-slider" className="text-sm">TOP SAFE AREA</Label>
          <span className="font-mono text-base font-semibold">
            {top} px
            {top !== savedTop && (
              <span className="ml-2 text-[10px] text-amber-500">(unsaved · saved {savedTop})</span>
            )}
          </span>
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
          <Button
            size="sm"
            variant={top === DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeTop ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setTop(DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeTop)}
          >
            DEFAULT ({DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeTop})
          </Button>
          <Button size="sm" variant={top === MAX_PX ? 'default' : 'outline'} className="flex-1" onClick={() => setTop(MAX_PX)}>
            MAX ({MAX_PX})
          </Button>
        </div>
      </div>

      {/* BOTTOM SAFE AREA */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="bottom-safe-slider" className="text-sm">BOTTOM SAFE AREA</Label>
          <span className="font-mono text-base font-semibold">
            {bottom} px
            {bottom !== savedBottom && (
              <span className="ml-2 text-[10px] text-amber-500">(unsaved · saved {savedBottom})</span>
            )}
          </span>
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
          <Button
            size="sm"
            variant={bottom === DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeBottom ? 'default' : 'outline'}
            className="flex-1"
            onClick={() => setBottom(DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeBottom)}
          >
            DEFAULT ({DEFAULT_CANONICAL_SHELL_LAYOUT.playSafeBottom})
          </Button>
          <Button size="sm" variant={bottom === MAX_PX ? 'default' : 'outline'} className="flex-1" onClick={() => setBottom(MAX_PX)}>
            MAX ({MAX_PX})
          </Button>
        </div>
      </div>

      {/* SAVE */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'SAVE AS GLOBAL DEFAULT'}
        </Button>
        <Button
          variant="outline"
          disabled={!dirty || saving}
          onClick={handleRevert}
        >
          Revert
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1 font-mono text-xs">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Derived (live)
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
