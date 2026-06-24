/**
 * 3-5-7 Geometry Lab — Showdown Rules → Opponent Exposed Cards.
 *
 * IA + control surface ONLY. No live showdown rendering changes.
 *
 * Values are persisted to localStorage under
 * `geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v1`
 * so editor state survives reloads. Nothing in the runtime reads this key
 * yet — wiring to actual showdown geometry is a separate task.
 *
 * Mirroring contract (defined here, not yet enforced by renderer):
 *   - Anchor: opponent chipstack center
 *   - Anchor edge: outer
 *     • left-side opponent  → row anchors from its LEFT outer edge
 *     • right-side opponent → row anchors from its RIGHT outer edge
 *   - The same X/Y/size/fan/exposure values mirror across L/R opponents.
 *     No separate left-seat vs right-seat tuning.
 */

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ExposureDirection = "inward" | "outward" | "upward" | "downward";
type IrrelevantPosition = "above" | "below" | "left" | "right";
type DerivedValue = "width" | "height" | "aspectRatio";

interface RoundRowConfig {
  xOffset: number;
  yOffset: number;
  sizeBase: number;
  widthPct: number;
  heightPct: number;
  aspectRatio: number;
  derivedValue: DerivedValue;
  fanPct: number;
  exposure: ExposureDirection;
}

interface IrrelevantPairConfig {
  visible: boolean;
  grayedOut: boolean;
  position: IrrelevantPosition;
  secondaryXOffset: number;
  secondaryYOffset: number;
}

interface ShowdownRulesState {
  three: RoundRowConfig;
  five: RoundRowConfig;
  seven: RoundRowConfig;
  sevenIrrelevant: IrrelevantPairConfig;
}

const MIN_DIM = 0.0001;

function recompute(cfg: RoundRowConfig): RoundRowConfig {
  const w = Math.max(MIN_DIM, cfg.widthPct);
  const h = Math.max(MIN_DIM, cfg.heightPct);
  const a = Math.max(MIN_DIM, cfg.aspectRatio);
  if (cfg.derivedValue === "height") {
    return { ...cfg, widthPct: w, aspectRatio: a, heightPct: w / a };
  }
  if (cfg.derivedValue === "width") {
    return { ...cfg, heightPct: h, aspectRatio: a, widthPct: h * a };
  }
  return { ...cfg, widthPct: w, heightPct: h, aspectRatio: w / h };
}

const DEFAULT_ROW: RoundRowConfig = recompute({
  xOffset: 0,
  yOffset: 0,
  sizeBase: 1,
  widthPct: 0.12,
  heightPct: 0.16,
  aspectRatio: 0.72,
  derivedValue: "height",
  fanPct: 0.5,
  exposure: "outward",
});

const DEFAULT_STATE: ShowdownRulesState = {
  three: { ...DEFAULT_ROW },
  five: { ...DEFAULT_ROW },
  seven: { ...DEFAULT_ROW },
  sevenIrrelevant: {
    visible: true,
    grayedOut: true,
    position: "below",
    secondaryXOffset: 0,
    secondaryYOffset: 0.05,
  },
};

const STORAGE_KEY =
  "geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v1";

function loadState(): ShowdownRulesState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      three: { ...DEFAULT_STATE.three, ...(parsed.three ?? {}) },
      five: { ...DEFAULT_STATE.five, ...(parsed.five ?? {}) },
      seven: { ...DEFAULT_STATE.seven, ...(parsed.seven ?? {}) },
      sevenIrrelevant: {
        ...DEFAULT_STATE.sevenIrrelevant,
        ...(parsed.sevenIrrelevant ?? {}),
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

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
        <span className="text-base leading-none text-muted-foreground group-[[open]]/section:hidden">+</span>
        <span className="text-base leading-none text-muted-foreground hidden group-[[open]]/section:inline">−</span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}


function NumInput({
  value,
  step = 0.01,
  onChange,
}: {
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

function RoundRowControls({
  cfg,
  onChange,
}: {
  cfg: RoundRowConfig;
  onChange: (next: RoundRowConfig) => void;
}) {
  const patch = (p: Partial<RoundRowConfig>) => onChange({ ...cfg, ...p });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Anchor: <code>opponent chipstack center</code> · Anchor edge:{" "}
        <code>outer</code> (left-opponent → left outer edge; right-opponent →
        right outer edge). Values mirror automatically across left/right
        opponents.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>X offset</Label>
          <NumInput value={cfg.xOffset} onChange={(v) => patch({ xOffset: v })} />
        </div>
        <div className="space-y-1">
          <Label>Y offset</Label>
          <NumInput value={cfg.yOffset} onChange={(v) => patch({ yOffset: v })} />
        </div>
        <div className="space-y-1">
          <Label>Size base</Label>
          <NumInput value={cfg.sizeBase} onChange={(v) => patch({ sizeBase: v })} />
        </div>
        <div className="space-y-1">
          <Label>Fan %</Label>
          <NumInput value={cfg.fanPct} onChange={(v) => patch({ fanPct: v })} />
        </div>
        <div className="space-y-1">
          <Label>Width</Label>
          <NumInput value={cfg.widthPct} onChange={(v) => patch({ widthPct: v })} />
        </div>
        <div className="space-y-1">
          <Label>Height</Label>
          <NumInput value={cfg.heightPct} onChange={(v) => patch({ heightPct: v })} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Aspect ratio</Label>
          <NumInput
            value={cfg.aspectRatio}
            onChange={(v) => patch({ aspectRatio: v })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Exposure direction</Label>
        <Select
          value={cfg.exposure}
          onValueChange={(v) => patch({ exposure: v as ExposureDirection })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inward">inward</SelectItem>
            <SelectItem value="outward">outward</SelectItem>
            <SelectItem value="upward">upward</SelectItem>
            <SelectItem value="downward">downward</SelectItem>
          </SelectContent>
        </Select>
      </div>
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

  const handlePositionChange = (next: IrrelevantPosition) => {
    // Default-reset the orthogonal offset when switching axis. Both offsets
    // remain editable afterward so an intentional override is still possible.
    if (next === "above" || next === "below") {
      patch({ position: next, secondaryXOffset: 0 });
    } else {
      patch({ position: next, secondaryYOffset: 0 });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Inherits main 5-card row's anchor, size base, width, height, aspect
        ratio, fan %, and exposure direction. Secondary offsets are relative
        to the main relevant-row anchor (not the opponent chipstack center).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Visible</Label>
          <Select
            value={cfg.visible ? "yes" : "no"}
            onValueChange={(v) => patch({ visible: v === "yes" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">yes</SelectItem>
              <SelectItem value="no">no</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Grayed out</Label>
          <Select
            value={cfg.grayedOut ? "yes" : "no"}
            onValueChange={(v) => patch({ grayedOut: v === "yes" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">yes</SelectItem>
              <SelectItem value="no">no</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Position</Label>
        <Select
          value={cfg.position}
          onValueChange={(v) => handlePositionChange(v as IrrelevantPosition)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="above">above</SelectItem>
            <SelectItem value="below">below</SelectItem>
            <SelectItem value="left">left</SelectItem>
            <SelectItem value="right">right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Secondary X offset</Label>
          <NumInput
            value={cfg.secondaryXOffset}
            onChange={(v) => patch({ secondaryXOffset: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>Secondary Y offset</Label>
          <NumInput
            value={cfg.secondaryYOffset}
            onChange={(v) => patch({ secondaryYOffset: v })}
          />
        </div>
      </div>
    </div>
  );
}

export function ThreeFiveSevenShowdownRulesPanel() {
  const [state, setState] = useState<ShowdownRulesState>(() => loadState());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const setRow =
    (key: "three" | "five" | "seven") => (next: RoundRowConfig) =>
      setState((s) => ({ ...s, [key]: next }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Controls exposed opponent cards during 3-5-7 showdown near the
        opponent seat cluster. IA only — live showdown rendering is not yet
        wired to these values.
      </p>

      <CollapsibleSection title="Opponent Exposed Cards">
        <CollapsibleSection title="3-card round">
          <RoundRowControls cfg={state.three} onChange={setRow("three")} />
        </CollapsibleSection>

        <CollapsibleSection title="5-card round">
          <RoundRowControls cfg={state.five} onChange={setRow("five")} />
        </CollapsibleSection>

        <CollapsibleSection title="7-card round">
          <RoundRowControls cfg={state.seven} onChange={setRow("seven")} />
          <CollapsibleSection title="Irrelevant Pair">
            <IrrelevantPairControls
              cfg={state.sevenIrrelevant}
              onChange={(next) =>
                setState((s) => ({ ...s, sevenIrrelevant: next }))
              }
            />
          </CollapsibleSection>
        </CollapsibleSection>
      </CollapsibleSection>
    </div>
  );
}
