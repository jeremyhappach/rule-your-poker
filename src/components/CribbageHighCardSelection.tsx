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

// Card with stacking info for tie resolution
interface StackedCard {
  card: CribbageCard;
  roundNumber: number; // Which draw round (1 = initial, 2+ = tiebreaker)
}

interface DrawnCard {
  playerId: string;
  cards: StackedCard[]; // Stack of cards for this player
  isWinner: boolean;
  isTied: boolean;
}

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

/**
 * Quick high-card selection for determining initial cribbage dealer
 * Shows cards briefly, announces winner, and calls onComplete
 * Handles ties by stacking additional cards with 50% overlap
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
  const deckRef = useRef<CribbageCard[]>([]);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const addTimeout = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
    return t;
  }, []);

  const getPlayerName = useCallback((playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'Player';
    return getDisplayName(players, player, player.profiles?.username || 'Player');
  }, [players]);

  // Deal cards to specified players and check for winner/tie
  const dealRound = useCallback((participantIds: string[], roundNumber: number) => {
    // Deal one card to each participant
    const newCards: { playerId: string; card: CribbageCard }[] = participantIds.map(playerId => ({
      playerId,
      card: deckRef.current.shift()!,
    }));

    // Find highest value in this round
    let highestValue = 0;
    newCards.forEach(c => {
      if (c.card.value > highestValue) {
        highestValue = c.card.value;
      }
    });

    // Find all players with highest value (potential ties)
    const tiedPlayerIds = newCards
      .filter(c => c.card.value === highestValue)
      .map(c => c.playerId);

    const isTie = tiedPlayerIds.length > 1;
    const winnerId = isTie ? null : tiedPlayerIds[0];

    // Update drawn cards state using functional update to avoid stale state
    setDrawnCards(prev => {
      // If this is round 1, initialize fresh
      if (roundNumber === 1) {
        return newCards.map(nc => ({
          playerId: nc.playerId,
          cards: [{ card: nc.card, roundNumber }],
          isWinner: nc.playerId === winnerId,
          isTied: tiedPlayerIds.includes(nc.playerId) && isTie,
        }));
      }

      // For tiebreaker rounds, add card to existing stacks
      return prev.map(dc => {
        const newCard = newCards.find(nc => nc.playerId === dc.playerId);
        if (newCard) {
          return {
            ...dc,
            cards: [...dc.cards, { card: newCard.card, roundNumber }],
            isWinner: dc.playerId === winnerId,
            isTied: tiedPlayerIds.includes(dc.playerId) && isTie,
          };
        }
        // Player not in this round (lost previous tie)
        return { ...dc, isTied: false, isWinner: false };
      });
    });

    return { isTie, winnerId, tiedPlayerIds };
  }, []);

  // Run the selection sequence
  useEffect(() => {
    if (hasCompletedRef.current) return;

    // Initialize deck
    deckRef.current = shuffleDeck(createSimpleDeck());

    // Phase 1: Show announcement
    onAnnouncementChange?.('Drawing for button');
    
    const dealTimer = addTimeout(() => {
      // Phase 2: Deal initial cards
      setPhase('dealing');
      
      const participantIds = players.map(p => p.id);
      const { isTie, winnerId, tiedPlayerIds } = dealRound(participantIds, 1);
      
      if (!isTie && winnerId) {
        // Clear winner - show result
        showWinner(winnerId);
      } else {
        // Tie - start resolution
        resolveTie(tiedPlayerIds, 2);
      }
    }, 800);
    
    return () => clearTimeouts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveTie = useCallback((tiedPlayerIds: string[], roundNumber: number) => {
    // No announcement for ties - just a quick 500ms delay then deal
    addTimeout(() => {
      const { isTie, winnerId, tiedPlayerIds: newTiedIds } = dealRound(tiedPlayerIds, roundNumber);
      
      if (!isTie && winnerId) {
        showWinner(winnerId);
      } else {
        // Still tied - keep resolving
        resolveTie(newTiedIds, roundNumber + 1);
      }
    }, 500);
  }, [addTimeout, dealRound]);

  const showWinner = useCallback((winnerId: string) => {
    setPhase('result');
    setWinnerPlayerId(winnerId);
    const winnerName = getPlayerName(winnerId);
    onAnnouncementChange?.(`${winnerName} deals first!`);
    
    // Complete after showing result
    addTimeout(() => {
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        setPhase('done');
        onAnnouncementChange?.(null);
        onComplete(winnerId);
      }
    }, 1500);
  }, [addTimeout, getPlayerName, onAnnouncementChange, onComplete]);

  // Don't render anything in announce or done phase
  if (phase === 'announce' || phase === 'done') {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40">
      {/* Cards display - horizontal row */}
      <div className="flex gap-4 items-start">
        {drawnCards.map((dc) => (
          <div 
            key={dc.playerId}
            className={`flex flex-col items-center transition-all duration-300 ${
              phase === 'result' && dc.isWinner 
                ? 'transform -translate-y-2 scale-110' 
                : phase === 'result' && !dc.isWinner && !dc.isTied
                  ? 'opacity-50'
                  : ''
            }`}
          >
            {/* Stacked cards container */}
            <div className="relative">
              {dc.cards.map((stackedCard, idx) => (
                <div 
                  key={`${dc.playerId}-${stackedCard.roundNumber}`}
                  className={`${idx > 0 ? 'absolute' : ''} ${
                    phase === 'result' && dc.isWinner && idx === dc.cards.length - 1
                      ? 'ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' 
                      : ''
                  }`}
                  style={idx > 0 ? { 
                    top: `${idx * 50}%`, // 50% overlap for each stacked card
                    left: 0,
                    zIndex: idx 
                  } : undefined}
                >
                  <CribbagePlayingCard card={stackedCard.card} size="md" />
                </div>
              ))}
            </div>
            <span 
              className={`text-xs mt-1 ${
                dc.isWinner ? 'text-poker-gold font-bold' : 'text-white/70'
              }`}
              style={{ marginTop: dc.cards.length > 1 ? `${(dc.cards.length - 1) * 50 + 4}%` : undefined }}
            >
              {getPlayerName(dc.playerId)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};