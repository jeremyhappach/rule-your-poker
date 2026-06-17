/**
 * Wave 5C — Phase 4B.1
 * Wave4PeggingRowSlot is a pure consumer of
 *   CribbageGameplayGeometryProvider
 * AND owns rect-driven sizing of its children. The PeggingRow
 * placement rect is the hard visual envelope: the count badge,
 * played cards, and empty placeholder must all fit inside it
 * vertically. No fixed pixel sizes inside the resolved path.
 *
 * Fallback policy:
 *   1. current placement (provider, this frame)
 *   2. lastValid placement (provider, last fault-free frame)
 *   3. legacy CSS percentage wrapper (cold-start / pre-measurement)
 *      → fallback path keeps legacy fixed sizes (size="md").
 */

import { useEffect, useRef } from "react";
import { toVmin, type ResolvedPlacement } from "@/lib/wave4LayoutResolver";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import { useCribbageGameplayGeometry } from "@/lib/wave5GameplayGeometry/CribbageGameplayGeometryProvider";
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
  /** Display count (left badge). */
  count: number;
  /** Played cards in the CURRENT pegging sequence. */
  playedCards: ReadonlyArray<PeggingRowPlayedCard>;
  /** When true and no cards played, render the dashed placeholder. */
  showEmptyPlaceholder: boolean;
}

const PEGGING_ROW_ID = "cribbage.peggingRow";

/** Card aspect: width / height = 2 / 3. */
const CARD_ASPECT_WH = 2 / 3;
/** Card may consume this fraction of row height (leaves breathing room). */
const CARD_HEIGHT_RATIO = 0.95;
/** Overlap as fraction of card width (matches legacy -space-x-4 / w-10). */
const CARD_OVERLAP_RATIO = 0.4;
/** Gap between count badge and card row, as fraction of row height. */
const BADGE_GAP_RATIO = 0.25;

export function Wave4PeggingRowSlot({
  count,
  playedCards,
  showEmptyPlaceholder,
}: Wave4PeggingRowSlotProps) {
  const { vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById, faults } =
    useCribbageGameplayGeometry();

  const current = placementsById.get(PEGGING_ROW_ID);
  const lastValid = lastValidPlacementsById.get(PEGGING_ROW_ID);
  const placement: ResolvedPlacement | undefined =
    current && current.visible ? current : lastValid;

  const usingFallback = !placement || !placement.visible || vminInPx <= 0;

  const slotRef = useRef<HTMLDivElement | null>(null);
  const lastDiagRef = useRef<string>("");
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const placementSrc = usingFallback
      ? "fallback"
      : current && current.visible
        ? "current"
        : "lastValid";
    const rectStr = placement
      ? `${toVmin(placement.rect.x, vminInPx).toFixed(2)},${toVmin(placement.rect.y, vminInPx).toFixed(2)},${toVmin(placement.rect.width, vminInPx).toFixed(2)},${toVmin(placement.rect.height, vminInPx).toFixed(2)} vmin`
      : "none";
    const placementRectPx = placement
      ? {
          height:
            placement.rect.height.unit === "px"
              ? placement.rect.height.value
              : placement.rect.height.value * vminInPx,
          width:
            placement.rect.width.unit === "px"
              ? placement.rect.width.value
              : placement.rect.width.value * vminInPx,
        }
      : null;
    // Find bottom HUD candidate.
    const hud =
      document.querySelector("[data-shell-hud-chrome]") ||
      document.querySelector("[data-bottom-hud]") ||
      document.querySelector("[data-canonical-bottom-hud]");
    const hudRect = hud ? (hud as HTMLElement).getBoundingClientRect() : null;
    const sig = `${placementSrc}|${rectStr}|${r.top.toFixed(1)}|${r.bottom.toFixed(1)}|${r.height.toFixed(1)}|${hudRect?.top.toFixed(1) ?? "?"}`;
    if (sig === lastDiagRef.current) return;
    lastDiagRef.current = sig;
    // eslint-disable-next-line no-console
    console.log("[wave5:diag:peggingRow]", {
      placementSource: placementSrc,
      parentId: placement?.parentId ?? null,
      placementRectVmin: rectStr,
      placementRectPx,
      domBounds: { top: r.top, bottom: r.bottom, height: r.height },
      bottomHudTop: hudRect?.top ?? null,
      bottomHudBottom: hudRect?.bottom ?? null,
      bottomHudSelector: hud
        ? (hud as HTMLElement).getAttribute("data-shell-hud-chrome")
          ? "[data-shell-hud-chrome]"
          : (hud as HTMLElement).getAttribute("data-bottom-hud")
            ? "[data-bottom-hud]"
            : "[data-canonical-bottom-hud]"
        : null,
      windowInnerHeight: window.innerHeight,
      faultCount: faults.length,
    });
  });


  if (usingFallback) {
    // Legacy fallback — fixed sizes acceptable here per Phase 4B.1 scope.
    return (
      <div
        ref={slotRef}
        data-wave4-pegging-row-slot="fallback"
        data-pegging-row-fallback-used="true"
        data-pegging-row-parent-id={placement?.parentId ?? ""}
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

  const x = toVmin(placement.rect.x, vminInPx);
  const y = toVmin(placement.rect.y, vminInPx);
  const w = toVmin(placement.rect.width, vminInPx);
  const h = toVmin(placement.rect.height, vminInPx);

  // Rect-driven sizing — all derived from the row height (px) so children
  // never overflow the PeggingRow rect vertically into the HUD.
  const rowHeightPx = placement.rect.height.unit === "px"
    ? placement.rect.height.value
    : placement.rect.height.value * vminInPx;
  const rowWidthPx = placement.rect.width.unit === "px"
    ? placement.rect.width.value
    : placement.rect.width.value * vminInPx;

  const cardHeightPx = Math.max(0, rowHeightPx * CARD_HEIGHT_RATIO);
  const cardWidthPx = cardHeightPx * CARD_ASPECT_WH;
  const overlapPx = cardWidthPx * CARD_OVERLAP_RATIO;
  const badgeGapPx = rowHeightPx * BADGE_GAP_RATIO;

  // Badge typography scales from rowHeight.
  const countFontPx = Math.max(10, rowHeightPx * 0.45);
  const labelFontPx = Math.max(7, rowHeightPx * 0.16);

  // If the rendered fan would exceed the available width, shrink the card
  // width (and overlap) proportionally so the row never exceeds its rect
  // horizontally either. Badge width is reserved separately.
  const visibleCardCount = playedCards.length > 0
    ? playedCards.length
    : (showEmptyPlaceholder ? 1 : 0);
  const naturalRowWidth = visibleCardCount === 0
    ? 0
    : cardWidthPx + (visibleCardCount - 1) * (cardWidthPx - overlapPx);
  // Rough badge column width budget.
  const badgeWidthPx = Math.max(countFontPx * 1.6, 28);
  const availableForCardsPx = Math.max(
    0,
    rowWidthPx - badgeWidthPx - badgeGapPx,
  );
  const widthScale = naturalRowWidth > availableForCardsPx && naturalRowWidth > 0
    ? availableForCardsPx / naturalRowWidth
    : 1;
  const finalCardWidth = cardWidthPx * widthScale;
  const finalCardHeight = cardHeightPx * widthScale;
  const finalOverlap = overlapPx * widthScale;

  return (
    <div
      ref={slotRef}
      data-wave4-pegging-row-slot="resolved"
      data-artifact-id="cribbage.peggingRow"
      data-gameplay-column-child="peggingRow"
      data-placement-source={current && current.visible ? "current" : "lastValid"}
      data-pegging-row-parent-id={placement.parentId ?? ""}
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
          <div
            key={i}
            style={{ marginLeft: i === 0 ? 0 : -finalOverlap }}
          >
            <CribbagePlayingCard card={pc.card} widthPx={finalCardWidth} />
          </div>
        ))}
        {playedCards.length === 0 && showEmptyPlaceholder && (
          <div
            className="border border-dashed border-white/20 rounded"
            style={{
              width: `${finalCardWidth}px`,
              height: `${finalCardHeight}px`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Wave4PeggingRowSlot;
