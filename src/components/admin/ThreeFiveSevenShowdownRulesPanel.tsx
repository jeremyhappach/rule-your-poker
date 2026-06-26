/**
 * 3-5-7 Geometry Lab — Showdown Rules → Opponent Exposed Cards (v4).
 *
 * Clean-slate v4 control surface. No parity bridge with v3.
 *
 * Three coordinate groups:
 *   1. SHARED FELT PLACEMENT (top)  — attachment + xPct/yPct of felt
 *   2. PER-ROUND GEOMETRY (R1/R2/R3) — card + row controls
 *   3. R3 SECONDARY GROUP             — visibility, placement, offsets, style
 *
 * Card-reveal / face state is GAME-RULE-OWNED. The `face-down`
 * visibility option here only restyles cards already classified
 * by game rules as the R3 irrelevant secondary group.
 */

import { useEffect, useRef, useState } from "react";
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
  SHOWDOWN_RULES_DOMAIN_KEY,
  type CardGeometry,
  type RoundGeometry,
  type RoundGeometryR3,
  type SecondaryGroupGeometry,
  type ShowdownRulesState,
  type SizingMode,
} from "@/lib/threeFiveSeven/showdownConfig";
import { useDomainDraft } from "@/lib/geometryLab/GeometryLabDraftProvider";

// ─── primitives ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border rounded-md" open>
      <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-sm">
        {title}
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}

/**
 * Controlled numeric input that preserves intermediate text such as
 * "-" or "" so typing a negative value is never silently rejected by
 * the controlled-input round-trip. Previously `onChange` did
 * `Number(e.target.value)` which returns NaN for "-", skipped
 * `setValue`, and React reconciled the DOM back to the last positive
 * value — clobbering the user's typed "-" before they could append a
 * digit. That was the proximate cause of "X does not accept negatives".
 */
function NumInput({
  value,
  step = 1,
  min,
  max,
  onChange,
}: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState<string>(() => String(value));
  const lastExternalRef = useRef<number>(value);
  useEffect(() => {
    if (value !== lastExternalRef.current) {
      lastExternalRef.current = value;
      const parsed = Number(text);
      if (!Number.isFinite(parsed) || parsed !== value) {
        setText(String(value));
      }
    }
  }, [value, text]);
  return (
    <Input
      type="number"
      value={text}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
        const n = Number(raw);
        if (Number.isFinite(n)) {
          lastExternalRef.current = n;
          onChange(n);
        }
      }}
      className="h-8 w-24"
    />
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ─── card geometry editor ────────────────────────────────────────────────

function CardEditor({
  value,
  onChange,
}: {
  value: CardGeometry;
  onChange: (next: CardGeometry) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="Sizing mode">
        <Select
          value={value.mode}
          onValueChange={(m) => {
            const mode = m as SizingMode;
            if (mode === 'fixed') {
              onChange({ mode: 'fixed', cardWidthPx: 'cardWidthPx' in value ? value.cardWidthPx : 40, aspectRatio: value.aspectRatio });
            } else {
              onChange({ mode: 'responsive', cardWidthPctOfFeltVmin: 'cardWidthPctOfFeltVmin' in value ? value.cardWidthPctOfFeltVmin : 14, aspectRatio: value.aspectRatio });
            }
          }}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">fixed (px)</SelectItem>
            <SelectItem value="responsive">responsive (% felt vmin)</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      {value.mode === 'fixed' ? (
        <Row label="Card width (px)">
          <NumInput
            value={value.cardWidthPx}
            min={1}
            onChange={(n) => onChange({ ...value, cardWidthPx: n })}
          />
        </Row>
      ) : (
        <Row label="Card width (% felt vmin)">
          <NumInput
            value={value.cardWidthPctOfFeltVmin}
            step={0.1}
            min={0}
            onChange={(n) => onChange({ ...value, cardWidthPctOfFeltVmin: n })}
          />
        </Row>
      )}
      <Row label="Aspect ratio (h / w)">
        <NumInput
          value={value.aspectRatio}
          step={0.05}
          min={0.1}
          onChange={(n) => onChange({ ...value, aspectRatio: n })}
        />
      </Row>
    </div>
  );
}

// ─── round editor ────────────────────────────────────────────────────────

function RoundEditor({
  value,
  onChange,
}: {
  value: RoundGeometry;
  onChange: (next: RoundGeometry) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Card geometry</div>
        <CardEditor value={value.card} onChange={(card) => onChange({ ...value, card })} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Row geometry</div>
        <Row label="Overlap (fraction of card width)">
          <NumInput
            value={value.row.overlap}
            step={0.05}
            min={0}
            max={1}
            onChange={(n) => onChange({ ...value, row: { ...value.row, overlap: n } })}
          />
        </Row>
        <Row label="Total fan (degrees, first→last)">
          <NumInput
            value={value.row.fanDegrees}
            step={1}
            onChange={(n) => onChange({ ...value, row: { ...value.row, fanDegrees: n } })}
          />
        </Row>
        <Row label="Fan arch">
          <Select
            value={value.row.fanArch}
            onValueChange={(v) =>
              onChange({ ...value, row: { ...value.row, fanArch: v as 'outward' | 'inward' } })
            }
          >
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="outward">outward (arch away from felt)</SelectItem>
              <SelectItem value="inward">inward (arch toward felt)</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Tilt/curvature only. Does NOT decide which card endpoint is
          pinned or which direction the row extends — that is owned by
          Attachment + Sprawl direction.
        </p>
      </div>
    </div>
  );
}


// ─── R3 secondary editor ─────────────────────────────────────────────────

function SecondaryEditor({
  value,
  onChange,
}: {
  value: SecondaryGroupGeometry;
  onChange: (next: SecondaryGroupGeometry) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="Visibility">
        <Select
          value={value.visibility}
          onValueChange={(v) => onChange({ ...value, visibility: v as SecondaryGroupGeometry['visibility'] })}
        >
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="hidden">hidden</SelectItem>
            <SelectItem value="dimmed">dimmed</SelectItem>
            <SelectItem value="face-down">face-down (style only)</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Placement">
        <Select
          value={value.placement}
          onValueChange={(v) => onChange({ ...value, placement: v as SecondaryGroupGeometry['placement'] })}
        >
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="above">above</SelectItem>
            <SelectItem value="below">below</SelectItem>
            <SelectItem value="left">left</SelectItem>
            <SelectItem value="right">right</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Offset along placement axis (%)">
        <NumInput
          value={value.offsetPrimaryPct}
          step={1}
          onChange={(n) => onChange({ ...value, offsetPrimaryPct: n })}
        />
      </Row>
      <Row label="Cross-axis drift (%)">
        <NumInput
          value={value.offsetCrossPct}
          step={1}
          onChange={(n) => onChange({ ...value, offsetCrossPct: n })}
        />
      </Row>
      <Row label="Scale">
        <NumInput value={value.scale} step={0.05} min={0.05} onChange={(n) => onChange({ ...value, scale: n })} />
      </Row>
      <Row label="Opacity">
        <NumInput value={value.opacity} step={0.05} min={0} max={1} onChange={(n) => onChange({ ...value, opacity: n })} />
      </Row>
      <Row label="Grayscale">
        <NumInput value={value.grayscale} step={0.05} min={0} max={1} onChange={(n) => onChange({ ...value, grayscale: n })} />
      </Row>
      <p className="text-[11px] text-muted-foreground leading-snug pt-1">
        Card-reveal / face state is game-rule-owned. <code>face-down</code> only
        restyles cards already classified as the R3 irrelevant secondary group.
      </p>
    </div>
  );
}

// ─── panel ───────────────────────────────────────────────────────────────

export function ThreeFiveSevenShowdownRulesPanel() {
  const { value, setValue, reset } = useDomainDraft<ShowdownRulesState>(SHOWDOWN_RULES_DOMAIN_KEY, DEFAULT_SHOWDOWN_RULES);
  const state = value ?? DEFAULT_SHOWDOWN_RULES;
  const [tab, setTab] = useState<'r1' | 'r2' | 'r3'>('r1');

  const patchRound = <K extends 'r1' | 'r2' | 'r3'>(k: K, next: K extends 'r3' ? RoundGeometryR3 : RoundGeometry) => {
    setValue({ ...state, rounds: { ...state.rounds, [k]: next } } as ShowdownRulesState);
  };

  return (
    <div className="space-y-4 text-sm">
      <Section title="Shared felt placement">
        <Row label="Attachment">
          <Select
            value={state.placement.attachment}
            onValueChange={(v) =>
              setValue({ ...state, placement: { ...state.placement, attachment: v as 'chip-centered' | 'inner-edge' | 'outer-edge' } })
            }
          >
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="chip-centered">chip-centered</SelectItem>
              <SelectItem value="inner-edge">inner-edge</SelectItem>
              <SelectItem value="outer-edge">outer-edge</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
          chip-centered: row centered on chip. outer-edge: row extends
          AWAY from the table (left seat → leftward, right seat →
          rightward). inner-edge: row extends TOWARD the table center
          (left seat → rightward, right seat → leftward).
        </p>
        <Row label="X offset (% of felt width, −outward / +inward)">
          <NumInput
            value={state.placement.xPctOfFelt}
            step={0.5}
            min={-50}
            max={50}
            onChange={(n) => setValue({ ...state, placement: { ...state.placement, xPctOfFelt: n } })}
          />
        </Row>
        <Row label="Y offset (% of felt height, +Y = down)">
          <NumInput
            value={state.placement.yPctOfFelt}
            step={0.5}
            onChange={(n) => setValue({ ...state, placement: { ...state.placement, yPctOfFelt: n } })}
          />
        </Row>
      </Section>


      <Section title="Per-round geometry">
        <div className="flex gap-1">
          {(['r1', 'r2', 'r3'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={tab === k ? 'default' : 'outline'}
              onClick={() => setTab(k)}
            >
              {k.toUpperCase()}
            </Button>
          ))}
        </div>
        {tab === 'r1' && (
          <RoundEditor
            value={state.rounds.r1}
            onChange={(next) => patchRound('r1', next)}
          />
        )}
        {tab === 'r2' && (
          <RoundEditor
            value={state.rounds.r2}
            onChange={(next) => patchRound('r2', next)}
          />
        )}
        {tab === 'r3' && (
          <>
            <RoundEditor
              value={state.rounds.r3}
              onChange={(next) => patchRound('r3', { ...next, secondary: state.rounds.r3.secondary })}
            />
            <div className="pt-2 border-t mt-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                R3 secondary group (irrelevant pair)
              </div>
              <SecondaryEditor
                value={state.rounds.r3.secondary}
                onChange={(secondary) =>
                  patchRound('r3', { ...state.rounds.r3, secondary })
                }
              />
            </div>
          </>
        )}
      </Section>

      <div className="flex gap-2 pt-2 border-t">
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Reset to defaults
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Edits stage to the modal draft. Use the shared <strong>Apply
        Changes</strong> footer to publish to all clients.
      </p>
    </div>
  );
}

export default ThreeFiveSevenShowdownRulesPanel;
