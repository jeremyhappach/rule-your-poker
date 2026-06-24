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
import {
  armCommunityLandingSampler,
  recordCommunityDomLifecycle,
  recordCommunityPresentationState,
} from '@/lib/canonicalShell/cardTransport/holmCommunityLandingForensics';
import { resolveCardRowLayout } from '@/lib/canonicalShell/useCardRowLayout';
import { ffRecord } from '@/lib/canonicalShell/cardTransport/holmFullForensics';

interface HolmCanonicalCommunityRowProps {
  handContextId: string;
  cards: CardType[];
  tightOverlap?: boolean;
  /**
   * Number of community cards currently revealed face-up for the late-hand
   * reveal pipeline. Slots 0 and 1 are always face-up by Holm rules; slots
   * 2 and 3 flip face-up once `revealed` advances past them.
   *
   * When DealRuntime is in DEALING and the card is not yet settled, the
   * slot still renders as an empty anchor regardless of `revealed`.
   */
  revealed?: number;
  highlightedIndices?: number[];
  kickerIndices?: number[];
  hasHighlights?: boolean;
}

export function HolmCanonicalCommunityRow({
  handContextId,
  cards,
  tightOverlap = false,
  revealed = 0,
  highlightedIndices = [],
  kickerIndices = [],
  hasHighlights = false,
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

  // Arm bounded community landing sampler once per hand identity.
  useEffect(() => {
    armCommunityLandingSampler({ handContextId, expectedCount: 4 });
  }, [handContextId]);

  // Per-slot mount/unmount lifecycle.
  useEffect(() => {
    for (let i = 0; i < 4; i++) {
      recordCommunityDomLifecycle({
        writerId: 'HolmCanonicalCommunityRow.tsx:mountEffect',
        handContextId,
        slotIndex: i,
        cardId: `${handContextId}#community-${i}`,
        event: 'mount',
      });
    }
    return () => {
      for (let i = 0; i < 4; i++) {
        recordCommunityDomLifecycle({
          writerId: 'HolmCanonicalCommunityRow.tsx:unmountEffect',
          handContextId,
          slotIndex: i,
          cardId: `${handContextId}#community-${i}`,
          event: 'unmount',
        });
      }
    };
  }, [handContextId]);

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

  // Per-slot presentation rule (stable across DealRuntime READY→GAMEPLAY):
  //   - If DealRuntime is mounted and the slot's cardId is NOT settled,
  //     render an empty anchor (no card content) regardless of `revealed`.
  //   - Otherwise (settled OR no DealRuntime ancestor / post-deal path):
  //       i < 2          → face-up
  //       i >= 2         → face-up iff revealed > i, else card back
  //   The slot <div> node and its stable key=cardId DO NOT change across
  //   the deal-phase boundary; only the inner card content transitions
  //   in place. This is the invariant required to eliminate the
  //   READY→GAMEPLAY structural remount blink.
  const slotRenderedAs: Array<'face' | 'back' | 'empty-anchor'> = [];
  const slotFaceUpMask: boolean[] = [];
  const cardIdsForRecord: string[] = [];
  const renderKeysForRecord: string[] = [];
  for (let i = 0; i < count; i++) {
    const cardId = `${handContextId}#community-${i}`;
    const settled = deal ? deal.isSettled(cardId) : true;
    const card = cards[i];
    const faceUp = settled && !!card && (i < 2 || revealed > i);
    const showBack = settled && !faceUp;
    slotFaceUpMask.push(faceUp);
    slotRenderedAs.push(faceUp ? 'face' : showBack ? 'back' : 'empty-anchor');
    cardIdsForRecord.push(cardId);
    renderKeysForRecord.push(cardId);
  }

  recordCommunityPresentationState({
    writerId: 'HolmCanonicalCommunityRow.tsx:presentationAggregate',
    handContextId,
    sourceBranch: 'HolmCanonicalCommunityRow',
    cardIds: cardIdsForRecord,
    faceUpMask: slotFaceUpMask,
    renderedAs: slotRenderedAs,
    renderKeys: renderKeysForRecord,
  });

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
            const renderedAs = slotRenderedAs[i];
            const faceUp = slotFaceUpMask[i];
            const card = cards[i];
            ffRecord({
              writerId: 'HolmCanonicalCommunityRow.tsx:slotRender:L87',
              source: 'HOLM_COMMUNITY_ROW',
              marker: 'HOLM_COMMUNITY_SLOT_RENDER',
              identity: { segmentId: handContextId },
              payload: {
                slotIndex: i,
                cardId,
                settled: renderedAs !== 'empty-anchor',
                showFace: faceUp,
                hasCard: !!card,
                renderedAs,
                hasDealRuntime: !!deal,
              },
            });
            return (
              <div
                key={cardId}
                data-card-anchor={`community-${i}`}
                data-anchor-owner="HolmCanonicalCommunityRow"
                data-holm-component="COMMUNITY"
                data-holm-card-id={cardId}
                data-holm-renderer="HolmCanonicalCommunityRow"
                style={{
                  position: 'relative',
                  width: layout.cardWidth,
                  height: layout.cardHeight,
                  marginLeft: i > 0 ? `-${layout.overlapPx}px` : '0',
                }}
              >
                {renderedAs === 'face' && card ? (
                  <PlayingCard
                    card={card}
                    style={{ width: layout.cardWidth, height: layout.cardHeight }}
                    faceFillPx={layout.cardWidth}
                    isHighlighted={highlightedIndices.includes(i)}
                    isKicker={kickerIndices.includes(i)}
                    isDimmed={
                      hasHighlights &&
                      !highlightedIndices.includes(i) &&
                      !kickerIndices.includes(i)
                    }
                  />
                ) : renderedAs === 'back' ? (
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
