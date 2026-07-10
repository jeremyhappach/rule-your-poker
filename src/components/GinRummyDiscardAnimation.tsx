// Gin Rummy discard transport animation.
//
// Visual-only overlay. Symmetric to GinRummySelfDrawAnimation /
// GinRummyOpponentDrawAnimation but reversed direction:
//   self mode:     [data-gin-active-pane-content]           → [data-card-anchor="discard"]
//   opponent mode: [data-card-anchor="opp-stack-${pos}"]    → [data-card-anchor="discard"]
//
// - Face-up, using the known discarded card identity from the action.
// - ~550ms transport with ~700ms settle window, matching draw animations.
// - Snapshots viewport-space rects on mount; skips animation if either
//   source or destination rect is unavailable (leaves authoritative
//   discard-pile state to render correctly with no flash).
// - Fires onSettled() so the parent can clear its withhold gate; on
//   skip it fires onSettled() immediately so nothing gets stuck hidden.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import type { GinRummyCard } from '@/lib/ginRummyTypes';

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

export type GinRummyDiscardSourceMode = 'self' | 'opponent';

interface Props {
  triggerId: string | null;
  sourceMode: GinRummyDiscardSourceMode;
  /** Required when sourceMode === 'opponent'. Seat position (1..7). */
  opponentPosition?: number | null;
  card: GinRummyCard | null;
  /**
   * Optional viewport-space rect of the actual card being discarded,
   * captured synchronously by the caller BEFORE authoritative state
   * mutates. When present, the overlay starts from this rect's center
   * instead of the mode-derived centroid fallback.
   */
  sourceRect?: { x: number; y: number; width: number; height: number } | null;
  /** Called once the animation has settled (matches 700ms lifecycle),
   *  OR immediately if the animation was skipped (missing rects). */
  onSettled?: () => void;
}

interface Snapshot {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function resolveDiscardRect(): DOMRect | null {
  const el = document.querySelector('[data-card-anchor="discard"]') as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

function resolveSourceRect(
  mode: GinRummyDiscardSourceMode,
  opponentPosition: number | null | undefined,
): DOMRect | null {
  if (mode === 'self') {
    const el = document.querySelector('[data-gin-active-pane-content]') as HTMLElement | null;
    return el ? el.getBoundingClientRect() : null;
  }
  if (opponentPosition == null) return null;
  const el = document.querySelector(
    `[data-card-anchor="opp-stack-${opponentPosition}"]`,
  ) as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

export const GinRummyDiscardAnimation = ({
  triggerId,
  sourceMode,
  opponentPosition,
  card,
  sourceRect,
  onSettled,
}: Props) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  // Stabilize onSettled so a busy parent re-render doesn't reset our timer.
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);

  useEffect(() => {
    if (!triggerId || !card) return;

    // Prefer an explicit sourceRect captured by the caller BEFORE
    // authoritative state mutated (e.g. the actual selected card
    // button's rect). Fall back to the mode-derived centroid resolver
    // when unavailable.
    const src: { left: number; top: number; width: number; height: number } | null =
      sourceRect && sourceRect.width > 0 && sourceRect.height > 0
        ? { left: sourceRect.x, top: sourceRect.y, width: sourceRect.width, height: sourceRect.height }
        : resolveSourceRect(sourceMode, opponentPosition ?? null);
    const dst = resolveDiscardRect();

    // Skip animation if either endpoint is missing. Authoritative
    // discard-pile state renders normally; parent should still clear
    // its withhold gate via onSettled.
    if (!src || !dst) {
      onSettledRef.current?.();
      return;
    }

    const snap: Snapshot = {
      startX: src.left + src.width / 2,
      startY: src.top + src.height / 2,
      endX: dst.left + dst.width / 2,
      endY: dst.top + dst.height / 2,
    };

    setSnapshot(snap);
    setVisible(true);
    setAnimating(false);
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimating(true));
    });

    const settleTimer = setTimeout(() => {
      setVisible(false);
      setSnapshot(null);
      onSettledRef.current?.();
    }, 700);

    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(settleTimer);
    };
  }, [triggerId, sourceMode, opponentPosition, card]);

  if (!visible || !snapshot || !card) return null;

  const x = animating ? snapshot.endX : snapshot.startX;
  const y = animating ? snapshot.endY : snapshot.startY;

  const node = (
    <div
      className="pointer-events-none"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 80,
        transform: `translate(-50%, -50%) scale(${animating ? 0.95 : 1})`,
        opacity: 1,
        transitionProperty: 'left, top, transform, opacity',
        transitionDuration: '550ms',
        transitionTimingFunction: 'ease-in-out',
      }}
      data-gin-discard-animation=""
    >
      <CribbagePlayingCard
        card={{
          suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
          rank: card.rank,
          value: card.value,
        }}
        size="lg"
      />
    </div>
  );

  return createPortal(node, document.body);
};
