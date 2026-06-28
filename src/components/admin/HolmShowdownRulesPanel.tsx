/**
 * Holm Geometry Lab — Showdown Rules → Opponent Exposed Cards.
 *
 * Mirrors the FINAL 3-5-7 v4 contract surface. Single flat row
 * (Holm has one showdown moment per hand and no irrelevant pair).
 *
 *   1. SHARED FELT PLACEMENT — attachment + sprawl + xPct/yPct of felt
 *   2. CARD GEOMETRY — sizing mode + aspect ratio
 *   3. ROW GEOMETRY — overlap + fanDegrees + fanArch
 */

import { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_HOLM_SHOWDOWN_RULES,
  HOLM_SHOWDOWN_RULES_DOMAIN_KEY,
  type CardGeometry,
  type HolmShowdownRulesState,
  type SizingMode,
} from '@/lib/holm/showdownConfig';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';

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
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
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
              onChange({
                mode: 'fixed',
                cardWidthPx: 'cardWidthPx' in value ? value.cardWidthPx : 40,
                aspectRatio: value.aspectRatio,
              });
            } else {
              onChange({
                mode: 'responsive',
                cardWidthPctOfFeltVmin:
                  'cardWidthPctOfFeltVmin' in value ? value.cardWidthPctOfFeltVmin : 11,
                aspectRatio: value.aspectRatio,
              });
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

export function HolmShowdownRulesPanel() {
  const { value, setValue, reset } = useDomainDraft<HolmShowdownRulesState>(
    HOLM_SHOWDOWN_RULES_DOMAIN_KEY,
    DEFAULT_HOLM_SHOWDOWN_RULES,
  );
  const state = value ?? DEFAULT_HOLM_SHOWDOWN_RULES;

  return (
    <div className="space-y-4 text-sm">
      <Section title="Shared felt placement">
        <Row label="Attachment">
          <Select
            value={state.placement.attachment}
            onValueChange={(v) =>
              setValue({
                ...state,
                placement: {
                  ...state.placement,
                  attachment: v as 'chip-centered' | 'inner-edge' | 'outer-edge',
                },
              })
            }
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chip-centered">chip-centered</SelectItem>
              <SelectItem value="inner-edge">inner-edge</SelectItem>
              <SelectItem value="outer-edge">outer-edge</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
          WHERE the row pins on the visible chip-disc rim. Same semantics
          as 3-5-7 — Holm does not redefine attachment.
        </p>
        <Row label="Sprawl direction">
          <Select
            value={state.placement.sprawlDirection}
            onValueChange={(v) =>
              setValue({
                ...state,
                placement: {
                  ...state.placement,
                  sprawlDirection: v as 'inward' | 'outward',
                },
              })
            }
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inward">inward (toward felt center)</SelectItem>
              <SelectItem value="outward">outward (toward table edge)</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="X offset (% of felt width, −outward / +inward)">
          <NumInput
            value={state.placement.xPctOfFelt}
            step={0.5}
            min={-50}
            max={50}
            onChange={(n) =>
              setValue({
                ...state,
                placement: { ...state.placement, xPctOfFelt: n },
              })
            }
          />
        </Row>
        <Row label="Y offset (% of felt height, +Y = down)">
          <NumInput
            value={state.placement.yPctOfFelt}
            step={0.5}
            onChange={(n) =>
              setValue({
                ...state,
                placement: { ...state.placement, yPctOfFelt: n },
              })
            }
          />
        </Row>
      </Section>

      <Section title="Card geometry">
        <CardEditor
          value={state.card}
          onChange={(card) => setValue({ ...state, card })}
        />
      </Section>

      <Section title="Row geometry">
        <Row label="Overlap (normalized ratio · fraction of card width)">
          <BufferedRatioInput
            value={state.row.overlap}
            min={-0.5}
            max={1}
            ariaLabel="Holm showdown row overlap"
            onCommit={(n) =>
              setValue({ ...state, row: { ...state.row, overlap: n } })
            }
          />
        </Row>
        <Row label="Total fan (degrees, first→last)">
          <NumInput
            value={state.row.fanDegrees}
            step={1}
            onChange={(n) =>
              setValue({ ...state, row: { ...state.row, fanDegrees: n } })
            }
          />
        </Row>
        <Row label="Fan arch">
          <Select
            value={state.row.fanArch}
            onValueChange={(v) =>
              setValue({
                ...state,
                row: { ...state.row, fanArch: v as 'outward' | 'inward' },
              })
            }
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
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
      </Section>

      <div className="flex justify-end pt-2 border-t">
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Reset section (draft only)
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Reset re-seeds this section's draft to baked defaults. Edits stage
        to the modal draft — use the shared <strong>Apply Changes</strong>{' '}
        footer to publish to all clients.
      </p>
    </div>
  );
}

export default HolmShowdownRulesPanel;
