/**
 * Wave 5D follow-up — Holm lone-player tabled-cards fan.
 *
 * Pure presentation component that renders the sorted lone-player
 * tabled cards INSIDE the holm.lonePlayerTabledCardsStage anchored
 * slot. Derives card width / height / overlap from the slot's
 * assigned geometry via `resolveCardRowLayout` so the fan adapts to
 * any 2–5 card count without fixed pixel widths or hardcoded
 * negative-margin overlaps.
 *
 *  - card height derives from the measured wrapper height (which the
 *    HolmAnchoredSlot resolves from `assignedRect.height`).
 *  - overlap is computed from available width + count and clamped
 *    before ranks/suits become illegible.
 *  - small counts (2–3 cards) naturally get zero / minimal overlap.
 *  - large counts fan progressively.
 *
 * Owns no positioning — only the inner card row. The slot owns the
 * stage geometry. Animation timing is owned by the caller via the
 * `animate` prop (one-shot slide-in driven by an external ref).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { resolveCardRowLayout } from "@/lib/canonicalShell/useCardRowLayout";
import { ffRecord } from "@/lib/canonicalShell/cardTransport/holmFullForensics";
import { useCardOverlap } from "@/lib/geometryLab/cardArtifactOverlap";

type Card = { rank: string; suit: string };

interface FourColorConfig {
  bg: string;
}

export interface HolmLonePlayerFanProps {
  sortedCards: Array<{ card: Card; originalIndex: number }>;
  isSoloPlayerWinner: boolean;
  winningPlayerIndices: number[];
  kickerPlayerIndices: number[];
  hasHighlights: boolean;
  isFourColor: boolean;
  getFourColorSuit: (suit: string) => FourColorConfig | null | undefined;
  animate: boolean;
}

export function HolmLonePlayerFan({
  sortedCards,
  isSoloPlayerWinner,
  winningPlayerIndices,
  kickerPlayerIndices,
  hasHighlights,
  isFourColor,
  getFourColorSuit,
  animate,
}: HolmLonePlayerFanProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = sortedCards.length;
  const fanOverlap = useCardOverlap('cardOverlap.holm.lonePlayerFan');
  const layout =
    size.w > 0 && size.h > 0
      ? resolveCardRowLayout({
          availableWidth: size.w,
          availableHeight: size.h,
          count,
          aspect: 5 / 7,
          minCardWidth: 24,
          maxCardWidth: 96,
          maxOverlapRatio: 0.45,
          preferredOverlapRatio: fanOverlap,
        })
      : null;

  ffRecord({
    writerId: 'HolmLonePlayerFan.tsx:render:L91',
    source: 'HOLM_LONE_PLAYER_FAN',
    marker: layout ? 'HOLM_LONE_FAN_RENDER' : 'HOLM_LONE_FAN_RENDER_SUPPRESSED',
    payload: {
      cardCount: count,
      hasLayout: !!layout,
      wrapperW: size.w,
      wrapperH: size.h,
      animate,
      isSoloPlayerWinner,
      hasHighlights,
    },
  });

  return (
    <div
      ref={wrapperRef}
      data-holm-lone-player-fan=""
      className="relative flex items-center justify-center w-full"
      style={{
        height: "100%",
        ...(animate
          ? {
              animation: "holmSoloTableSlide 0.6s ease-out forwards",
              willChange: "transform, opacity",
            }
          : null),
      }}
    >
      {layout ? (
        <div
          className="flex items-center"
          style={{ height: layout.cardHeight }}
        >
          {sortedCards.map(({ card, originalIndex }, displayIndex) => {
            const fourColorConfig = getFourColorSuit(card.suit);
            const cardBg =
              isFourColor && fourColorConfig ? fourColorConfig.bg : "white";
            const twoColorTextStyle: CSSProperties = !isFourColor
              ? {
                  color:
                    card.suit === "♥" || card.suit === "♦"
                      ? "#dc2626"
                      : "#000000",
                }
              : {};
            const isHighlighted =
              isSoloPlayerWinner && winningPlayerIndices.includes(originalIndex);
            const isKicker =
              isSoloPlayerWinner && kickerPlayerIndices.includes(originalIndex);
            const isDimmed = hasHighlights && !isHighlighted && !isKicker;
            const lift = isHighlighted || isKicker ? "translateY(-25%)" : "";
            const dimStyle: CSSProperties = isDimmed
              ? { opacity: 0.4, filter: "grayscale(30%)" }
              : {};
            return (
              <div
                key={displayIndex}
                className="rounded-md border-2 border-gray-300 flex flex-col items-center justify-center shadow-lg transition-transform duration-200"
                style={{
                  width: layout.cardWidth,
                  height: layout.cardHeight,
                  backgroundColor: cardBg,
                  ...twoColorTextStyle,
                  ...dimStyle,
                  transform: lift || undefined,
                  marginLeft:
                    displayIndex > 0 ? `${-layout.overlapPx}px` : "0",
                }}
              >
                <span
                  className={`font-black leading-none ${isFourColor ? "text-white" : ""}`}
                  style={{ fontSize: Math.round(layout.cardHeight * 0.34) }}
                >
                  {card.rank}
                </span>
                {!isFourColor && (
                  <span
                    className="leading-none -mt-0.5"
                    style={{ fontSize: Math.round(layout.cardHeight * 0.42) }}
                  >
                    {card.suit}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default HolmLonePlayerFan;
