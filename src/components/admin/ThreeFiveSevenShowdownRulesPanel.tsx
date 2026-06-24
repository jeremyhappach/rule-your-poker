/**
 * 3-5-7 Geometry Lab — Showdown Rules → Opponent Exposed Cards.
 *
 * IA + control surface ONLY. No live showdown rendering changes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LIVE RENDERER CONTRACT (mirrored losslessly by this panel)
 * ─────────────────────────────────────────────────────────────────────────
 * Sources:
 *   - src/components/MobileGameTable.tsx :6969–7250
 *       Builds `cardsNode` (line 7175–7196) and hands it to
 *       CanonicalSeatCluster as `children`. No transform/offset applied
 *       at this layer.
 *   - src/lib/canonicalShell/CanonicalSeatCluster.tsx :672–747
 *       Wraps `children` in `[data-canonical-seat-below]` with
 *       `absolute top-full left-1/2 -translate-x-1/2 mt-[2px]`. This is
 *       the *only* anchor: bottom edge of the 40×40 chip cell, centered,
 *       with a 2 px vertical gap. There is no X/Y offset surface.
 *   - src/components/PlayerHand.tsx :596–727
 *       Three render branches:
 *         • Round 1 (3 cards) → default flex path (L701–L727).
 *           Static size: `w-10 h-16 sm:w-11 sm:h-[4.25rem]`
 *               = 40×64 px / 44×68 px (mobile / sm).
 *           Overlap: `-ml-1 first:ml-0` (4 px on mobile).
 *           Fan: inline `rotate((i*2) - (n-1))deg` → ±2°/card.
 *           Dynamic override: `useCardRowLayout({ aspect: 0.71,
 *               minCardWidth: 28, maxCardWidth: 80,
 *               maxOverlapRatio: 0.6 })`; defaults preferredOverlapRatio
 *               = 0.18. When it fires, it replaces width/height/overlap
 *               with px values resolved from the parent's clientWidth.
 *         • Round 2 (5 cards) and Round 3 (7 cards, main row) →
 *           multi-player showdown branch (L596–663).
 *           Static size: `w-8 h-12 sm:w-9 sm:h-14`
 *               = 32×48 px / 36×56 px (mobile / sm).
 *           Overlap: `-ml-3 first:ml-0` (12 px on mobile).
 *           Fan: ±2°/card.
 *           No dyn357 (composeStyle not called).
 *         • Round 3 irrelevant pair → same branch, unused row.
 *           Static size: `w-6 h-9 sm:w-7 sm:h-10`
 *               = 24×36 px / 28×40 px (mobile / sm).
 *           Overlap: `-ml-2 first:ml-0` (8 px on mobile).
 *           Inline `transform: scale(0.85)` and `opacity: 0.4`.
 *           `isDimmed={true}` adds `filter: grayscale(30%)` and
 *               another opacity:0.4 (stacked → effective 0.4).
 *           Inter-row gap: `gap-0.5` = 2 px between main and unused row.
 *           Position: derived from seat — bottom seats
 *               (`isBottomPosition`) stack unused ABOVE main; all other
 *               seats stack unused BELOW main.
 *           Secondary axis alignment: `self-end` for right-side seats,
 *               `self-start` for left-side seats.
 *
 * L/R seat mirroring:
 *   - Position derivation (above/below) keys on `isBottomPosition`
 *     (slots 0, 5, -1) — not L/R per se.
 *   - Cross-axis alignment keys on `isRightSide` (slots 3, 4, 5)
 *     vs left-side (slots 0, 1, 2). Tuning is mirrored automatically;
 *     no per-side knob exists in the live renderer.
 *
 * Concepts the live renderer does NOT have:
 *   - Anchor X/Y offsets (always 0/2px).
 *   - Percent-based card sizes (all values are px / Tailwind tiers).
 *   - Fan as a percentage (it's a fixed deg/card constant).
 *   - Exposure direction (cards face-up at showdown, no drop/orient).
 *   - Aspect-ratio constraint editor (R1 dyn aspect is a resolver
 *     parameter, not a card-instance attribute).
 *   - Free above/below/left/right placement for the irrelevant pair
 *     (live derives this from seat slot).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 3-5-7-SPECIFIC vs candidates for shared showdown primitives
 * ─────────────────────────────────────────────────────────────────────────
 *   3-5-7-specific:
 *     - dyn357 resolver params (aspect, minW, maxW, maxOverlapRatio,
 *       preferredOverlapRatio). Only R1 uses it today.
 *     - "Irrelevant pair" concept (round 3 only).
 *     - Per-round size tiers tied to Tailwind classes documented above.
 *
 *   Candidates for future shared showdown primitives:
 *     - Anchor model (belowChip with px gap) — likely reusable for any
 *       game that anchors showdown cards under the canonical seat
 *       cluster's chip cell.
 *     - Fan-as-deg-per-card with optional asymmetric step — generic.
 *     - Per-breakpoint px size tiers (mobile / sm) with optional pct
 *       fallback — generic.
 *     - Cross-axis alignment derived from seat side — generic.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STORAGE
 * ─────────────────────────────────────────────────────────────────────────
 * Persisted to localStorage under
 *   `geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v2`
 * Nothing in the live runtime reads this key yet — wiring to the
 * showdown renderer is a separate, explicit step.
 */

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_SHOWDOWN_RULES,
  LIVE_BASELINE,
  SEAT_BELOW_STATIC_GAP_PX,
  useRendererConsumedBelowChipGapPx,
  SHOWDOWN_RULES_STORAGE_KEY,
  loadShowdownRules,
  resolveShowdownRules,
  saveShowdownRules,
  useIsSmBreakpoint,
  useThreeFiveSevenShowdownConfig,
  type AnchorConfig,
  type AnchorKind,
  type CardSizePx,
  type DynResolverParams,
  type FanDegPerCard,
  type IrrelevantPairConfig,
  type OverlapPx,
  type RoundRowConfig,
  type ShowdownRulesState,
} from "@/lib/threeFiveSeven/showdownConfig";

// Re-export aliases retained to minimise churn in this file.
const DEFAULT_STATE = DEFAULT_SHOWDOWN_RULES;
const STORAGE_KEY = SHOWDOWN_RULES_STORAGE_KEY;
const loadState = loadShowdownRules;


// ─── UI primitives ────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="border rounded-md group/section">
      <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-sm flex items-center justify-between">
        <span>{title}</span>
        <span className="text-base leading-none text-muted-foreground group-[[open]]/section:hidden">
          +
        </span>
        <span className="text-base leading-none text-muted-foreground hidden group-[[open]]/section:inline">
          −
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}

function NumInput({
  value,
  step = 1,
  min,
  onChange,
}: {
  value: number;
  step?: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Input
      type="number"
      step={step}
      value={Number.isFinite(value) ? Number(value.toFixed(6)) : 0}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isFinite(n)) return;
        if (typeof min === "number" && n < min) return;
        onChange(n);
      }}
    />
  );
}

function BoolSelect({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Select
      value={value ? "yes" : "no"}
      onValueChange={(v) => onChange(v === "yes")}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">yes</SelectItem>
        <SelectItem value="no">no</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Row controls ─────────────────────────────────────────────────────────

function CardSizeControls({
  cfg,
  onChange,
}: {
  cfg: CardSizePx;
  onChange: (next: CardSizePx) => void;
}) {
  const patch = (p: Partial<CardSizePx>) => onChange({ ...cfg, ...p });
  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">
        Per-breakpoint px sizing. Mirrors Tailwind tiers like{" "}
        <code>w-8 h-12 sm:w-9 sm:h-14</code>.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Mobile width (px)</Label>
          <NumInput
            value={cfg.mobileWidthPx}
            min={1}
            onChange={(v) => patch({ mobileWidthPx: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Mobile height (px)</Label>
          <NumInput
            value={cfg.mobileHeightPx}
            min={1}
            onChange={(v) => patch({ mobileHeightPx: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>sm width (px)</Label>
          <NumInput
            value={cfg.smWidthPx}
            min={1}
            onChange={(v) => patch({ smWidthPx: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>sm height (px)</Label>
          <NumInput
            value={cfg.smHeightPx}
            min={1}
            onChange={(v) => patch({ smHeightPx: v })}
          />
        </div>
      </div>
    </div>
  );
}

function OverlapControls({
  cfg,
  onChange,
}: {
  cfg: OverlapPx;
  onChange: (next: OverlapPx) => void;
}) {
  const patch = (p: Partial<OverlapPx>) => onChange({ ...cfg, ...p });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>Overlap mobile (px)</Label>
        <NumInput
          value={cfg.mobilePx}
          min={0}
          onChange={(v) => patch({ mobilePx: v })}
        />
      </div>
      <div className="space-y-1">
        <Label>Overlap sm (px)</Label>
        <NumInput value={cfg.smPx} min={0} onChange={(v) => patch({ smPx: v })} />
      </div>
    </div>
  );
}

function FanControls({
  cfg,
  onChange,
}: {
  cfg: FanDegPerCard;
  onChange: (next: FanDegPerCard) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>Fan step (deg / card)</Label>
        <NumInput
          step={0.5}
          value={cfg.stepDeg}
          onChange={(v) => onChange({ stepDeg: v })}
        />
      </div>
    </div>
  );
}

function DynResolverControls({
  cfg,
  onChange,
}: {
  cfg: DynResolverParams;
  onChange: (next: DynResolverParams) => void;
}) {
  const patch = (p: Partial<DynResolverParams>) => onChange({ ...cfg, ...p });
  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">
        Round-1 only: <code>useCardRowLayout</code> overrides static size +
        overlap at runtime based on parent <code>clientWidth</code>.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Enabled</Label>
          <BoolSelect
            value={cfg.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Aspect (w/h)</Label>
          <NumInput
            step={0.01}
            value={cfg.aspect}
            min={0.01}
            onChange={(v) => patch({ aspect: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Min card width (px)</Label>
          <NumInput
            value={cfg.minCardWidth}
            min={1}
            onChange={(v) => patch({ minCardWidth: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Max card width (px)</Label>
          <NumInput
            value={cfg.maxCardWidth}
            min={1}
            onChange={(v) => patch({ maxCardWidth: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Max overlap ratio</Label>
          <NumInput
            step={0.01}
            value={cfg.maxOverlapRatio}
            min={0}
            onChange={(v) => patch({ maxOverlapRatio: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Preferred overlap ratio</Label>
          <NumInput
            step={0.01}
            value={cfg.preferredOverlapRatio}
            min={0}
            onChange={(v) => patch({ preferredOverlapRatio: v })}
          />
        </div>
      </div>
    </div>
  );
}

function RoundRowControls({
  cfg,
  showDyn,
  onChange,
}: {
  cfg: RoundRowConfig;
  showDyn: boolean;
  onChange: (next: RoundRowConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Anchor: <code>belowChip</code> (bottom edge of canonical chip
        cell, centered, <code>{`{anchor.belowChipGapPx}`}</code> px gap).
        Cross-axis alignment mirrors automatically off seat side
        (<code>self-end</code> right-side, <code>self-start</code> left-side).
        Cards are face-up; no exposure/drop concept.
      </p>
      <CardSizeControls
        cfg={cfg.size}
        onChange={(size) => onChange({ ...cfg, size })}
      />
      <OverlapControls
        cfg={cfg.overlap}
        onChange={(overlap) => onChange({ ...cfg, overlap })}
      />
      <FanControls cfg={cfg.fan} onChange={(fan) => onChange({ ...cfg, fan })} />
      {showDyn && (
        <DynResolverControls
          cfg={cfg.dyn}
          onChange={(dyn) => onChange({ ...cfg, dyn })}
        />
      )}
    </div>
  );
}

function IrrelevantPairControls({
  cfg,
  onChange,
}: {
  cfg: IrrelevantPairConfig;
  onChange: (next: IrrelevantPairConfig) => void;
}) {
  const patch = (p: Partial<IrrelevantPairConfig>) => onChange({ ...cfg, ...p });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Round-3 unused pair. Live position derivation: bottom-row seats
        stack the pair ABOVE the main row; all other seats stack it
        BELOW. Cross-axis alignment mirrors off seat side automatically.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Visible</Label>
          <BoolSelect
            value={cfg.visible}
            onChange={(v) => patch({ visible: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Dimmed (grayscale + opacity)</Label>
          <BoolSelect
            value={cfg.dimmed}
            onChange={(v) => patch({ dimmed: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Scale</Label>
          <NumInput
            step={0.01}
            value={cfg.scale}
            min={0.01}
            onChange={(v) => patch({ scale: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Opacity</Label>
          <NumInput
            step={0.05}
            value={cfg.opacity}
            min={0}
            onChange={(v) => patch({ opacity: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Grayscale (%)</Label>
          <NumInput
            value={cfg.grayscalePct}
            min={0}
            onChange={(v) => patch({ grayscalePct: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Inter-row gap (px)</Label>
          <NumInput
            value={cfg.interRowGapPx}
            min={0}
            onChange={(v) => patch({ interRowGapPx: v })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Position mode</Label>
        <Select
          value={cfg.positionMode}
          onValueChange={(v) =>
            patch({ positionMode: v as IrrelevantPairConfig["positionMode"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">auto (live; from seat)</SelectItem>
            <SelectItem value="above">above (override)</SelectItem>
            <SelectItem value="below">below (override)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CardSizeControls
        cfg={cfg.size}
        onChange={(size) => patch({ size })}
      />
      <OverlapControls
        cfg={cfg.overlap}
        onChange={(overlap) => patch({ overlap })}
      />
    </div>
  );
}

function AnchorControls({
  cfg,
  onChange,
}: {
  cfg: AnchorConfig;
  onChange: (next: AnchorConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Live anchor is always <code>belowChip</code>:{" "}
        <code>[data-canonical-seat-below]</code> at{" "}
        <code>top-full left-1/2 -translate-x-1/2 mt-[gapPx]</code>. No
        X/Y offset surface exists in the live renderer.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Anchor kind</Label>
          <Select value={cfg.kind} onValueChange={() => {}}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="belowChip">belowChip</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Below-chip gap (px)</Label>
          <NumInput
            value={cfg.belowChipGapPx}
            min={0}
            onChange={(v) => onChange({ ...cfg, belowChipGapPx: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Parity Audit ─────────────────────────────────────────────────────────
//
// Temporary collapsible panel: compares the frozen LIVE_BASELINE against
// the currently-resolved Lab values at the active breakpoint. Lives in
// the Geometry Lab only — never on the game table.

interface ParityRow {
  field: string;
  live: string | number | boolean;
  lab: string | number | boolean;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-6;
  }
  return a === b;
}

function buildRoundParityRows(
  prefix: string,
  liveResolved: { widthPx: number; heightPx: number; overlapPx: number; fanStepDeg: number; dyn: DynResolverParams },
  labResolved: { widthPx: number; heightPx: number; overlapPx: number; fanStepDeg: number; dyn: DynResolverParams },
): ParityRow[] {
  const rows: ParityRow[] = [
    { field: `${prefix}.widthPx`,    live: liveResolved.widthPx,    lab: labResolved.widthPx },
    { field: `${prefix}.heightPx`,   live: liveResolved.heightPx,   lab: labResolved.heightPx },
    { field: `${prefix}.overlapPx`,  live: liveResolved.overlapPx,  lab: labResolved.overlapPx },
    { field: `${prefix}.fanStepDeg`, live: liveResolved.fanStepDeg, lab: labResolved.fanStepDeg },
  ];
  if (prefix === 'three') {
    rows.push(
      { field: `${prefix}.dyn.enabled`,               live: liveResolved.dyn.enabled,               lab: labResolved.dyn.enabled },
      { field: `${prefix}.dyn.aspect`,                live: liveResolved.dyn.aspect,                lab: labResolved.dyn.aspect },
      { field: `${prefix}.dyn.minCardWidth`,          live: liveResolved.dyn.minCardWidth,          lab: labResolved.dyn.minCardWidth },
      { field: `${prefix}.dyn.maxCardWidth`,          live: liveResolved.dyn.maxCardWidth,          lab: labResolved.dyn.maxCardWidth },
      { field: `${prefix}.dyn.maxOverlapRatio`,       live: liveResolved.dyn.maxOverlapRatio,       lab: labResolved.dyn.maxOverlapRatio },
      { field: `${prefix}.dyn.preferredOverlapRatio`, live: liveResolved.dyn.preferredOverlapRatio, lab: labResolved.dyn.preferredOverlapRatio },
    );
  }
  return rows;
}

function ParityAuditPanel() {
  const lab = useThreeFiveSevenShowdownConfig();
  const isSm = useIsSmBreakpoint();
  const live = useMemo(() => resolveShowdownRules(LIVE_BASELINE, isSm), [isSm]);
  const resolved = useMemo(() => resolveShowdownRules(lab, isSm), [lab, isSm]);
  const rendererConsumedGap = useRendererConsumedBelowChipGapPx();
  const [copied, setCopied] = useState(false);

  const sections: { title: string; rows: ParityRow[] }[] = useMemo(() => {
    // Renderer-consumed anchor gap. Reflects the EFFECTIVE gap the
    // 3-5-7 opponent-showdown adapter actually applied to the DOM
    // (seat-below static 2 px + adapter translateY delta). When no
    // showdown adapter is currently mounted this falls back to the
    // resolved Lab value, which is what the next mount will apply.
    const rcGap = rendererConsumedGap ?? resolved.anchor.belowChipGapPx;
    const anchorRows: ParityRow[] = [
      { field: 'anchor.kind',           live: live.anchor.kind,           lab: resolved.anchor.kind },
      { field: 'anchor.belowChipGapPx (config)',           live: live.anchor.belowChipGapPx, lab: resolved.anchor.belowChipGapPx },
      { field: 'anchor.belowChipGapPx (renderer-consumed)', live: SEAT_BELOW_STATIC_GAP_PX, lab: rcGap },
    ];
    const irr = live.sevenIrrelevant;
    const irrLab = resolved.sevenIrrelevant;
    const irrelevantRows: ParityRow[] = [
      { field: 'sevenIrrelevant.visible',        live: irr.visible,        lab: irrLab.visible },
      { field: 'sevenIrrelevant.dimmed',         live: irr.dimmed,         lab: irrLab.dimmed },
      { field: 'sevenIrrelevant.scale',          live: irr.scale,          lab: irrLab.scale },
      { field: 'sevenIrrelevant.opacity',        live: irr.opacity,        lab: irrLab.opacity },
      { field: 'sevenIrrelevant.grayscalePct',   live: irr.grayscalePct,   lab: irrLab.grayscalePct },
      { field: 'sevenIrrelevant.interRowGapPx',  live: irr.interRowGapPx,  lab: irrLab.interRowGapPx },
      { field: 'sevenIrrelevant.widthPx',        live: irr.widthPx,        lab: irrLab.widthPx },
      { field: 'sevenIrrelevant.heightPx',       live: irr.heightPx,       lab: irrLab.heightPx },
      { field: 'sevenIrrelevant.overlapPx',      live: irr.overlapPx,      lab: irrLab.overlapPx },
      { field: 'sevenIrrelevant.positionMode',   live: irr.positionMode,   lab: irrLab.positionMode },
    ];
    return [
      { title: 'Anchor (shared)',    rows: anchorRows },
      { title: '3-card round',       rows: buildRoundParityRows('three', live.three, resolved.three) },
      { title: '5-card round',       rows: buildRoundParityRows('five',  live.five,  resolved.five)  },
      { title: '7-card main row',    rows: buildRoundParityRows('seven', live.seven, resolved.seven) },
      { title: '7-card irrelevant pair', rows: irrelevantRows },
    ];
  }, [live, resolved]);

  const buildReport = (): string => {
    const lines: string[] = [];
    lines.push('=== 3-5-7 Showdown Geometry — Parity Report ===');
    lines.push(`active breakpoint: ${resolved.breakpoint}`);
    lines.push(`viewport: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown'}`);
    lines.push(`timestamp: ${new Date().toISOString()}`);
    lines.push('');
    for (const s of sections) {
      lines.push(`-- ${s.title} --`);
      for (const r of s.rows) {
        const match = valuesEqual(r.live, r.lab) ? 'MATCH' : 'MISMATCH';
        lines.push(`  ${r.field.padEnd(40)} live=${String(r.live).padEnd(10)} lab=${String(r.lab).padEnd(10)} ${match}`);
      }
    }
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const txt = buildReport();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try { window.prompt('Copy parity report:', txt); } catch { /* */ }
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Compares the frozen pre-migration LIVE_BASELINE against the
        currently-resolved Lab values at the active Tailwind breakpoint
        (<code>{resolved.breakpoint}</code>). All rows should read MATCH
        at default values. Keep this panel in place until baseline parity
        is smoke-confirmed.
      </p>
      <div>
        <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
          {copied ? 'COPIED ✓' : 'COPY PARITY REPORT'}
        </Button>
      </div>
      {sections.map((s) => (
        <div key={s.title} className="rounded-md border p-2 space-y-1">
          <div className="font-semibold text-xs">{s.title}</div>
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal">field</th>
                <th className="text-left font-normal">live baseline</th>
                <th className="text-left font-normal">lab resolved</th>
                <th className="text-left font-normal">result</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => {
                const match = valuesEqual(r.live, r.lab);
                return (
                  <tr key={r.field}>
                    <td>{r.field}</td>
                    <td>{String(r.live)}</td>
                    <td>{String(r.lab)}</td>
                    <td className={match ? 'text-green-600' : 'text-red-600 font-semibold'}>
                      {match ? 'MATCH' : 'MISMATCH'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────

export function ThreeFiveSevenShowdownRulesPanel() {
  const [state, setState] = useState<ShowdownRulesState>(() => loadState());

  useEffect(() => {
    saveShowdownRules(state);
  }, [state]);

  const setRow =
    (key: "three" | "five" | "seven") => (next: RoundRowConfig) =>
      setState((s) => ({ ...s, [key]: next }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Controls exposed opponent cards during 3-5-7 showdown near the
        opponent seat cluster. Schema mirrors the live renderer
        (per-breakpoint px size, deg/card fan, dyn357 resolver for R1,
        seat-derived irrelevant-pair stacking). Live rendering is wired
        to these values via{" "}
        <code>src/lib/threeFiveSeven/showdownConfig.ts</code>. The
        Parity Audit section below should read MATCH on every row when
        defaults are untouched.
      </p>

      <CollapsibleSection title="Anchor (shared)">
        <AnchorControls
          cfg={state.anchor}
          onChange={(anchor) => setState((s) => ({ ...s, anchor }))}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Opponent Exposed Cards">
        <CollapsibleSection title="3-card round">
          <RoundRowControls
            cfg={state.three}
            showDyn
            onChange={setRow("three")}
          />
        </CollapsibleSection>

        <CollapsibleSection title="5-card round">
          <RoundRowControls
            cfg={state.five}
            showDyn={false}
            onChange={setRow("five")}
          />
        </CollapsibleSection>

        <CollapsibleSection title="7-card round">
          <RoundRowControls
            cfg={state.seven}
            showDyn={false}
            onChange={setRow("seven")}
          />
          <CollapsibleSection title="Irrelevant Pair">
            <IrrelevantPairControls
              cfg={state.sevenIrrelevant}
              onChange={(next) =>
                setState((s) => ({ ...s, sevenIrrelevant: next }))
              }
            />
          </CollapsibleSection>
        </CollapsibleSection>

        <CollapsibleSection title="Parity Audit (LIVE vs LAB)">
          <ParityAuditPanel />
        </CollapsibleSection>
      </CollapsibleSection>
    </div>
  );
}

