/**
 * ThreeFiveSevenProofCardsAnimation — instant-357 proof-card prelude.
 *
 * Renders face-up OVERLAY copies of the winner's authoritative 3-5-7
 * cards. Does NOT reparent or mutate the actual hand DOM; the winner's
 * hand region keeps its native layout space reserved.
 *
 * Presentation contract:
 *   - Measure the live hand cards as origins; never move/reparent them.
 *   - Measure the existing winner-tabled-cards felt stage as destination.
 *   - Render three fixed-position overlay copies from descriptor.proofCards.
 *   - Complete only after all three transform transitions finish.
 *   - The tabled cards remain visible until the controller unmounts
 *     the animation (descriptor rotation).
 *
 * Consumers must feed the immutable `descriptor.proofCards` array —
 * never derive faces from live hand state.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { ThreeFiveSevenAnchoredSlot } from "@/components/ThreeFiveSevenAnchoredSlot";

type RectSnapshot = { x: number; y: number; width: number; height: number };

type ProofCardTransport = {
  index: number;
  card: CardType;
  originRect: RectSnapshot;
  destinationRect: RectSnapshot;
  originSelector: string;
  destinationSelector: string;
  distancePx: number;
};

export interface ThreeFiveSevenProofCardsInvariantFailure {
  reason:
    | "proof_cards_missing_or_incomplete"
    | "origin_anchor_missing"
    | "destination_anchor_missing"
    | "zero_distance_transform";
  generationKey: string;
  cardCount: number;
  missingOrigins: Array<{ index: number; cardId: string; selector: string }>;
  missingDestinations: Array<{ index: number; cardId: string; selector: string }>;
  zeroDistanceTransforms?: Array<{
    index: number;
    cardId: string;
    originRect: RectSnapshot;
    destinationRect: RectSnapshot;
    distancePx: number;
  }>;
  domSnapshot?: {
    activeHandRegionCount: number;
    activeHandCardIds: string[];
    activeHandCardRootCount: number;
    destinationTargetCount: number;
    destinationCardIds: string[];
  };
}

export interface ThreeFiveSevenProofCardsAnimationProps {
  show: boolean;
  /** Immutable cards from `descriptor.proofCards`. */
  cards: CardType[];
  /** Winner seat position (1-based). Used only to bias the entry
   *  direction (top vs bottom). Geometry does not depend on viewer. */
  winnerPosition: number | null;
  /** Stable key derived from `descriptor.terminalGenerationId`. When
   *  this changes, the animation resets. `onComplete` fires once per
   *  key. */
  generationKey: string;
  onComplete?: () => void;
  onInvariantFailure?: (failure: ThreeFiveSevenProofCardsInvariantFailure) => void;
}

export const ThreeFiveSevenProofCardsAnimation = ({
  show,
  cards,
  winnerPosition,
  generationKey,
  onComplete,
  onInvariantFailure,
}: ThreeFiveSevenProofCardsAnimationProps) => {
  const [phase, setPhase] = useState<"hidden" | "measuring" | "origin" | "lifted" | "transporting" | "settled" | "blocked">("hidden");
  const [transports, setTransports] = useState<ProofCardTransport[]>([]);
  const [completedIndices, setCompletedIndices] = useState<ReadonlySet<number>>(() => new Set());
  const originElsRef = useRef<HTMLElement[]>([]);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const completedForKeyRef = useRef<string | null>(null);
  const failedForKeyRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onInvariantFailureRef = useRef(onInvariantFailure);
  onCompleteRef.current = onComplete;
  onInvariantFailureRef.current = onInvariantFailure;
  const proofCardSignature = cards.slice(0, 3).map((card) => `${card.rank}-${card.suit}`).join("|");

  useEffect(() => {
    setPortalHost(typeof document === "undefined" ? null : document.body);
  }, []);

  // Reset when generation rotates.
  useEffect(() => {
    completedForKeyRef.current = null;
    failedForKeyRef.current = null;
    setPhase("hidden");
    setTransports([]);
    setCompletedIndices(new Set());
  }, [generationKey]);

  const emitInvariantFailure = (failure: ThreeFiveSevenProofCardsInvariantFailure) => {
    if (failedForKeyRef.current === generationKey) return;
    failedForKeyRef.current = generationKey;
    setPhase("blocked");
    onInvariantFailureRef.current?.(failure);
  };

  useEffect(() => {
    if (!show) {
      setPhase("hidden");
      setTransports([]);
      setCompletedIndices(new Set());
      return;
    }

    const proofCards = cards.slice(0, 3);
    if (proofCards.length !== 3) {
      emitInvariantFailure({
        reason: "proof_cards_missing_or_incomplete",
        generationKey,
        cardCount: cards.length,
        missingOrigins: [],
        missingDestinations: [],
      });
      return;
    }

    setPhase("measuring");
    setTransports([]);
    setCompletedIndices(new Set());
    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    const maxAttempts = 10;

    const rectSnapshot = (el: HTMLElement): RectSnapshot | null => {
      const r = el.getBoundingClientRect();
      if (!Number.isFinite(r.width) || !Number.isFinite(r.height) || r.width <= 0 || r.height <= 0) return null;
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };

    const cssEscape = (value: string) => {
      const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
      return esc ? esc(value) : value.replace(/(["\\#.;:[\]()])/g, "\\$1");
    };

    const visibleElement = (el: HTMLElement | null): el is HTMLElement => {
      if (!el) return false;
      if (el.closest("[data-controller-357-proof-cards]")) return false;
      if (el.closest("[data-controller-357-proof-overlay-layer]")) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0;
    };

    const firstVisible = (selector: string): HTMLElement | null => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
      return nodes.find(visibleElement) ?? null;
    };

      const buildDomSnapshot = () => {
        const activeRegions = Array.from(document.querySelectorAll<HTMLElement>("[data-357-active-hand-region]"));
        const activeCards = activeRegions.flatMap((region) =>
          Array.from(region.querySelectorAll<HTMLElement>("[data-playing-card-root]")),
        );
        const destinationTargets = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-controller-357-proof-cards="${generationKey}"] [data-controller-357-proof-target-index]`),
        );
        const destinationCards = destinationTargets.flatMap((target) =>
          Array.from(target.querySelectorAll<HTMLElement>("[data-playing-card-root]")),
        );
        return {
          activeHandRegionCount: activeRegions.length,
          activeHandCardIds: activeCards.map((node) => node.getAttribute("data-card-id") ?? "<missing-data-card-id>"),
          activeHandCardRootCount: activeCards.length,
          destinationTargetCount: destinationTargets.length,
          destinationCardIds: destinationCards.map((node) => node.getAttribute("data-card-id") ?? "<missing-data-card-id>"),
        };
      };

    const measure = () => {
      if (cancelled) return;
      const root = document.querySelector<HTMLElement>(
        `[data-controller-357-proof-cards="${generationKey}"]`,
      );
      if (!root) {
        attempts += 1;
        if (attempts < maxAttempts) raf = requestAnimationFrame(measure);
        else {
          const missingDestinations = proofCards.map((card, index) => ({
            index,
            cardId: `${card.rank}-${card.suit}`,
            selector: `[data-controller-357-proof-cards="${generationKey}"]`,
          }));
          emitInvariantFailure({
            reason: "destination_anchor_missing",
            generationKey,
            cardCount: cards.length,
            missingOrigins: [],
            missingDestinations,
            domSnapshot: buildDomSnapshot(),
          });
        }
        return;
      }

      const nextTransports: ProofCardTransport[] = [];
      const nextOriginEls: HTMLElement[] = [];
      const missingOrigins: ThreeFiveSevenProofCardsInvariantFailure["missingOrigins"] = [];
      const missingDestinations: ThreeFiveSevenProofCardsInvariantFailure["missingDestinations"] = [];
      const zeroDistanceTransforms: NonNullable<ThreeFiveSevenProofCardsInvariantFailure["zeroDistanceTransforms"]> = [];

      proofCards.forEach((card, index) => {
        const cardId = `${card.rank}-${card.suit}`;
        const escapedCardId = cssEscape(cardId);
        const activeHandSelector = `[data-357-active-hand-region] [data-playing-card-root][data-card-id="${escapedCardId}"]`;
        const winnerSeatSelector = typeof winnerPosition === "number"
          ? `[data-canonical-seat-cluster][data-seat-position="${winnerPosition}"] [data-playing-card-root][data-card-id="${escapedCardId}"]`
          : activeHandSelector;
        const originSelector = activeHandSelector;
        const origin = firstVisible(activeHandSelector) ?? firstVisible(winnerSeatSelector);
        const destinationSelector = `[data-controller-357-proof-target-index="${index}"] [data-playing-card-root]`;
        const destination = root.querySelector<HTMLElement>(destinationSelector);
        const originRect = origin ? rectSnapshot(origin) : null;
        const destinationRect = destination ? rectSnapshot(destination) : null;

        if (!originRect) {
          missingOrigins.push({ index, cardId, selector: originSelector });
        }
        if (!destinationRect) {
          missingDestinations.push({ index, cardId, selector: destinationSelector });
        }
        if (originRect && destinationRect) {
          const originCx = originRect.x + originRect.width / 2;
          const originCy = originRect.y + originRect.height / 2;
          const destCx = destinationRect.x + destinationRect.width / 2;
          const destCy = destinationRect.y + destinationRect.height / 2;
          const distancePx = Math.hypot(destCx - originCx, destCy - originCy);
          if (distancePx <= 0.5) {
            zeroDistanceTransforms.push({
              index,
              cardId,
              originRect,
              destinationRect,
              distancePx,
            });
          }
          nextTransports.push({
            index,
            card,
            originRect,
            destinationRect,
            originSelector: origin === null ? originSelector : (origin.closest("[data-357-active-hand-region]") ? activeHandSelector : winnerSeatSelector),
            destinationSelector,
            distancePx,
          });
          if (origin) nextOriginEls.push(origin);
        }
      });

      if (missingOrigins.length > 0 || missingDestinations.length > 0 || nextTransports.length !== 3 || zeroDistanceTransforms.length > 0) {
        attempts += 1;
        if (attempts < maxAttempts) {
          raf = requestAnimationFrame(measure);
          return;
        }
        emitInvariantFailure({
          reason: missingOrigins.length > 0
            ? "origin_anchor_missing"
            : missingDestinations.length > 0
              ? "destination_anchor_missing"
              : "zero_distance_transform",
          generationKey,
          cardCount: cards.length,
          missingOrigins,
          missingDestinations,
          zeroDistanceTransforms,
          domSnapshot: buildDomSnapshot(),
        });
        return;
      }

      setTransports(nextTransports);
      setCompletedIndices(new Set());
      setPhase("origin");
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          if (!cancelled) setPhase("transporting");
        });
      });
    };

    raf = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [show, generationKey, proofCardSignature, winnerPosition]);

  useEffect(() => {
    if (phase !== "settled") return;
    if (transports.length !== 3) return;
    if (completedForKeyRef.current === generationKey) return;
    if (completedIndices.size !== 3) return;
    completedForKeyRef.current = generationKey;
    onCompleteRef.current?.();
  }, [phase, transports.length, completedIndices, generationKey]);

  if (!show || !cards || cards.length === 0) return null;

  const overlay = portalHost && transports.length === 3 && phase !== "measuring" && phase !== "hidden" && phase !== "blocked"
    ? createPortal(
        <div
          data-controller-357-proof-overlay-layer={generationKey}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          {transports.map((transport) => {
            const dx = transport.destinationRect.x - transport.originRect.x;
            const dy = transport.destinationRect.y - transport.originRect.y;
            const scaleX = transport.originRect.width > 0
              ? transport.destinationRect.width / transport.originRect.width
              : 1;
            const scaleY = transport.originRect.height > 0
              ? transport.destinationRect.height / transport.originRect.height
              : 1;
            const moving = phase === "transporting" || phase === "settled";
            return (
              <div
                key={`${generationKey}-overlay-${transport.index}-${transport.card.rank}${transport.card.suit}`}
                data-controller-357-proof-overlay-card={transport.index}
                data-controller-357-proof-origin-selector={transport.originSelector}
                data-controller-357-proof-destination-selector={transport.destinationSelector}
                data-controller-357-proof-distance-px={transport.distancePx.toFixed(2)}
                data-controller-357-proof-origin-rect={JSON.stringify(transport.originRect)}
                data-controller-357-proof-destination-rect={JSON.stringify(transport.destinationRect)}
                style={{
                  position: "fixed",
                  left: transport.originRect.x,
                  top: transport.originRect.y,
                  width: transport.originRect.width,
                  height: transport.originRect.height,
                  transformOrigin: "top left",
                  transform: moving
                    ? `translate3d(${dx}px, ${dy}px, 0) scale(${scaleX}, ${scaleY})`
                    : "translate3d(0, 0, 0) scale(1)",
                  transition: phase === "origin"
                    ? "none"
                    : "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                  willChange: "transform",
                }}
                onTransitionEnd={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.propertyName !== "transform") return;
                  if (phase !== "transporting") return;
                  setCompletedIndices((prev) => {
                    const next = new Set(prev);
                    next.add(transport.index);
                    if (next.size === 3) setPhase("settled");
                    return next;
                  });
                }}
              >
                <PlayingCard
                  card={transport.card}
                  size="md"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            );
          })}
        </div>,
        portalHost,
      )
    : null;

  return (
    <>
      <ThreeFiveSevenAnchoredSlot
        artifactId="threeFiveSeven.winnerTabledCardsStage"
        zIndex={45}
        innerStyle={{ pointerEvents: "none" }}
      >
        <div
          className="flex gap-2 sm:gap-3 items-center justify-center w-full h-full"
          data-anchor-owner="ThreeFiveSevenTerminalController.proofCards.targets"
          data-controller-357-proof-cards={generationKey}
          data-controller-357-proof-phase={phase}
          style={{ visibility: "hidden" }}
        >
          {cards.slice(0, 3).map((c, i) => (
            <div
              key={`${generationKey}-target-${i}-${c.rank}${c.suit}`}
              data-controller-357-proof-target-index={i}
            >
              <PlayingCard card={c} size="md" />
            </div>
          ))}
        </div>
      </ThreeFiveSevenAnchoredSlot>
      {overlay}
    </>
  );
};
