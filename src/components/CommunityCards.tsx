import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef } from "react";
import { useDeviceSize } from "@/hooks/useDeviceSize";

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
  highlightedIndices?: number[];  // Indices of cards that are part of winning hand
  kickerIndices?: number[];       // Indices of kicker cards
  hasHighlights?: boolean;        // Whether highlights are active (to dim non-highlighted cards)
  tightOverlap?: boolean;         // Use tighter spacing for multi-player showdown
}

export const CommunityCards = ({ cards, revealed, highlightedIndices = [], kickerIndices = [], hasHighlights = false, tightOverlap = false }: CommunityCardsProps) => {
  const { isTablet, isDesktop } = useDeviceSize();

  // IMPORTANT: compute identity every render.
  // Some realtime patches can mutate the cards array contents without changing its reference;
  // using useMemo([cards]) can miss those updates and show stale/incorrect community cards.
  const handId = cards.map((c) => `${c.rank}${c.suit}`).join(',');

  // Use refs to track state synchronously to prevent flashing during hand transitions
  const animatedHandIdRef = useRef<string>('');
  const dealtCardsRef = useRef<Set<number>>(new Set());
  const flippedCardsRef = useRef<Set<number>>(new Set());
  
  const [renderTrigger, setRenderTrigger] = useState(0);
  
  const lastRevealedRef = useRef<number>(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isFirstMountRef = useRef<boolean>(true);
  
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  };
  
  // Synchronously update refs when handId changes to prevent flash
  // This runs during render, before paint, so cards never disappear
  if (cards.length > 0 && handId !== animatedHandIdRef.current) {
    console.log('[COMMUNITY_CARDS] Sync update - handId changed from', animatedHandIdRef.current, 'to', handId);
    clearTimeouts();
    
    // For subsequent hands (not first), show cards immediately with no animation
    const shouldSkipAnimation = isFirstMountRef.current || animatedHandIdRef.current !== '';
    
    if (shouldSkipAnimation) {
      const allDealt = new Set<number>();
      for (let i = 0; i < cards.length; i++) allDealt.add(i);
      
      const preFlipped = new Set<number>();
      for (let i = 2; i < revealed; i++) preFlipped.add(i);
      
      console.log('[COMMUNITY_CARDS] Setting dealtCards to all', cards.length, 'cards, flipped up to', revealed);
      dealtCardsRef.current = allDealt;
      flippedCardsRef.current = preFlipped;
      animatedHandIdRef.current = handId;
      lastRevealedRef.current = revealed;
      isFirstMountRef.current = false;
    } else {
      // First hand animation (rare - only on very first game load)
      dealtCardsRef.current = new Set();
      flippedCardsRef.current = new Set();
      lastRevealedRef.current = revealed;
      animatedHandIdRef.current = handId;
      isFirstMountRef.current = false;
    }
  }
  
  // Handle first hand dealing animation with timeouts
  useEffect(() => {
    if (cards.length === 0) return;
    
    // Only animate if this is the very first hand and we haven't dealt cards yet
    if (dealtCardsRef.current.size === 0 && cards.length > 0 && !isFirstMountRef.current) {
      const INITIAL_DELAY = 400;
      const CARD_INTERVAL = 200;
      
      cards.forEach((_, index) => {
        const timeout = setTimeout(() => {
          dealtCardsRef.current = new Set([...dealtCardsRef.current, index]);
          setRenderTrigger(n => n + 1);
        }, INITIAL_DELAY + index * CARD_INTERVAL);
        timeoutsRef.current.push(timeout);
      });
    }
  }, [cards.length]);
  
  // ── Sequential reveal queue (Cause B latch) ─────────────────────────
  // Identity-scoped on handId. Target = `revealed` (monotonic). Renders one
  // flip at a time with a fixed inter-flip gap. If the target jumps (e.g.
  // 0→4 in a single tick), we still step through cards one-by-one rather
  // than firing multiple parallel timeouts. Completed flips are latched and
  // never replay until handId truly changes.
  const flipQueueIdRef = useRef<string>('');
  const FLIP_GAP_MS = 800;

  useEffect(() => {
    if (cards.length === 0) return;
    if (handId !== animatedHandIdRef.current) return;
    if (revealed <= lastRevealedRef.current) return;

    lastRevealedRef.current = revealed;

    // Identity for this queue run — handId. If a new hand arrives mid-queue,
    // the sync block at the top of render will reset refs and the next effect
    // pass starts a fresh queue.
    const queueId = handId;
    flipQueueIdRef.current = queueId;

    const tick = () => {
      // Identity guard: if hand changed, abandon this queue
      if (flipQueueIdRef.current !== queueId) return;
      if (handId !== animatedHandIdRef.current) return;

      // Find the next un-flipped card index that should be face-up.
      // Indices < 2 are auto-face-up (handled in render); queue starts at 2.
      let next = -1;
      for (let i = 2; i < lastRevealedRef.current; i++) {
        if (!flippedCardsRef.current.has(i)) { next = i; break; }
      }
      if (next === -1) return;

      flippedCardsRef.current = new Set([...flippedCardsRef.current, next]);
      setRenderTrigger(n => n + 1);

      // Schedule next sequentially — only one timer in flight at a time.
      const t = setTimeout(tick, FLIP_GAP_MS);
      timeoutsRef.current.push(t);
    };

    // Kick off if no flip is pending (queue is at most one timer)
    const t = setTimeout(tick, 0);
    timeoutsRef.current.push(t);
  }, [revealed, handId, cards.length]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => clearTimeouts();
  }, []);
  
  if (cards.length === 0) return null;

  // Read from refs for render (they're always in sync)
  const dealtCards = dealtCardsRef.current;
  const flippedCards = flippedCardsRef.current;

  return (
    <div className="relative">
      <div className={`flex ${tightOverlap ? '-space-x-1' : '-space-x-0.5'}`} style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isVisible = dealtCards.has(index);
          const hasFlipped = flippedCards.has(index);
          const showFront = index < 2 || hasFlipped;
          
          // Use standard PlayingCard sizes - let the component handle proportions
          // TABLET: Use 'xl' for larger community cards on the felt
          const cardSize = isTablet || isDesktop ? 'xl' : 'md';
          
          return (
            <div
              key={index}
              style={{ 
                transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
                opacity: isVisible ? 1 : 0,
              }}
            >
              {showFront ? (
                <PlayingCard
                  card={card}
                  size={cardSize}
                  isHighlighted={highlightedIndices.includes(index)}
                  isKicker={kickerIndices.includes(index)}
                  isDimmed={hasHighlights && !highlightedIndices.includes(index) && !kickerIndices.includes(index)}
                />
              ) : (
                <PlayingCard
                  isHidden
                  size={cardSize}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
