/**
 * HolmCanonicalCommunityRow — always-on community anchor strip used
 * during the Holm canonical deal (DealRuntime phase !== 'GAMEPLAY').
 *
 * Ownership contract:
 *   - 4 anchor slots (`data-card-anchor="community-${i}"`) are mounted
 *     unconditionally so the CardTransport runtime can resolve flight
 *     endpoints BEFORE the community wave dispatches. This is the fix
 *     for the "missing endpoint → fake settle" trap that left
 *     launchAt/arrivalAt/claimAt = null in the timeline.
 *   - The actual card DOM (face for i<2, back for i>=2) mounts ONLY
 *     when `deal.isSettled(`${handContextId}#community-${i}`)` is true.
 *   - No local dealtCardsRef / flippedCardsRef / setTimeout pipeline.
 *     This component is a pure projection of DealRuntime settled ids.
 *   - After the canonical deal completes the host swaps back to
 *     CommunityCards for the reveal / highlight pipeline.
 */

import { useEffect, useRef, useState } from 'react';
import type { Card as CardType } from '@/lib/cardUtils';
import { PlayingCard } from './PlayingCard';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { resolveCardRowLayout } from '@/lib/canonicalShell/useCardRowLayout';

interface HolmCanonicalCommunityRowProps {
  handContextId: string;
  cards: CardType[];
  tightOverlap?: boolean;
}

export function HolmCanonicalCommunityRow({
  handContextId,
  cards,
  tightOverlap = false,
}: HolmCanonicalCommunityRowProps) {
  const deal = useDealRuntime();
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
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = 4;
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
          preferredOverlapRatio: tightOverlap ? 0.08 : 0.03,
        })
      : null;

  return (
    <div
      ref={wrapperRef}
      data-holm-canonical-community-row=""
      className="relative flex items-center justify-center"
      style={{ width: '100%', height: '100%' }}
    >
      {layout && (
        <div className="flex items-center" style={{ height: layout.cardHeight }}>
          {Array.from({ length: count }, (_, i) => {
            const cardId = `${handContextId}#community-${i}`;
            const settled = deal ? deal.isSettled(cardId) : false;
            const showFace = i < 2;
            const card = cards[i];
            return (
              <div
                key={i}
                data-card-anchor={`community-${i}`}
                data-anchor-owner="HolmCanonicalCommunityRow"
                data-holm-component="COMMUNITY"
                data-holm-card-id={settled ? cardId : undefined}
                data-holm-renderer={settled ? 'HolmCanonicalCommunityRow' : undefined}
                style={{
                  position: 'relative',
                  width: layout.cardWidth,
                  height: layout.cardHeight,
                  marginLeft: i > 0 ? `-${layout.overlapPx}px` : '0',
                }}
              >
                {settled && showFace && card ? (
                  <PlayingCard
                    card={card}
                    style={{ width: layout.cardWidth, height: layout.cardHeight }}
                    faceFillPx={layout.cardWidth}
                  />
                ) : settled ? (
                  <CanonicalCardBack
                    widthPx={layout.cardWidth}
                    heightPx={layout.cardHeight}
                    variant="flat"
                    radiusPx={4}
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
