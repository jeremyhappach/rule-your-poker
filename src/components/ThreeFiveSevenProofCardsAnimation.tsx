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
  const [phase, setPhase] = useState<"hidden" | "entering" | "settled">("hidden");
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
      return;
    }
    // Enter next frame so CSS transition kicks in.
    setPhase("entering");
    const raf = requestAnimationFrame(() => setPhase("settled"));
    // Fire completion once the settle transition finishes.
    const t = setTimeout(() => {
      if (completedForKeyRef.current === generationKey) return;
      completedForKeyRef.current = generationKey;
      onCompleteRef.current?.();
    }, 1200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [show, generationKey]);

  if (!show || !cards || cards.length === 0) return null;

  // Bias entry from the winner's seat side. Positions 1..N — we don't
  // have full seat geometry here, so use a coarse top/bottom bias.
  const enterFromTop = typeof winnerPosition === 'number' && winnerPosition <= 2;
  const startTranslateY = enterFromTop ? "-40vh" : "40vh";

  return (
    <div
      className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center"
      data-anchor-owner="ThreeFiveSevenTerminalController.proofCards"
      data-controller-357-proof-cards="true"
    >
      <div className="flex gap-2 sm:gap-3">
        {cards.slice(0, 3).map((c, i) => {
          const settled = phase === "settled";
          return (
            <div
              key={`${generationKey}-${i}-${c.rank}${c.suit}`}
              style={{
                transform: settled
                  ? "translateY(0) scale(1.15)"
                  : `translateY(${startTranslateY}) scale(0.4)`,
                opacity: settled ? 1 : 0,
                transition:
                  "transform 900ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out",
                transitionDelay: settled ? `${i * 120}ms` : "0ms",
                filter: settled ? "drop-shadow(0 8px 16px rgba(0,0,0,0.5))" : "none",
              }}
            >
              <PlayingCard card={c} size="md" />
            </div>
          );
        })}
      </div>
    </div>
  );
};
