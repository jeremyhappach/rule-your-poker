/**
 * Card Front Design Panel (Geometry Lab → Shell / Global).
 *
 * Edit face-density tiers (Small / Medium / Large) and per-deck-mode
 * (2-Color Face / 4-Color Face) policies. Live sample renders a real
 * PlayingCard primitive driven by the DRAFT (sample only). Apply
 * Changes commits to the shared system_settings row via the existing
 * GeometryLabDraftProvider → all clients update in place.
 *
 * Phase 1 scope: PlayingCard wiring only. CribbagePlayingCard /
 * MiniPlayingCard and corner+center / corner insets / center pips are
 * deferred.
 */

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDomainDraft } from '@/lib/geometryLab/GeometryLabDraftProvider';
import {
  CARD_FRONT_DESIGN_DOMAIN_KEY,
  DEFAULT_CARD_FRONT_DESIGN,
  resolveCardFrontStyle,
  type CardFrontDesignConfig,
  type CardFrontTierKey,
  type DeckFaceMode,
  type TwoColorFacePolicy,
  type FourColorFacePolicy,
} from '@/lib/cardFrontDesign/config';

const TIER_LABEL: Record<CardFrontTierKey, string> = {
  small: 'Small (opponent showdown)',
  medium: 'Medium (default tabled)',
  large: 'Large (active / community)',
};

function Num({
  value,
  step = 1,
  onChange,
}: {
  value: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <Input
      type="number"
      step={step}
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function CardFrontDesignPanel() {
  const { value: cfg, setValue } = useDomainDraft<CardFrontDesignConfig>(
    CARD_FRONT_DESIGN_DOMAIN_KEY,
    DEFAULT_CARD_FRONT_DESIGN,
  );
  const [tierKey, setTierKey] = useState<CardFrontTierKey>('small');
  const [deckMode, setDeckMode] = useState<DeckFaceMode>('two-color');

  const tier = cfg.tiers[tierKey];

  function updateTwo(patch: Partial<TwoColorFacePolicy>) {
    setValue((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tierKey]: {
          ...prev.tiers[tierKey],
          twoColor: { ...prev.tiers[tierKey].twoColor, ...patch },
        },
      },
    }));
  }
  function updateFour(patch: Partial<FourColorFacePolicy>) {
    setValue((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tierKey]: {
          ...prev.tiers[tierKey],
          fourColor: { ...prev.tiers[tierKey].fourColor, ...patch },
        },
      },
    }));
  }

  // Sample card dims (fixed preview size).
  const sampleW = 96;
  const sampleH = Math.round(sampleW * 1.4);
  const face = resolveCardFrontStyle(cfg, tierKey, deckMode, sampleW, sampleH);

  // Sample colors mirror PlayingCard runtime — 4-color uses a per-suit
  // bg, 2-color uses white with red/black text.
  const isFour = deckMode === 'four-color';
  const sampleBg = isFour ? '#1E90FF' : 'white'; // diamonds blue
  const sampleColor = isFour ? '#ffffff' : '#dc2626';

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Face-density tiers (Small / Medium / Large) control rank &amp; suit
        proportions inside the card face. They do NOT change card width,
        height, aspect, overlap, fan, or placement. Each tier carries
        independent 2-Color and 4-Color face policies.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Face-density tier</Label>
          <Select value={tierKey} onValueChange={(v) => setTierKey(v as CardFrontTierKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="small">{TIER_LABEL.small}</SelectItem>
              <SelectItem value="medium">{TIER_LABEL.medium}</SelectItem>
              <SelectItem value="large">{TIER_LABEL.large}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Face mode (sample)</Label>
          <Select value={deckMode} onValueChange={(v) => setDeckMode(v as DeckFaceMode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="two-color">2-Color Face (rank + suit)</SelectItem>
              <SelectItem value="four-color">4-Color Face (rank only)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Live sample — driven by DRAFT only. */}
      <div className="flex justify-center py-4 bg-muted/40 rounded">
        <div
          className="rounded border border-gray-300 shadow-xl flex flex-col items-center justify-center overflow-hidden"
          style={{ width: sampleW, height: sampleH, backgroundColor: sampleBg, color: sampleColor }}
        >
          <span style={face.rankStyle}>K</span>
          {face.renderSuit && face.suitStyle && (
            <span style={face.suitStyle}>♦</span>
          )}
        </div>
      </div>

      {/* Per-policy controls */}
      {deckMode === 'two-color' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Rank scale (% of card width)</Label>
            <Num value={tier.twoColor.rankScalePctOfCardWidth} step={1}
              onChange={(n) => updateTwo({ rankScalePctOfCardWidth: n })} />
          </div>
          <div className="space-y-1">
            <Label>Suit scale (% of card width)</Label>
            <Num value={tier.twoColor.suitScalePctOfCardWidth} step={1}
              onChange={(n) => updateTwo({ suitScalePctOfCardWidth: n })} />
          </div>
          <div className="space-y-1">
            <Label>Rank↔Suit gap (% of card height)</Label>
            <Num value={tier.twoColor.rankSuitGapPctOfCardHeight} step={0.1}
              onChange={(n) => updateTwo({ rankSuitGapPctOfCardHeight: n })} />

          </div>
          <div className="space-y-1">
            <Label>Group offset X (% of card width)</Label>
            <Num value={tier.twoColor.groupOffsetXPctOfCardWidth} step={0.5}
              onChange={(n) => updateTwo({ groupOffsetXPctOfCardWidth: n })} />
          </div>
          <div className="space-y-1">
            <Label>Group offset Y (% of card height)</Label>
            <Num value={tier.twoColor.groupOffsetYPctOfCardHeight} step={0.5}
              onChange={(n) => updateTwo({ groupOffsetYPctOfCardHeight: n })} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Rank scale (% of card width)</Label>
            <Num value={tier.fourColor.rankScalePctOfCardWidth} step={1}
              onChange={(n) => updateFour({ rankScalePctOfCardWidth: n })} />
          </div>
          <div className="space-y-1">
            <Label>Rank offset X (% of card width)</Label>
            <Num value={tier.fourColor.rankOffsetXPctOfCardWidth} step={0.5}
              onChange={(n) => updateFour({ rankOffsetXPctOfCardWidth: n })} />
          </div>
          <div className="space-y-1">
            <Label>Rank offset Y (% of card height)</Label>
            <Num value={tier.fourColor.rankOffsetYPctOfCardHeight} step={0.5}
              onChange={(n) => updateFour({ rankOffsetYPctOfCardHeight: n })} />
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Draft updates the sample only. Click <strong>Apply Changes</strong>{' '}
        in the modal footer to commit to all clients.
      </p>
    </div>
  );
}
