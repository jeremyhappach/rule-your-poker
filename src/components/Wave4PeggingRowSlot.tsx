/**
 * Wave 5D — PeggingRow Anchored Migration.
 *
 * Pure consumer of the anchored `cribbage.peggingRow` placement from
 * CribbageGameplayGeometryProvider. The row rect is authoritative:
 * cards and badge adapt to the rect, the rect never shrinks for them.
 *
 * Layout philosophy:
 *   row rect → card size → card overlap → badge size → animations
 *
 * The slot mounts OUTSIDE the `translateY(6%)` felt-content wrapper
 * (see WAVE 5 INVARIANT in Wave4CribCutGroupSlot — anchored artifacts
 * MUST NOT mount beneath transformed ancestors). It installs both:
 *   - useDomBoundsContract → wave5:contract_violation on overflow
 *   - center-drift assertion → wave5d:peggingRow center-drift warn
 */

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";
import { useCanonicalFeltOverflowFrameElement } from "@/lib/canonicalShell/useCanonicalFeltOverflowFrameElement";
import { resolvePeggingFanLayout } from "@/lib/cribbage/peggingFanLayout";
import type { CribbagePhase } from "@/lib/cribbage/cribbageArtifactDescriptors";
import type { CribbageCard } from "@/lib/cribbageTypes";
import { CribbagePlayingCard } from "./CribbagePlayingCard";

export interface PeggingRowPlayedCard {
  card: CribbageCard;
  /** Player who tabled this card. When provided together with an
   *  `activePlayerId` on the slot, cards belonging to non-active seats
   *  receive the shared `.crib-inactive-pegged-card` dim token so the
   *  active-seat spotlight wins visual hierarchy. */
  playerId?: string | null;
}

export interface Wave4PeggingRowSlotProps {
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
  count: number;
  playedCards: ReadonlyArray<PeggingRowPlayedCard>;
  showEmptyPlaceholder: boolean;
  /** Cribbage active-turn player id. Used only to select which pegged
   *  cards receive the mild inactive dim token. */
  activePlayerId?: string | null;
}


const PEGGING_ROW_ID = "cribbage.peggingRow";

/** Cribbage playing card aspect (w/h). */
const CARD_ASPECT_WH = 2 / 3;
/** Cards consume at most this fraction of row height (leaves badge breathing room). */
const CARD_HEIGHT_RATIO = 0.92;
/** Gap between count badge column and card row, as fraction of row height. */
const BADGE_GAP_RATIO = 0.18;

export function Wave4PeggingRowSlot({
  count,
  playedCards,
  showEmptyPlaceholder,
  activePlayerId = null,
}: Wave4PeggingRowSlotProps) {

  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById, faults } =
    useCribbageGameplayGeometry();
  const overflowFrame = useCanonicalFeltOverflowFrameElement(true);
  const ref = useRef<HTMLDivElement | null>(null);

  const current = placementsById.get(PEGGING_ROW_ID);
  const lastValid = lastValidPlacementsById.get(PEGGING_ROW_ID);
  const placement: ResolvedPlacement | undefined =
    current && current.visible ? current : lastValid;

  const viewport = geometry
    ? deriveAvailableGameplayViewport(geometry).viewport
    : null;

  const assignedRect = placement
    ? {
        x: placement.rect.x.value,
        y: placement.rect.y.value,
        width: placement.rect.width.value,
        height: placement.rect.height.value,
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  const viewportRect = viewport
    ? {
        x: viewport.rect.x.value,
        y: viewport.rect.y.value,
        width: viewport.rect.width.value,
        height: viewport.rect.height.value,
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  useDomBoundsContract(ref, {
    artifactId: PEGGING_ROW_ID,
    assignedRect,
    availableGameplayViewport: viewportRect,
    vminInPx,
    enabled: !!placement && !!placement.visible && vminInPx > 0,
  });

  // Wave 5D — center-drift assertion (mirrors Wave4PegboardSlot /
  // Wave4CribCutGroupSlot). Warns once per session if any ancestor
  // transform shifts the rendered DOM rect off the assigned anchored rect.
  const driftWarnedRef = useRef(false);
  useEffect(() => {
    if (!placement || !placement.visible || vminInPx <= 0) return;
    if (typeof window === "undefined") return;
    const node = ref.current;
    if (!node) return;
    const raf = requestAnimationFrame(() => {
      const surface = document.querySelector<HTMLElement>(
        "[data-canonical-felt-surface]",
      );
      if (!surface) return;
      const surfRect = surface.getBoundingClientRect();
      const r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const renderedCenterY = (r.top + r.height / 2 - surfRect.top) / vminInPx;
      const assignedCenterY = assignedRect.y + assignedRect.height / 2;
      const delta = renderedCenterY - assignedCenterY;
      if (Math.abs(delta) > 0.5 && !driftWarnedRef.current) {
        driftWarnedRef.current = true;
        const chain: Array<{ tag: string; transform: string }> = [];
        let p: HTMLElement | null = node.parentElement;
        let hops = 0;
        while (p && hops < 16 && p !== surface) {
          const t = getComputedStyle(p).transform;
          if (t && t !== "none") {
            chain.push({
              tag:
                p.tagName.toLowerCase() +
                (p.dataset && Object.keys(p.dataset).length
                  ? "[" + Object.keys(p.dataset).slice(0, 2).join(",") + "]"
                  : ""),
              transform: t,
            });
          }
          p = p.parentElement;
          hops += 1;
        }
        // eslint-disable-next-line no-console
        console.warn("[wave5d:peggingRow center-drift]", {
          assignedRect,
          assignedCenterY,
          renderedCenterY,
          deltaVmin: delta,
          ancestorTransforms: chain,
        });
      } else if (Math.abs(delta) <= 0.5) {
        driftWarnedRef.current = false;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [
    placement,
    vminInPx,
    assignedRect.x,
    assignedRect.y,
    assignedRect.width,
    assignedRect.height,
  ]);

  const hasPlacement = !!placement && !!placement.visible && vminInPx > 0;

  const x = hasPlacement ? toVmin(placement!.rect.x, vminInPx) : 0;
  const y = hasPlacement ? toVmin(placement!.rect.y, vminInPx) : 0;
  const w = hasPlacement ? toVmin(placement!.rect.width, vminInPx) : 0;
  const h = hasPlacement ? toVmin(placement!.rect.height, vminInPx) : 0;

  const rowHeightPx = hasPlacement
    ? (placement!.rect.height.unit === "px"
        ? placement!.rect.height.value
        : placement!.rect.height.value * vminInPx)
    : 0;
  const rowWidthPx = hasPlacement
    ? (placement!.rect.width.unit === "px"
        ? placement!.rect.width.value
        : placement!.rect.width.value * vminInPx)
    : 0;

  const cardCeilingHeightPx = Math.max(0, rowHeightPx * CARD_HEIGHT_RATIO);
  const cardCeilingWidthPx = cardCeilingHeightPx * CARD_ASPECT_WH;
  const badgeGapPx = rowHeightPx * BADGE_GAP_RATIO;

  const countFontPx = Math.max(12, rowHeightPx * 0.4);
  const labelFontPx = Math.max(8, rowHeightPx * 0.16);
  const badgeWidthPx = Math.max(countFontPx * 1.8, 32);

  const visibleCardCount =
    playedCards.length > 0 ? playedCards.length : showEmptyPlaceholder ? 1 : 0;

  const availableSpanPx = Math.max(0, rowWidthPx - badgeWidthPx - badgeGapPx);
  const fan = resolvePeggingFanLayout({
    availableSpanPx,
    cardWidthPx: cardCeilingWidthPx,
    cardHeightPx: cardCeilingHeightPx,
    count: visibleCardCount,
  });

  const cardWidthPx = fan.cardWidthPx;
  const cardHeightPx = fan.cardHeightPx;
  const finalOverlap = fan.overlapPx;

  const clippingAncestor = useMemo(() => {
    if (typeof window === "undefined") return null;
    const node = ref.current;
    if (!node) return null;
    let p: HTMLElement | null = node.parentElement;
    let hops = 0;
    while (p && hops < 20) {
      const cs = getComputedStyle(p);
      if (
        cs.overflow === "hidden" ||
        cs.overflowX === "hidden" ||
        cs.overflowY === "hidden" ||
        (cs.clipPath && cs.clipPath !== "none")
      ) {
        return (
          p.tagName.toLowerCase() +
          (p.dataset && Object.keys(p.dataset).length
            ? "[" + Object.keys(p.dataset).slice(0, 2).join(",") + "]"
            : "")
        );
      }
      p = p.parentElement;
      hops += 1;
    }
    return null;
  }, [fan.resolvedSpanPx, fan.overflowMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasPlacement) return;
    const payload = {
      kind: "CRIB_PEG_HAND_FAN_LAYOUT" as const,
      timestamp: Date.now(),
      cardCount: visibleCardCount,
      cardWidthPx: fan.cardWidthPx,
      cardHeightPx: fan.cardHeightPx,
      overlapPx: fan.overlapPx,
      overlapRatio: fan.cardWidthPx > 0 ? fan.overlapPx / fan.cardWidthPx : 0,
      naturalSpanPx: fan.naturalSpanPx,
      availableSpanPx: fan.availableSpanPx,
      resolvedSpanPx: fan.resolvedSpanPx,
      fillRatio: fan.fillRatio,
      requiredCompression: fan.requiredCompression,
      overflowMode: fan.overflowMode,
      overhangsAvailable: fan.overhangsAvailable,
      overhangPerSidePx: fan.overhangPerSidePx,
      clippingAncestor,
    };
    (window as unknown as {
      __CRIB_PEG_HAND_FAN_LAYOUT_LATEST?: typeof payload;
    }).__CRIB_PEG_HAND_FAN_LAYOUT_LATEST = payload;
  }, [
    hasPlacement,
    visibleCardCount,
    fan.cardWidthPx,
    fan.cardHeightPx,
    fan.overlapPx,
    fan.naturalSpanPx,
    fan.availableSpanPx,
    fan.resolvedSpanPx,
    fan.fillRatio,
    fan.requiredCompression,
    fan.overflowMode,
    fan.overhangsAvailable,
    fan.overhangPerSidePx,
    clippingAncestor,
  ]);

  if (!hasPlacement) {
    // Legacy fallback — pre-measurement only.
    return (
      <div
        ref={ref}
        data-wave4-pegging-row-slot="fallback"
        data-pegging-row-fault-count={String(faults.length)}
        className="absolute top-[68%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-3"
      >
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-white/60">Count</span>
          <span className="text-2xl font-bold text-poker-gold">{count}</span>
        </div>
        <div className="flex -space-x-4 justify-center">
          {playedCards.map((pc, i) => (
            <CribbagePlayingCard key={i} card={pc.card} size="md" />
          ))}
          {playedCards.length === 0 && showEmptyPlaceholder && (
            <div className="w-10 h-[60px] border border-dashed border-white/20 rounded" />
          )}
        </div>
      </div>
    );
  }

  if (!overflowFrame) return null;


  return createPortal(
    <div
      ref={ref}
      data-wave4-pegging-row-slot="resolved"
      data-artifact-id="cribbage.peggingRow"
      data-placement-mode="anchored"
      data-placement-frame="felt-overflow-frame"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      data-pegging-row-rect={`${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`}
      data-pegging-row-fault-count={String(faults.length)}
      data-crib-peg-fan-count={String(visibleCardCount)}
      data-crib-peg-fan-natural-px={fan.naturalSpanPx.toFixed(1)}
      data-crib-peg-fan-available-px={fan.availableSpanPx.toFixed(1)}
      data-crib-peg-fan-resolved-px={fan.resolvedSpanPx.toFixed(1)}
      data-crib-peg-fan-overlap-px={fan.overlapPx.toFixed(2)}
      data-crib-peg-fan-fill-ratio={fan.fillRatio.toFixed(3)}
      data-crib-peg-fan-required-compression={fan.requiredCompression.toFixed(3)}
      data-crib-peg-fan-mode={fan.overflowMode}
      data-crib-peg-fan-overhang-px={fan.overhangPerSidePx.toFixed(1)}
      data-crib-peg-fan-clipper={clippingAncestor ?? "none"}
      style={{
        position: "absolute",
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: `${badgeGapPx}px`,
        // Allow the card fan to render past the row rect horizontally
        // when overhang occurs. The overflow frame ancestor is not
        // clipped by the felt ellipse, so this reaches viewport edge.
        overflow: "visible",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          maxHeight: "100%",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: `${labelFontPx}px`,
            lineHeight: 1,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Count
        </span>
        <span
          style={{
            fontSize: `${countFontPx}px`,
            fontWeight: 700,
            lineHeight: 1.05,
          }}
          className="text-poker-gold"
        >
          {count}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          // Card fan must be free to overhang either side.
          overflow: "visible",
          flexShrink: 0,
        }}
      >
        {playedCards.map((pc, i) => (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : `${-finalOverlap}px`,
              flexShrink: 0,
            }}
          >
            <CribbagePlayingCard card={pc.card} widthPx={cardWidthPx} />
          </div>
        ))}
        {playedCards.length === 0 && showEmptyPlaceholder && (
          <div
            className="border border-dashed border-white/20 rounded"
            style={{
              width: `${cardWidthPx}px`,
              height: `${cardHeightPx}px`,
            }}
          />
        )}
      </div>
    </div>,
    overflowFrame,
  );
}

export default Wave4PeggingRowSlot;
