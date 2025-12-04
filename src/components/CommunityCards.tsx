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
  
  // All animation state in refs to avoid re-renders triggering effects
  const animStateRef = useRef({
    handId: '',
    dealtCards: new Set<number>(),
    flippedCards: new Set<number>(),
    lastRevealedProcessed: 0,
    isAnimating: false,
    mountTime: Date.now(),
  });
  
  // Only render state - triggers re-renders for visual updates
  const [renderTrigger, setRenderTrigger] = useState(0);
  
  // Cleanup timeouts
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  };
  
  // Generate hand ID from cards
  const handId = useMemo(() => cards.map(c => `${c.rank}${c.suit}`).join(','), [cards]);
  
  // Check if this is first mount (within 500ms of component mount)
  const isFirstMount = Date.now() - animStateRef.current.mountTime < 500;
  
  // Detect new hand and handle deal animation
  useEffect(() => {
    if (cards.length === 0) return;
    
    const state = animStateRef.current;
    
    // New hand detected
    if (handId !== state.handId) {
      clearTimeouts();
      
      // Reset state for new hand
      state.handId = handId;
      state.dealtCards = new Set<number>();
      state.flippedCards = new Set<number>();
      state.lastRevealedProcessed = revealed;
      state.isAnimating = true;
      
      // On page load, show everything immediately
      if (isFirstMount) {
        for (let i = 0; i < cards.length; i++) {
          state.dealtCards.add(i);
        }
        // Pre-flip cards 2+ that are already revealed
        for (let i = 2; i < revealed; i++) {
          state.flippedCards.add(i);
        }
        state.isAnimating = false;
        setRenderTrigger(r => r + 1);
        return;
      }
      
      // New hand during gameplay - animate deal with delay (player cards first)
      const INITIAL_DELAY = 800;
      const CARD_INTERVAL = 200;
      
      cards.forEach((_, index) => {
        const timeout = setTimeout(() => {
          state.dealtCards.add(index);
          setRenderTrigger(r => r + 1);
          
          // Check if all cards dealt
          if (index === cards.length - 1) {
            state.isAnimating = false;
          }
        }, INITIAL_DELAY + index * CARD_INTERVAL);
        timeoutsRef.current.push(timeout);
      });
      
      setRenderTrigger(r => r + 1);
    }
  }, [handId, cards, revealed, isFirstMount]);
  
  // Handle flip animation when revealed increases (SEPARATE effect, no deps on animation state)
  useEffect(() => {
    if (cards.length === 0) return;
    
    const state = animStateRef.current;
    
    // Only process if this is the current hand and revealed increased
    if (handId !== state.handId) return;
    if (revealed <= state.lastRevealedProcessed) return;
    
    const previousRevealed = state.lastRevealedProcessed;
    state.lastRevealedProcessed = revealed;
    
    // Find cards that need to flip (index 2+ only)
    const toFlip: number[] = [];
    for (let i = Math.max(2, previousRevealed); i < revealed; i++) {
      if (!state.flippedCards.has(i)) {
        toFlip.push(i);
      }
    }
    
    if (toFlip.length === 0) return;
    
    // Animate flips with stagger - last card gets extra delay
    toFlip.forEach((cardIndex, arrayIndex) => {
      const isLastCard = arrayIndex === toFlip.length - 1 && toFlip.length > 1;
      const delay = isLastCard ? 1500 : arrayIndex * 200;
      
      const timeout = setTimeout(() => {
        state.flippedCards.add(cardIndex);
        setRenderTrigger(r => r + 1);
      }, delay);
      timeoutsRef.current.push(timeout);
    });
  }, [revealed, handId, cards.length]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeouts();
  }, []);
  
  // Don't render if no cards
  if (cards.length === 0) return null;
  
  // During new hand animation startup, hide to prevent flash of old cards
  const state = animStateRef.current;
  if (handId !== state.handId) return null;
  if (state.isAnimating && state.dealtCards.size === 0) return null;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isVisible = state.dealtCards.has(index);
          const hasFlipped = state.flippedCards.has(index);
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
