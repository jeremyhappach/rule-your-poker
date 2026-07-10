// Self-draw transport animation for Gin Rummy.
//
// Mirrors GinRummyOpponentDrawAnimation's contract (face-down for stock,
// face-up for discard, ~700ms transport, withhold during flight) but
// resolves the DESTINATION to the active-player box rather than an
// opponent seat. Source remains the actual selected pile.
//
// Positioning uses position: fixed against viewport pixel rects so we can
// span the felt → HUD boundary (the active-pane lives outside the felt
// container).
//
// Endpoint resolution mirrors the existing active-pane MutationObserver/
// rebind pattern used by GinRummyDealOrchestrator: when the trigger fires
// we snapshot pile rect + [data-gin-active-pane-content] rect once.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
import type { GinRummyCard } from '@/lib/ginRummyTypes';

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

interface Props {
  triggerId: string | null;
  drawSource: 'stock' | 'discard';
  card: GinRummyCard | null;
  cardBackColors: { color: string; darkColor: string };
  /**
   * Optional estimated viewport-space landing rect for the drawn
   * card's projected sorted position in the local fan. When provided
   * and valid, the overlay lands at this rect's center instead of the
   * active-pane centroid. Missing / invalid → centroid fallback.
   */
  targetRect?: { x: number; y: number; width: number; height: number } | null;
  /** Called once the animation has settled (matches 700ms lifecycle). */
  onSettled?: () => void;
}

interface Snapshot {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function resolvePileRect(source: 'stock' | 'discard'): DOMRect | null {
  const selector = source === 'stock'
    ? '[data-card-anchor="stock"]'
    : '[data-card-anchor="discard"]';
  const el = document.querySelector(selector) as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

function resolveActivePaneRect(): DOMRect | null {
  const el = document.querySelector('[data-gin-active-pane-content]') as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

export const GinRummySelfDrawAnimation = ({
  triggerId,
  drawSource,
  card,
  cardBackColors,
  targetRect,
  onSettled,
}: Props) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  // Stabilize onSettled across parent re-renders so the 700ms transport
  // timer isn't reset on every render of GinRummyGameTable. Without this,
  // a busy parent (opponent turn ticks, presentation updates) keeps
  // deferring settle indefinitely and the withheld card never releases.
  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);

  useEffect(() => {
    if (!triggerId) return;

    const tryResolve = (): Snapshot | null => {
      const pile = resolvePileRect(drawSource);
      // Prefer the caller-supplied estimated landing rect when it is
      // valid — that's the drawn card's projected sorted position in
      // the local fan. Fall back to the active-pane centroid.
      const hasTargetRect =
        !!targetRect && targetRect.width > 0 && targetRect.height > 0;
      const pane = hasTargetRect ? null : resolveActivePaneRect();
      if (!pile) return null;
      if (!hasTargetRect && !pane) return null;
      const endX = hasTargetRect ? targetRect!.x : pane!.left + pane!.width / 2;
      const endY = hasTargetRect ? targetRect!.y : pane!.top + pane!.height * 0.5;
      return {
        startX: pile.left + pile.width / 2,
        startY: pile.top + pile.height / 2,
        endX,
        endY,
      };
    };

    let observer: MutationObserver | null = null;
    let cleared = false;

    const launch = (snap: Snapshot) => {
      if (cleared) return;
      setSnapshot(snap);
      setVisible(true);
      setAnimating(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    };

    const initial = tryResolve();
    if (initial) {
      launch(initial);
    } else {
      observer = new MutationObserver(() => {
        const snap = tryResolve();
        if (snap) {
          observer?.disconnect();
          observer = null;
          launch(snap);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const settleTimer = setTimeout(() => {
      setVisible(false);
      setSnapshot(null);
      onSettledRef.current?.();
    }, 700);

    return () => {
      cleared = true;
      observer?.disconnect();
      clearTimeout(settleTimer);
    };
  }, [triggerId, drawSource]);

  if (!visible || !snapshot) return null;

  const isFaceUp = drawSource === 'discard' && card;
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
        transform: `translate(-50%, -50%) scale(${animating ? 0.85 : 1})`,
        opacity: animating ? 0 : 1,
        transitionProperty: 'left, top, transform, opacity',
        transitionDuration: '550ms',
        transitionTimingFunction: 'ease-in-out',
      }}
      data-gin-self-draw-animation=""
    >
      {isFaceUp ? (
        <CribbagePlayingCard
          card={{
            suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
            rank: card.rank,
            value: card.value,
          }}
          size="lg"
        />
      ) : (
        <CanonicalCardBack
          widthPx={48}
          heightPx={68}
          variant="raised"
          radiusPx={6}
        />
      )}
    </div>
  );

  return createPortal(node, document.body);
};
