import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef } from "react";
import { resolveCardRowLayout } from "@/lib/canonicalShell/useCardRowLayout";
import { useCardOverlap } from "@/lib/geometryLab/cardArtifactOverlap";

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
  highlightedIndices?: number[];
  kickerIndices?: number[];
  hasHighlights?: boolean;
  tightOverlap?: boolean;
  holmHandContextId?: string | null;
}

/**
 * Wave 5D — CommunityCards.
 *
 * Pure renderer for the holm.communityCardsStage anchored slot.
 * Owns NO geometry. Fills its parent (the HolmAnchoredSlot box) and
 * derives card width / height / overlap from the measured wrapper
 * via resolveCardRowLayout, matching the HolmLonePlayerFan pattern.
 *
 * - No useDeviceSize(), no size="md"/"xl" branches, no fixed px.
 * - PlayingCard receives explicit width/height via inline style which
 *   overrides its internal SIZE_CLASSES Tailwind utilities.
 * - faceFillPx scales rank/suit typography off the resolved width.
 */
export const CommunityCards = ({
  cards,
  revealed,
  highlightedIndices = [],
  kickerIndices = [],
  hasHighlights = false,
  tightOverlap = false,
  holmHandContextId = null,
}: CommunityCardsProps) => {
  const handId = cards.map((c) => `${c.rank}${c.suit}`).join(",");

  const animatedHandIdRef = useRef<string>("");
  const dealtCardsRef = useRef<Set<number>>(new Set());
  const flippedCardsRef = useRef<Set<number>>(new Set());

  const [, setRenderTrigger] = useState(0);

  const lastRevealedRef = useRef<number>(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isFirstMountRef = useRef<boolean>(true);

  const clearTimeouts = () => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  };

  // Sync identity update (prevents flash across hand transitions).
  if (cards.length > 0 && handId !== animatedHandIdRef.current) {
    console.log(
      "[COMMUNITY_CARDS] Sync update - handId changed from",
      animatedHandIdRef.current,
      "to",
      handId,
    );
    clearTimeouts();

    const shouldSkipAnimation =
      isFirstMountRef.current || animatedHandIdRef.current !== "";

    if (shouldSkipAnimation) {
      const allDealt = new Set<number>();
      for (let i = 0; i < cards.length; i++) allDealt.add(i);
      const preFlipped = new Set<number>();
      for (let i = 2; i < revealed; i++) preFlipped.add(i);

      dealtCardsRef.current = allDealt;
      flippedCardsRef.current = preFlipped;
      animatedHandIdRef.current = handId;
      lastRevealedRef.current = revealed;
      isFirstMountRef.current = false;
    } else {
      dealtCardsRef.current = new Set();
      flippedCardsRef.current = new Set();
      lastRevealedRef.current = revealed;
      animatedHandIdRef.current = handId;
      isFirstMountRef.current = false;
    }
  }

  // First-hand deal-in animation (rare).
  useEffect(() => {
    if (cards.length === 0) return;
    if (dealtCardsRef.current.size === 0 && cards.length > 0 && !isFirstMountRef.current) {
      const INITIAL_DELAY = 400;
      const CARD_INTERVAL = 200;
      cards.forEach((_, index) => {
        const timeout = setTimeout(() => {
          dealtCardsRef.current = new Set([...dealtCardsRef.current, index]);
          setRenderTrigger((n) => n + 1);
        }, INITIAL_DELAY + index * CARD_INTERVAL);
        timeoutsRef.current.push(timeout);
      });
    }
  }, [cards.length]);

  // Sequential reveal queue (identity-scoped on handId).
  const flipQueueIdRef = useRef<string>("");
  const FLIP_GAP_MS = 800;

  useEffect(() => {
    if (cards.length === 0) return;
    if (handId !== animatedHandIdRef.current) return;
    if (revealed <= lastRevealedRef.current) return;
    lastRevealedRef.current = revealed;

    const queueId = handId;
    flipQueueIdRef.current = queueId;

    const tick = () => {
      if (flipQueueIdRef.current !== queueId) return;
      if (handId !== animatedHandIdRef.current) return;
      let next = -1;
      for (let i = 2; i < lastRevealedRef.current; i++) {
        if (!flippedCardsRef.current.has(i)) {
          next = i;
          break;
        }
      }
      if (next === -1) return;
      flippedCardsRef.current = new Set([...flippedCardsRef.current, next]);
      setRenderTrigger((n) => n + 1);
      const t = setTimeout(tick, FLIP_GAP_MS);
      timeoutsRef.current.push(t);
    };

    const t = setTimeout(tick, 0);
    timeoutsRef.current.push(t);
  }, [revealed, handId, cards.length]);

  useEffect(() => () => clearTimeouts(), []);

  // ── Geometry: derive card size from measured wrapper ──────────────
  // The wrapper fills the HolmAnchoredSlot box (width/height: 100%).
  // resolveCardRowLayout maps (availableWidth, availableHeight, count)
  // → (cardWidth, cardHeight, overlapPx) within readability invariants.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (cards.length === 0) return null;

  const count = cards.length;
  const layout =
    size.w > 0 && size.h > 0
      ? resolveCardRowLayout({
          availableWidth: size.w,
          availableHeight: size.h,
          count,
          aspect: 5 / 7,
          minCardWidth: 18,
          maxCardWidth: 160,
          maxOverlapRatio: 0.45,
          // Community cards traditionally render with a hair of overlap.
          // tightOverlap (multi-player showdown) packs them closer.
          preferredOverlapRatio: tightOverlap ? 0.08 : 0.03,
        })
      : null;

  const dealtCards = dealtCardsRef.current;
  const flippedCards = flippedCardsRef.current;

  return (
    <div
      ref={wrapperRef}
      data-community-cards=""
      className="relative flex items-center justify-center"
      style={{ width: "100%", height: "100%", perspective: "1000px" }}
    >
      {layout && (
        <div className="flex items-center" style={{ height: layout.cardHeight }}>
          {cards.map((card, index) => {
            const isVisible = dealtCards.has(index);
            const hasFlipped = flippedCards.has(index);
            const showFront = index < 2 || hasFlipped;

            return (
              <div
                key={index}
                data-holm-card-id={holmHandContextId ? `${holmHandContextId}#community-${index}` : undefined}
                data-holm-renderer="CommunityCards"
                data-holm-component="COMMUNITY"
                data-card-anchor={`community-${index}`}
                data-anchor-owner="CommunityCards.slot"
                style={{
                  marginLeft: index > 0 ? `-${layout.overlapPx}px` : "0",
                  transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
                  transform: isVisible ? "translateY(0)" : "translateY(-20px)",
                  opacity: isVisible ? 1 : 0,
                }}
              >
                {showFront ? (
                  <PlayingCard
                    card={card}
                    tier="large"
                    style={{ width: layout.cardWidth, height: layout.cardHeight }}
                    faceFillPx={layout.cardWidth}
                    isHighlighted={highlightedIndices.includes(index)}
                    isKicker={kickerIndices.includes(index)}
                    isDimmed={
                      hasHighlights &&
                      !highlightedIndices.includes(index) &&
                      !kickerIndices.includes(index)
                    }
                  />
                ) : (
                  <PlayingCard
                    isHidden
                    style={{ width: layout.cardWidth, height: layout.cardHeight }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
