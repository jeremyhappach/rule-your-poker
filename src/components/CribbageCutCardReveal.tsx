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
}

/**
 * A cut card display with flip animation when revealed
 * 
 * IMPORTANT: Only animates once per card reveal. Uses a stable "revealed cards" set
 * to prevent re-flipping during phase transitions or component re-renders.
 */
export const CribbageCutCardReveal = ({
  card,
  cardBackColors,
  handBoundaryKey,
}: CribbageCutCardRevealProps) => {
  const initialCardKey = card ? `${card.rank}-${card.suit}` : null;
  const initialFlipKey = initialCardKey ? `${handBoundaryKey ?? 'no-hand-key'}:${initialCardKey}` : null;
  const [isFlipping, setIsFlipping] = useState(false);
  const [showFace, setShowFace] = useState(Boolean(card));
  
  // Track which cut card reveals have already been consumed for this hand boundary.
  // Seed from the initial visible card so remounts during pegging don't fake a new reveal edge.
  const cutCardFlipConsumedRef = useRef<Set<string>>(new Set(initialFlipKey ? [initialFlipKey] : []));
  const currentCardKeyRef = useRef<string | null>(initialCardKey);
  const previousVisibleCardKeyRef = useRef<string | null>(initialCardKey);
  const lastBoundaryKeyRef = useRef<string | undefined>(handBoundaryKey);

  // Reset hand-scoped refs when the hand boundary changes.
  if (handBoundaryKey !== lastBoundaryKeyRef.current) {
    lastBoundaryKeyRef.current = handBoundaryKey;
    const nextCardKey = card ? `${card.rank}-${card.suit}` : null;
    const nextFlipKey = nextCardKey ? `${handBoundaryKey ?? 'no-hand-key'}:${nextCardKey}` : null;
    cutCardFlipConsumedRef.current = new Set(nextFlipKey ? [nextFlipKey] : []);
    currentCardKeyRef.current = nextCardKey;
    previousVisibleCardKeyRef.current = nextCardKey;
  }

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
        ...buildMetaPayload(),
      },
    });
    if (card) {
      logDebugEvent({
        gameId: 'cut-card-reveal',
        eventType: 'crib-cut-flip-replay-detected',
        payload: {
          handBoundaryKey: handBoundaryKey ?? null,
          cardKey: `${card.rank}-${card.suit}`,
          reason: 'mounted_with_visible_card_guarded',
        },
      });
    }
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
    const flipKey = cardKey ? `${handBoundaryKey ?? 'no-hand-key'}:${cardKey}` : null;
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
      setShowFace(true);
      setIsFlipping(false);
      return;
    }

    if (flipKey && cutCardFlipConsumedRef.current.has(flipKey)) {
      logDebugEvent({
        gameId: 'cut-card-reveal',
        eventType: 'crib-cut-flip-replay-detected',
        payload: {
          handBoundaryKey: handBoundaryKey ?? null,
          cardKey,
          reason: 'duplicate_visibility_edge_same_hand',
        },
      });
      setShowFace(true);
      setIsFlipping(false);
      return;
    }
    
    if (flipKey) {
      cutCardFlipConsumedRef.current.add(flipKey);
    }

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

  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-white/60 mb-0.5">Cut</span>
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
            <CribbagePlayingCard card={card} size="sm" />
          ) : (
            <div 
              className="w-8 h-12 rounded-sm border border-white/20"
              style={{
                background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
