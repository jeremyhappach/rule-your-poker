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
 *   - The normal deal remains a pure projection of DealRuntime settled ids.
 *   - The late authoritative 2 -> 4 community reveal is represented by a
 *     hand-scoped visual flip queue. It never writes game state and only
 *     reports its completion to the presentation owner.
 */

import { useEffect, useRef, useState } from 'react';
import type { Card as CardType } from '@/lib/cardUtils';
import { isCardFaceResolved } from '@/lib/cardGames/resolvedCardFace';
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
import { useCardOverlap } from '@/lib/geometryLab/cardArtifactOverlap';

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
  /** Fires after cards 3 and 4 finish their visual reveal for this hand. */
  onFullRevealComplete?: (handContextId: string) => void;
}

const COMMUNITY_CARD_FLIP_MS = 600;
const COMMUNITY_CARD_FLIP_MIDPOINT_MS = COMMUNITY_CARD_FLIP_MS / 2;
const COMMUNITY_CARD_FLIP_GAP_MS = 120;

type CommunityFlip = {
  index: number;
  faceVisible: boolean;
};

function clampRevealedCount(revealed: number): number {
  return Math.max(0, Math.min(4, revealed));
}

export function HolmCanonicalCommunityRow({
  handContextId,
  cards,
  tightOverlap = false,
  revealed = 0,
  highlightedIndices = [],
  kickerIndices = [],
  hasHighlights = false,
  onFullRevealComplete,
}: HolmCanonicalCommunityRowProps) {
  const deal = useDealRuntime();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const targetRevealed = clampRevealedCount(revealed);
  const [visuallyRevealed, setVisuallyRevealed] = useState(targetRevealed);
  const [activeFlip, setActiveFlip] = useState<CommunityFlip | null>(null);
  const presentationHandRef = useRef(handContextId);
  const initialPresentationRef = useRef(true);
  const targetRevealedRef = useRef(targetRevealed);
  const visuallyRevealedRef = useRef(targetRevealed);
  const activeFlipRef = useRef<CommunityFlip | null>(null);
  const revealGapPendingRef = useRef(false);
  const fullRevealCompletedHandRef = useRef<string | null>(null);
  const cardsRef = useRef(cards);
  const onFullRevealCompleteRef = useRef(onFullRevealComplete);
  const revealTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const startNextRevealRef = useRef<() => void>(() => {});

  cardsRef.current = cards;

  useEffect(() => {
    onFullRevealCompleteRef.current = onFullRevealComplete;
  }, [onFullRevealComplete]);

  const clearRevealTimers = () => {
    revealTimersRef.current.forEach((timer) => clearTimeout(timer));
    revealTimersRef.current.clear();
    revealGapPendingRef.current = false;
  };

  const setRevealTimer = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      revealTimersRef.current.delete(timer);
      callback();
    }, delayMs);
    revealTimersRef.current.add(timer);
  };

  const completeFullRevealIfReady = () => {
    if (
      targetRevealedRef.current < 4 ||
      visuallyRevealedRef.current < 4 ||
      activeFlipRef.current !== null ||
      !cardsRef.current.slice(0, 4).every(isCardFaceResolved) ||
      cardsRef.current.length < 4 ||
      fullRevealCompletedHandRef.current === handContextId
    ) {
      return;
    }
    fullRevealCompletedHandRef.current = handContextId;
    onFullRevealCompleteRef.current?.(handContextId);
  };

  const startNextReveal = () => {
    if (activeFlipRef.current !== null || revealGapPendingRef.current) return;

    // Holm tables cards 1 and 2 face-up in the normal deal. This queue owns
    // only the late, hidden-card reveal.
    if (visuallyRevealedRef.current < 2) {
      const openingCount = Math.min(2, targetRevealedRef.current);
      visuallyRevealedRef.current = openingCount;
      setVisuallyRevealed(openingCount);
    }

    const nextIndex = visuallyRevealedRef.current;
    if (nextIndex >= targetRevealedRef.current || nextIndex >= 4) {
      completeFullRevealIfReady();
      return;
    }

    // Do not invent a face or start an animation until the authoritative card
    // identity for this slot has arrived.
    if (!isCardFaceResolved(cardsRef.current[nextIndex])) return;

    const sequenceHand = handContextId;
    const flip: CommunityFlip = { index: nextIndex, faceVisible: false };
    activeFlipRef.current = flip;
    setActiveFlip(flip);

    setRevealTimer(() => {
      if (presentationHandRef.current !== sequenceHand) return;
      const midpointFlip: CommunityFlip = { index: nextIndex, faceVisible: true };
      activeFlipRef.current = midpointFlip;
      setActiveFlip(midpointFlip);
    }, COMMUNITY_CARD_FLIP_MIDPOINT_MS);

    setRevealTimer(() => {
      if (presentationHandRef.current !== sequenceHand) return;
      activeFlipRef.current = null;
      visuallyRevealedRef.current = nextIndex + 1;
      setActiveFlip(null);
      setVisuallyRevealed(nextIndex + 1);

      if (nextIndex + 1 >= targetRevealedRef.current) {
        completeFullRevealIfReady();
      } else {
        revealGapPendingRef.current = true;
        setRevealTimer(() => {
          if (presentationHandRef.current !== sequenceHand) return;
          revealGapPendingRef.current = false;
          startNextRevealRef.current();
        }, COMMUNITY_CARD_FLIP_GAP_MS);
      }
    }, COMMUNITY_CARD_FLIP_MS);
  };

  startNextRevealRef.current = startNextReveal;

  // A live authoritative 2 -> 4 jump becomes two local visual flips. An
  // initial/historical mount reconciles directly and never replays old cards.
  useEffect(() => {
    const isInitialPresentation = initialPresentationRef.current;
    const handChanged = presentationHandRef.current !== handContextId;
    if (!isInitialPresentation && !handChanged) return;

    initialPresentationRef.current = false;
    presentationHandRef.current = handContextId;
    clearRevealTimers();
    targetRevealedRef.current = targetRevealed;
    visuallyRevealedRef.current = targetRevealed;
    activeFlipRef.current = null;
    fullRevealCompletedHandRef.current = null;
    setVisuallyRevealed(targetRevealed);
    setActiveFlip(null);
    completeFullRevealIfReady();
  }, [handContextId, targetRevealed]);

  useEffect(() => {
    targetRevealedRef.current = targetRevealed;
    if (targetRevealed < 4) fullRevealCompletedHandRef.current = null;
    startNextRevealRef.current();
  }, [targetRevealed, cards]);

  useEffect(() => () => clearRevealTimers(), []);

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
  const fanOverlap = useCardOverlap('cardOverlap.holm.community');
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
          preferredOverlapRatio: fanOverlap,
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
    const samePresentationHand = presentationHandRef.current === handContextId;
    const isFlippingThisCard = samePresentationHand && activeFlip?.index === i;
    const faceUp = settled && isCardFaceResolved(card) && (
      i < 2 ||
      (samePresentationHand ? visuallyRevealed : targetRevealed) > i ||
      (isFlippingThisCard && activeFlip.faceVisible)
    );
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
            const isFlippingThisCard = activeFlip?.index === i;
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
                  marginLeft: i > 0 ? `${-layout.overlapPx}px` : '0',
                  perspective: isFlippingThisCard ? '400px' : undefined,
                }}
              >
                <div
                  style={
                    isFlippingThisCard
                      ? {
                          width: '100%',
                          height: '100%',
                          transformStyle: 'preserve-3d',
                          transition: `transform ${COMMUNITY_CARD_FLIP_MIDPOINT_MS}ms ease-out`,
                          transform: activeFlip?.faceVisible
                            ? 'rotateY(0deg) scale(1.08)'
                            : 'rotateY(90deg) scale(1.08)',
                        }
                      : {
                          width: '100%',
                          height: '100%',
                          transformStyle: 'preserve-3d',
                          transition: `transform ${COMMUNITY_CARD_FLIP_MIDPOINT_MS}ms ease-out`,
                          transform: 'rotateY(0deg) scale(1)',
                        }
                  }
                >
                  {renderedAs === 'face' && card ? (
                    <PlayingCard
                      card={card}
                      tier="large"
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
