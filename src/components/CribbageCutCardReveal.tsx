import { useState, useEffect, useRef } from 'react';
import type { CribbageCard } from '@/lib/cribbageTypes';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { buildMetaPayload } from '@/lib/buildMeta';

interface CribbageCutCardRevealProps {
  card: CribbageCard | null;
  cardBackColors: { color: string; darkColor: string };
  /** When provided, clearing the revealed-cards cache on change prevents re-flip after remount */
  handBoundaryKey?: string;
  /** Wave 5D.1 — stage-derived card width (px). Forwarded to CribbagePlayingCard
   *  and used to size the back-face placeholder so the artwork fits inside the
   *  cribCutGroup assignedRect. When omitted, falls back to the `sm` token. */
  widthPx?: number;
}


/**
 * Module-scoped registry of cut-card flipKeys that have already animated.
 *
 * ROOT-CAUSE FIX (duplicate cut-card animation):
 * The previous implementation kept the "consumed" Set in a component-local
 * useRef. Hand-boundary freeze → reset → freeze → snapshot → unfreeze cycles
 * cause the gameplay surface (`isGameplayMode && viewState`) to unmount and
 * remount this component. On remount the local ref was freshly seeded, so a
 * subsequent null → card visibilityEdge re-ran the flip animation for a hand
 * that had already revealed its cut card.
 *
 * Keying by handBoundaryKey scopes the registry to a single hand. A small
 * FIFO cap prevents unbounded growth across long sessions.
 */
const cutCardConsumedRegistry = new Map<string, Set<string>>();
const CUT_CARD_REGISTRY_MAX_BOUNDARIES = 16;

function getConsumedSet(handBoundaryKey: string | undefined): Set<string> {
  const key = handBoundaryKey ?? 'no-hand-key';
  let set = cutCardConsumedRegistry.get(key);
  if (!set) {
    set = new Set<string>();
    cutCardConsumedRegistry.set(key, set);
    if (cutCardConsumedRegistry.size > CUT_CARD_REGISTRY_MAX_BOUNDARIES) {
      const firstKey = cutCardConsumedRegistry.keys().next().value;
      if (firstKey !== undefined) cutCardConsumedRegistry.delete(firstKey);
    }
  }
  return set;
}

/**
 * A cut card display with flip animation when revealed.
 *
 * The flip animation fires exactly once per (handBoundaryKey, cardKey). The
 * consumed registry survives component remounts so freeze/unfreeze bounces
 * cannot replay it.
 */
export const CribbageCutCardReveal = ({
  card,
  cardBackColors,
  handBoundaryKey,
  widthPx,
}: CribbageCutCardRevealProps) => {

  const initialCardKey = card ? `${card.rank}-${card.suit}` : null;
  const initialFlipKey = initialCardKey
    ? `${handBoundaryKey ?? 'no-hand-key'}:${initialCardKey}`
    : null;
  // ROOT-CAUSE FIX (zero-flip regression):
  // Do NOT eagerly seed the consumed registry at mount. A mount with a card
  // already visible may be EITHER:
  //   (a) a true remount within a hand boundary whose flip has already played
  //       elsewhere — registry already contains flipKey → effect will suppress
  //   (b) the legitimate first reveal that arrived in the same render as the
  //       mount — registry empty → effect must animate exactly once
  // Eager seeding collapses (a) and (b) into "always suppress", killing the
  // legitimate first flip. Let the effect consult the registry instead.
  const alreadyConsumedAtMount = Boolean(
    initialFlipKey && getConsumedSet(handBoundaryKey).has(initialFlipKey)
  );

  const [isFlipping, setIsFlipping] = useState(false);
  // Show face immediately only on true remounts (registry already consumed).
  // Legitimate first reveals start back-side so the flip animation can play.
  const [showFace, setShowFace] = useState(alreadyConsumedAtMount);

  const currentCardKeyRef = useRef<string | null>(null);
  // Initialize to null so the first effect run with a card registers as a
  // visibility edge and routes through the registry check / animation path.
  const previousVisibleCardKeyRef = useRef<string | null>(null);

  // Log mount/remount with hand boundary key
  useEffect(() => {
    logDebugEvent({
      gameId: 'cut-card-reveal',
      eventType: 'crib:cut_card_reveal:mounted',
      payload: {
        handBoundaryKey: handBoundaryKey ?? null,
        hasCard: card !== null,
        cardKey: card ? `${card.rank}${card.suit}` : null,
        mountedWithVisibleCard: card !== null,
        consumedSetSize: getConsumedSet(handBoundaryKey).size,
        ...buildMetaPayload(),
      },
    });
    return () => {
      logDebugEvent({
        gameId: 'cut-card-reveal',
        eventType: 'crib:cut_card_reveal:unmounted',
        payload: { handBoundaryKey: handBoundaryKey ?? null },
      });
    };
  }, [handBoundaryKey]);

  useEffect(() => {
    const cardKey = card ? `${card.rank}-${card.suit}` : null;
    const flipKey = cardKey
      ? `${handBoundaryKey ?? 'no-hand-key'}:${cardKey}`
      : null;
    const visibilityEdge = !previousVisibleCardKeyRef.current && !!cardKey;
    previousVisibleCardKeyRef.current = cardKey;

    if (!cardKey) {
      currentCardKeyRef.current = null;
      setShowFace(false);
      setIsFlipping(false);
      return;
    }

    if (cardKey === currentCardKeyRef.current && !visibilityEdge) {
      return;
    }

    currentCardKeyRef.current = cardKey;

    if (!visibilityEdge) {
      // OLD → NEW card swap within the same boundary (should not happen in
      // normal play but guard anyway): show face without animating.
      setShowFace(true);
      setIsFlipping(false);
      return;
    }

    const consumed = getConsumedSet(handBoundaryKey);
    if (flipKey && consumed.has(flipKey)) {
      logDebugEvent({
        gameId: 'cut-card-reveal',
        eventType: 'crib-cut-flip-replay-suppressed',
        payload: {
          handBoundaryKey: handBoundaryKey ?? null,
          cardKey,
          reason: 'registry-hit-on-visibility-edge',
        },
      });
      setShowFace(true);
      setIsFlipping(false);
      return;
    }

    if (flipKey) consumed.add(flipKey);

    setIsFlipping(true);
    setShowFace(false);

    // Flip to face at midpoint
    const flipTimer = setTimeout(() => {
      setShowFace(true);
    }, 300);

    // End animation
    const endTimer = setTimeout(() => {
      setIsFlipping(false);
    }, 600);

    return () => {
      clearTimeout(flipTimer);
      clearTimeout(endTimer);
    };
  }, [card?.rank, card?.suit, handBoundaryKey]);

  if (!card) return null;

  const backWidth = typeof widthPx === 'number' && widthPx > 0 ? widthPx : 32;
  const backHeight = backWidth * 1.5;
  const labelFontPx = Math.max(7, Math.round(backWidth * 0.28));

  return (
    <div className="flex flex-col items-center">
      <span
        className="text-white/60 leading-none"
        style={{ fontSize: `${labelFontPx}px`, marginBottom: '2px' }}
      >
        Cut
      </span>
      <div
        className="transition-transform duration-600 ease-out"
        style={{
          perspective: '400px',
        }}
      >
        <div
          className="relative transition-transform duration-300 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipping
              ? showFace
                ? 'rotateY(0deg) scale(1.1)'
                : 'rotateY(90deg) scale(1.1)'
              : 'rotateY(0deg) scale(1)',
          }}
        >
          {showFace || !isFlipping ? (
            <CribbagePlayingCard card={card} size="sm" widthPx={widthPx} />
          ) : (
            <div
              className="rounded-sm border border-white/20"
              style={{
                width: `${backWidth}px`,
                height: `${backHeight}px`,
                background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

