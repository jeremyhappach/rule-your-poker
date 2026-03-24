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
  const [isFlipping, setIsFlipping] = useState(false);
  const [showFace, setShowFace] = useState(false);
  
  // Track which cards we've already revealed (by rank-suit key) to prevent re-animation
  // This persists across re-renders and phase transitions
  const revealedCardsRef = useRef<Set<string>>(new Set());
  const currentCardKeyRef = useRef<string | null>(null);
  const lastBoundaryKeyRef = useRef<string | undefined>(handBoundaryKey);

  // Reset the revealed-cards cache when hand boundary changes (prevents re-flip on remount)
  if (handBoundaryKey !== lastBoundaryKeyRef.current) {
    lastBoundaryKeyRef.current = handBoundaryKey;
    // Don't clear if the current card is still the same — only on true hand change
    revealedCardsRef.current = new Set();
    currentCardKeyRef.current = null;
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
    // Generate stable key for current card
    const cardKey = card ? `${card.rank}-${card.suit}` : null;
    
    // Card removed - reset show face but keep revealed set
    if (!cardKey) {
      currentCardKeyRef.current = null;
      setShowFace(false);
      setIsFlipping(false);
      return;
    }
    
    // Same card - no action needed
    if (cardKey === currentCardKeyRef.current) {
      return;
    }
    
    currentCardKeyRef.current = cardKey;
    
    // Check if we've already animated this card (e.g., during counting delay)
    if (revealedCardsRef.current.has(cardKey)) {
      // Already revealed this card before - show face immediately, no animation
      setShowFace(true);
      setIsFlipping(false);
      return;
    }
    
    // New card we haven't seen - trigger flip animation
    revealedCardsRef.current.add(cardKey);
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
  }, [card?.rank, card?.suit]);

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
