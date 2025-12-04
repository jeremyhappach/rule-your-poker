import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { useState, useEffect, useRef, useMemo } from "react";
import bullsLogo from '@/assets/bulls-logo.png';
import bearsLogo from '@/assets/bears-logo.png';
import cubsLogo from '@/assets/cubs-logo.png';
import hawksLogo from '@/assets/hawks-logo.png';

const TEAM_LOGOS: Record<string, string> = {
  bulls: bullsLogo,
  bears: bearsLogo,
  cubs: cubsLogo,
  hawks: hawksLogo,
};

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
}

export const CommunityCards = ({ cards, revealed }: CommunityCardsProps) => {
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  const cardBackId = getCardBackId();
  const teamLogo = TEAM_LOGOS[cardBackId] || null;
  
  // Generate hand ID from cards
  const handId = useMemo(() => cards.map(c => `${c.rank}${c.suit}`).join(','), [cards]);
  
  // Track the hand we've set up animation for
  const [animatedHandId, setAnimatedHandId] = useState<string>('');
  const [dealtCards, setDealtCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  
  // Refs for tracking state without causing effect re-runs
  const lastRevealedRef = useRef<number>(0);
  const mountTimeRef = useRef<number>(Date.now());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  };
  
  // Check if first mount (within 500ms) - shows cards immediately on page load
  const isFirstMount = Date.now() - mountTimeRef.current < 500;
  
  // Detect new hand and set up animation
  useEffect(() => {
    if (cards.length === 0) return;
    if (handId === animatedHandId) return; // Already set up for this hand
    
    clearTimeouts();
    
    // On first page load, show everything immediately
    if (isFirstMount) {
      const allDealt = new Set<number>();
      for (let i = 0; i < cards.length; i++) allDealt.add(i);
      
      const preFlipped = new Set<number>();
      for (let i = 2; i < revealed; i++) preFlipped.add(i);
      
      setDealtCards(allDealt);
      setFlippedCards(preFlipped);
      setAnimatedHandId(handId);
      lastRevealedRef.current = revealed;
      return;
    }
    
    // New hand during gameplay - reset and animate
    setDealtCards(new Set());
    setFlippedCards(new Set());
    lastRevealedRef.current = revealed;
    
    // Deal cards one-by-one with 800ms initial delay
    const INITIAL_DELAY = 800;
    const CARD_INTERVAL = 200;
    
    cards.forEach((_, index) => {
      const timeout = setTimeout(() => {
        setDealtCards(prev => new Set([...prev, index]));
      }, INITIAL_DELAY + index * CARD_INTERVAL);
      timeoutsRef.current.push(timeout);
    });
    
    // Mark this hand as animated (after a tick to ensure we don't render with old state)
    const idTimeout = setTimeout(() => {
      setAnimatedHandId(handId);
    }, 50);
    timeoutsRef.current.push(idTimeout);
    
  }, [handId, cards, revealed, animatedHandId, isFirstMount]);
  
  // Handle flip animation when revealed increases
  useEffect(() => {
    if (cards.length === 0) return;
    if (handId !== animatedHandId) return; // Not set up yet
    if (revealed <= lastRevealedRef.current) return;
    
    const previousRevealed = lastRevealedRef.current;
    lastRevealedRef.current = revealed;
    
    // Find cards that need to flip (index 2+ only)
    const toFlip: number[] = [];
    for (let i = Math.max(2, previousRevealed); i < revealed; i++) {
      if (!flippedCards.has(i)) {
        toFlip.push(i);
      }
    }
    
    if (toFlip.length === 0) return;
    
    // Animate flips with stagger
    toFlip.forEach((cardIndex, arrayIndex) => {
      const isLastCard = arrayIndex === toFlip.length - 1 && toFlip.length > 1;
      const delay = isLastCard ? 1500 : arrayIndex * 200;
      
      const timeout = setTimeout(() => {
        setFlippedCards(prev => new Set([...prev, cardIndex]));
      }, delay);
      timeoutsRef.current.push(timeout);
    });
  }, [revealed, handId, animatedHandId, cards.length, flippedCards]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeouts();
  }, []);
  
  // Don't render if no cards
  if (cards.length === 0) return null;
  
  // CRITICAL: Hide during new hand transition (handId changed but we haven't set up animation yet)
  // This prevents flash of cards before the 800ms delay
  if (handId !== animatedHandId && !isFirstMount) {
    return null;
  }

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isVisible = dealtCards.has(index);
          const hasFlipped = flippedCards.has(index);
          // First 2 cards always face-up, others need to flip
          const showFront = index < 2 || hasFlipped;
          const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900';
          
          return (
            <div
              key={index}
              className="w-10 h-14 sm:w-12 sm:h-16 relative"
              style={{ 
                transformStyle: 'preserve-3d',
                transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
                opacity: isVisible ? 1 : 0,
              }}
            >
              {/* Card Back */}
              <Card 
                className="absolute inset-0 w-full h-full flex items-center justify-center border border-poker-gold shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                  backfaceVisibility: 'hidden',
                  transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 1.2s ease-in-out',
                }}
              >
                <div className="w-full h-full flex items-center justify-center p-1">
                  {teamLogo ? (
                    <img src={teamLogo} alt="Team logo" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-poker-gold text-2xl font-bold opacity-30">
                      ?
                    </div>
                  )}
                </div>
              </Card>
              
              {/* Card Front */}
              <Card 
                className="absolute inset-0 w-full h-full flex items-center justify-center border border-poker-gold shadow-lg"
                style={{
                  backgroundColor: 'white',
                  backfaceVisibility: 'hidden',
                  transform: showFront ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                  transition: 'transform 1.2s ease-in-out',
                }}
              >
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-lg sm:text-xl font-bold ${suitColor}`}>
                    {card.rank}
                  </div>
                  <div className={`text-base sm:text-lg ${suitColor}`}>
                    {card.suit}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
};
