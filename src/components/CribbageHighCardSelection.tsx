import { useState, useEffect, useRef, useCallback } from 'react';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { getDisplayName } from '@/lib/botAlias';
import type { CribbageCard } from '@/lib/cribbageTypes';

interface Player {
  id: string;
  user_id: string;
  position: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface CribbageHighCardSelectionProps {
  players: Player[];
  onComplete: (winnerPlayerId: string) => void;
  onAnnouncementChange?: (announcement: string | null) => void;
}

// Simple card for high card - use cribbage card type
function createSimpleDeck(): CribbageCard[] {
  const suits: CribbageCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  const deck: CribbageCard[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        suit,
        rank,
        value: rank === 'A' ? 14 : ['J', 'Q', 'K'].includes(rank) ? [11, 12, 13][['J', 'Q', 'K'].indexOf(rank)] : parseInt(rank, 10),
      });
    }
  }
  return deck;
}

function shuffleDeck(deck: CribbageCard[]): CribbageCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface DrawnCard {
  playerId: string;
  card: CribbageCard;
  isWinner: boolean;
}

/**
 * Quick high-card selection for determining initial cribbage dealer
 * Shows cards briefly, announces winner, and calls onComplete
 */
export const CribbageHighCardSelection = ({
  players,
  onComplete,
  onAnnouncementChange,
}: CribbageHighCardSelectionProps) => {
  const [phase, setPhase] = useState<'announce' | 'dealing' | 'result' | 'done'>('announce');
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [winnerPlayerId, setWinnerPlayerId] = useState<string | null>(null);
  const hasCompletedRef = useRef(false);

  const getPlayerName = useCallback((playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'Player';
    return getDisplayName(players, player, player.profiles?.username || 'Player');
  }, [players]);

  // Run the selection sequence
  useEffect(() => {
    if (hasCompletedRef.current) return;

    // Phase 1: Show announcement
    onAnnouncementChange?.('High card for first deal');
    
    const dealTimer = setTimeout(() => {
      // Phase 2: Deal cards
      setPhase('dealing');
      
      const deck = shuffleDeck(createSimpleDeck());
      const cards: DrawnCard[] = players.map((player, idx) => ({
        playerId: player.id,
        card: deck[idx],
        isWinner: false,
      }));
      
      // Find highest card (using value for comparison, Ace = 14)
      let highestValue = 0;
      let winnerId = players[0].id;
      
      cards.forEach(c => {
        if (c.card.value > highestValue) {
          highestValue = c.card.value;
          winnerId = c.playerId;
        }
      });
      
      // Mark winner
      const cardsWithWinner = cards.map(c => ({
        ...c,
        isWinner: c.playerId === winnerId,
      }));
      
      setDrawnCards(cardsWithWinner);
      setWinnerPlayerId(winnerId);
      
      // Phase 3: Show result after brief pause
      const resultTimer = setTimeout(() => {
        setPhase('result');
        const winnerName = getPlayerName(winnerId);
        onAnnouncementChange?.(`${winnerName} deals first!`);
        
        // Phase 4: Complete after showing result
        const completeTimer = setTimeout(() => {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            setPhase('done');
            onAnnouncementChange?.(null);
            onComplete(winnerId);
          }
        }, 1500);
        
        return () => clearTimeout(completeTimer);
      }, 1200);
      
      return () => clearTimeout(resultTimer);
    }, 800);
    
    return () => clearTimeout(dealTimer);
  }, [players, onComplete, onAnnouncementChange, getPlayerName]);

  // Don't render anything in announce or done phase
  if (phase === 'announce' || phase === 'done') {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40">
      {/* Cards display - horizontal row */}
      <div className="flex gap-4 items-end">
        {drawnCards.map((dc) => (
          <div 
            key={dc.playerId}
            className={`flex flex-col items-center transition-all duration-300 ${
              phase === 'result' && dc.isWinner 
                ? 'transform -translate-y-2 scale-110' 
                : phase === 'result' && !dc.isWinner
                  ? 'opacity-50'
                  : ''
            }`}
          >
            <div className={`${
              phase === 'result' && dc.isWinner 
                ? 'ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' 
                : ''
            }`}>
              <CribbagePlayingCard card={dc.card} size="md" />
            </div>
            <span className={`text-xs mt-1 ${
              dc.isWinner ? 'text-poker-gold font-bold' : 'text-white/70'
            }`}>
              {getPlayerName(dc.playerId)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
