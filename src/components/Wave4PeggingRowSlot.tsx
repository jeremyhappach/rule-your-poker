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

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  deriveAvailableGameplayViewport,
  toVmin,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
import { useDomBoundsContract } from "@/lib/wave5GameplayGeometry/useDomBoundsContract";
import { resolveCardRowLayout } from "@/lib/canonicalShell/useCardRowLayout";
import { useCanonicalFeltCoordFrameElement } from "@/lib/canonicalShell/useCanonicalFeltCoordFrameElement";
// (Removed cardArtifactOverlap import — pegging row uses the adaptive
// resolver default; not a manually tuned felt-artifact overlap value.)
import type { CribbagePhase } from "@/lib/cribbage/cribbageArtifactDescriptors";
import type { CribbageCard } from "@/lib/cribbageTypes";
import { CribbagePlayingCard } from "./CribbagePlayingCard";

export interface PeggingRowPlayedCard {
  card: CribbageCard;
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
}: Wave4PeggingRowSlotProps) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById, faults } =
    useCribbageGameplayGeometry();
  const coordFrame = useCanonicalFeltCoordFrameElement(true);
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

  if (!placement || !placement.visible || vminInPx <= 0) {
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

  if (!coordFrame) return null;

  const x = toVmin(placement.rect.x, vminInPx);
  const y = toVmin(placement.rect.y, vminInPx);
  const w = toVmin(placement.rect.width, vminInPx);
  const h = toVmin(placement.rect.height, vminInPx);

  // Rect-driven sizing. Row rect is authoritative; cards adapt.
  const rowHeightPx =
    placement.rect.height.unit === "px"
      ? placement.rect.height.value
      : placement.rect.height.value * vminInPx;
  const rowWidthPx =
    placement.rect.width.unit === "px"
      ? placement.rect.width.value
      : placement.rect.width.value * vminInPx;

  const cardCeilingHeightPx = Math.max(0, rowHeightPx * CARD_HEIGHT_RATIO);
  const cardCeilingWidthPx = cardCeilingHeightPx * CARD_ASPECT_WH;
  const badgeGapPx = rowHeightPx * BADGE_GAP_RATIO;

  // Badge typography — derived from row height so it grows with the row.
  const countFontPx = Math.max(12, rowHeightPx * 0.4);
  const labelFontPx = Math.max(8, rowHeightPx * 0.16);
  const badgeWidthPx = Math.max(countFontPx * 1.8, 32);

  const visibleCardCount =
    playedCards.length > 0 ? playedCards.length : showEmptyPlaceholder ? 1 : 0;

  // Adaptive pegging fan — resolver's default preferredOverlapRatio
  // (0.18) is the implementation default. No manual override.
  const fan = visibleCardCount > 0
    ? resolveCardRowLayout({
        availableWidth: Math.max(0, rowWidthPx - badgeWidthPx - badgeGapPx),
        availableHeight: cardCeilingHeightPx,
        count: visibleCardCount,
        aspect: CARD_ASPECT_WH,
        minCardWidth: 18,
        maxCardWidth: cardCeilingWidthPx,
        maxOverlapRatio: 0.9,
      })
    : null;

  const cardWidthPx = fan?.cardWidth ?? cardCeilingWidthPx;
  const cardHeightPx = fan?.cardHeight ?? cardCeilingHeightPx;
  const finalOverlap = fan?.overlapPx ?? 0;

  return (
    <div
      ref={ref}
      data-wave4-pegging-row-slot="resolved"
      data-artifact-id="cribbage.peggingRow"
      data-placement-mode="anchored"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      data-pegging-row-rect={`${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`}
      data-pegging-row-fault-count={String(faults.length)}
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
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          maxHeight: "100%",
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
        }}
      >
        {playedCards.map((pc, i) => (
          <div key={i} style={{ marginLeft: i === 0 ? 0 : `${-finalOverlap}px` }}>
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
    </div>
  );
}

export default Wave4PeggingRowSlot;
