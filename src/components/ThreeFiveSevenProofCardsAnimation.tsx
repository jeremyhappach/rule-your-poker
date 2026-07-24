/**
 * ThreeFiveSevenProofCardsAnimation — instant-357 proof-card prelude.
 *
 * Renders face-up OVERLAY copies of the winner's authoritative 3-5-7
 * cards. Does NOT reparent or mutate the actual hand DOM; the winner's
 * hand region keeps its native layout space reserved.
 *
 * Presentation is deliberately geometry-simple in this slice:
 *   - Absolutely positioned overlay inside the same felt surface the
 *     terminal controller mounts under.
 *   - Three cards start slightly offset toward the winner's seat edge
 *     (top/bottom) with 0 scale + 0 opacity, then lift/enlarge and
 *     settle into three centered felt slots.
 *   - After the settle transition finishes the animation emits
 *     `onComplete` exactly once for the active `generationKey`.
 *   - The tabled cards remain visible until the controller unmounts
 *     the animation (descriptor rotation).
 *
 * Consumers must feed the immutable `descriptor.proofCards` array —
 * never derive faces from live hand state.
 */

import { useEffect, useRef, useState } from "react";
import type { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { ThreeFiveSevenAnchoredSlot } from "@/components/ThreeFiveSevenAnchoredSlot";

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
}

export const ThreeFiveSevenProofCardsAnimation = ({
  show,
  cards,
  winnerPosition,
  generationKey,
  onComplete,
}: ThreeFiveSevenProofCardsAnimationProps) => {
  const [phase, setPhase] = useState<"hidden" | "measuring" | "entering" | "settled">("hidden");
  const [offsets, setOffsets] = useState<Array<{ x: number; y: number; scale: number }>>([]);
  const completedForKeyRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Reset when generation rotates.
  useEffect(() => {
    completedForKeyRef.current = null;
    setPhase("hidden");
  }, [generationKey]);

  useEffect(() => {
    if (!show) {
      setPhase("hidden");
      setOffsets([]);
      return;
    }
    // Render once at the canonical tabled-card stage with opacity 0 so
    // the final rects are measurable, then animate overlay copies from
    // the live dealt-card rects into that same stage.
    setPhase("measuring");
    let settleRaf = 0;
    const measureRaf = requestAnimationFrame(() => {
      const root = document.querySelector<HTMLElement>(
        `[data-controller-357-proof-cards="${generationKey}"]`,
      );
      const cssEscape = (value: string) => {
        const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
        return esc ? esc(value) : value.replace(/(["\\#.;:[\]()])/g, "\\$1");
      };
      const nextOffsets = cards.slice(0, 3).map((card, index) => {
        const target = root?.querySelector<HTMLElement>(
          `[data-controller-357-proof-card-index="${index}"] [data-playing-card-root]`,
        );
        const cardId = `${card.rank}-${card.suit}`;
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(`[data-card-id="${cssEscape(cardId)}"]`),
        ).filter((el) => !el.closest("[data-controller-357-proof-cards]"));
        const origin = candidates[index] ?? candidates[0] ?? null;
        if (!target || !origin) {
          const enterFromTop = typeof winnerPosition === "number" && winnerPosition <= 2;
          return { x: 0, y: enterFromTop ? -window.innerHeight * 0.4 : window.innerHeight * 0.4, scale: 0.4 };
        }
        const tr = target.getBoundingClientRect();
        const or = origin.getBoundingClientRect();
        const targetCx = tr.left + tr.width / 2;
        const targetCy = tr.top + tr.height / 2;
        const originCx = or.left + or.width / 2;
        const originCy = or.top + or.height / 2;
        return {
          x: originCx - targetCx,
          y: originCy - targetCy,
          scale: tr.width > 0 ? Math.max(0.35, Math.min(1.4, or.width / tr.width)) : 0.65,
        };
      });
      setOffsets(nextOffsets);
      setPhase("entering");
      settleRaf = requestAnimationFrame(() => setPhase("settled"));
    });
    // Fire completion once the settle transition finishes.
    const t = setTimeout(() => {
      if (completedForKeyRef.current === generationKey) return;
      completedForKeyRef.current = generationKey;
      onCompleteRef.current?.();
    }, 1500);
    return () => {
      cancelAnimationFrame(measureRaf);
      cancelAnimationFrame(settleRaf);
      clearTimeout(t);
    };
  }, [show, generationKey, cards, winnerPosition]);

  if (!show || !cards || cards.length === 0) return null;

  return (
    <ThreeFiveSevenAnchoredSlot
      artifactId="threeFiveSeven.winnerTabledCardsStage"
      zIndex={45}
      innerStyle={{ pointerEvents: "none" }}
    >
      <div
        className="flex gap-2 sm:gap-3 items-center justify-center w-full h-full"
        data-anchor-owner="ThreeFiveSevenTerminalController.proofCards"
        data-controller-357-proof-cards={generationKey}
      >
        {cards.slice(0, 3).map((c, i) => {
          const settled = phase === "settled";
          const entering = phase === "entering";
          const offset = offsets[i] ?? { x: 0, y: 0, scale: 0.4 };
          return (
            <div
              key={`${generationKey}-${i}-${c.rank}${c.suit}`}
              data-controller-357-proof-card-index={i}
              style={{
                transform: settled
                  ? "translate3d(0, 0, 0) scale(1)"
                  : entering
                    ? `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${offset.scale})`
                    : "translate3d(0, 0, 0) scale(1)",
                opacity: settled ? 1 : 0,
                transition:
                  phase === "measuring"
                    ? "none"
                    : "transform 900ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out",
                transitionDelay: settled ? `${i * 120}ms` : "0ms",
                filter: settled ? "drop-shadow(0 8px 16px rgba(0,0,0,0.5))" : "none",
              }}
            >
              <PlayingCard card={c} size="md" />
            </div>
          );
        })}
      </div>
    </ThreeFiveSevenAnchoredSlot>
  );
};
