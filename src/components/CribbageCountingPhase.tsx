import { useState, useEffect, useCallback, useRef } from 'react';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { getHandScoringCombos, getTotalFromCombos, type ScoringCombo } from '@/lib/cribbageScoringDetails';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbagePegBoard } from './CribbagePegBoard';
import { CRIBBAGE_WINNING_SCORE } from '@/lib/cribbageTypes';
import { getDisplayName } from '@/lib/botAlias';

interface Player {
  id: string;
  user_id: string;
  position: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

type CountingTarget = {
  type: 'player' | 'crib';
  playerId: string;
  hand: CribbageCard[];
  label: string;
};

interface CribbageCountingPhaseProps {
  cribbageState: CribbageState;
  players: Player[];
  onCountingComplete: () => void;
  cardBackColors: { color: string; darkColor: string };
  onAnnouncementChange?: (announcement: string | null, targetLabel: string | null) => void;
}

const COMBO_DELAY_MS = 2000; // 2 seconds per combo
const TARGET_TRANSITION_DELAY_MS = 1500; // 1.5 seconds between hands

export const CribbageCountingPhase = ({
  cribbageState,
  players,
  onCountingComplete,
  cardBackColors,
  onAnnouncementChange,
}: CribbageCountingPhaseProps) => {
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [currentComboIndex, setCurrentComboIndex] = useState(-1); // -1 = showing hand, not combo yet
  const [highlightedCards, setHighlightedCards] = useState<CribbageCard[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [animatedScores, setAnimatedScores] = useState<Record<string, number>>({});
  const [isComplete, setIsComplete] = useState(false);
  
  const completedRef = useRef(false);

  // Initialize animated scores from current peg scores (before counting)
  useEffect(() => {
    const initialScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      // Get score before hand counting was applied
      // The cribbageState already has updated scores, so we need to subtract
      const playerHandCards = cribbageState.pegging.playedCards
        .filter(pc => pc.playerId === playerId)
        .map(pc => pc.card);
      const handScore = getHandScoringCombos(playerHandCards, cribbageState.cutCard, false);
      const handTotal = getTotalFromCombos(handScore);
      
      // For dealer, also subtract crib
      let cribTotal = 0;
      if (playerId === cribbageState.dealerPlayerId) {
        const cribCombos = getHandScoringCombos(cribbageState.crib, cribbageState.cutCard, true);
        cribTotal = getTotalFromCombos(cribCombos);
      }
      
      initialScores[playerId] = cribbageState.playerStates[playerId].pegScore - handTotal - cribTotal;
    }
    setAnimatedScores(initialScores);
  }, []);

  // Build counting order: left of dealer first, then clockwise, dealer's hand, then crib
  const countingTargets: CountingTarget[] = (() => {
    const targets: CountingTarget[] = [];
    const dealerId = cribbageState.dealerPlayerId;
    
    // Get turn order which starts left of dealer
    for (const playerId of cribbageState.turnOrder) {
      if (playerId === dealerId) continue; // Dealer goes last
      
      const player = players.find(p => p.id === playerId);
      const playerCards = cribbageState.pegging.playedCards
        .filter(pc => pc.playerId === playerId)
        .map(pc => pc.card);
      
      const displayName = player 
        ? getDisplayName(players, player, player.profiles?.username || 'Player')
        : 'Player';
      
      targets.push({
        type: 'player',
        playerId,
        hand: playerCards,
        label: `${displayName}'s Hand`,
      });
    }
    
    // Dealer's hand
    const dealer = players.find(p => p.id === dealerId);
    const dealerCards = cribbageState.pegging.playedCards
      .filter(pc => pc.playerId === dealerId)
      .map(pc => pc.card);
    
    const dealerName = dealer 
      ? getDisplayName(players, dealer, dealer.profiles?.username || 'Dealer')
      : 'Dealer';
    
    targets.push({
      type: 'player',
      playerId: dealerId,
      hand: dealerCards,
      label: `${dealerName}'s Hand`,
    });
    
    // Crib
    targets.push({
      type: 'crib',
      playerId: dealerId,
      hand: cribbageState.crib,
      label: `${dealerName}'s Crib`,
    });
    
    return targets;
  })();

  const currentTarget = countingTargets[currentTargetIndex];
  const currentCombos = currentTarget 
    ? getHandScoringCombos(currentTarget.hand, cribbageState.cutCard, currentTarget.type === 'crib')
    : [];

  // Animation loop
  useEffect(() => {
    if (isComplete || !currentTarget) return;

    const timer = setTimeout(() => {
      if (currentComboIndex === -1) {
        // Just showed the hand, start with first combo (or skip if none)
        if (currentCombos.length === 0) {
          setAnnouncement('0 points');
          // Move to next target after short delay
          setTimeout(() => {
            moveToNextTarget();
          }, TARGET_TRANSITION_DELAY_MS);
        } else {
          setCurrentComboIndex(0);
        }
      } else if (currentComboIndex < currentCombos.length) {
        // Show current combo
        const combo = currentCombos[currentComboIndex];
        setHighlightedCards(combo.cards);
        setAnnouncement(`${combo.label}: +${combo.points}`);
        
        // Update animated score
        setAnimatedScores(prev => ({
          ...prev,
          [currentTarget.playerId]: (prev[currentTarget.playerId] || 0) + combo.points,
        }));
        
        // Schedule next combo
        setTimeout(() => {
          setCurrentComboIndex(prev => prev + 1);
        }, COMBO_DELAY_MS);
      } else {
        // All combos shown, move to next target
        setHighlightedCards([]);
        const total = getTotalFromCombos(currentCombos);
        setAnnouncement(`Total: ${total} points`);
        
        setTimeout(() => {
          moveToNextTarget();
        }, TARGET_TRANSITION_DELAY_MS);
      }
    }, currentComboIndex === -1 ? 500 : 0); // Initial delay to show hand

    return () => clearTimeout(timer);
  }, [currentTargetIndex, currentComboIndex, isComplete]);

  const moveToNextTarget = useCallback(() => {
    if (currentTargetIndex < countingTargets.length - 1) {
      setCurrentTargetIndex(prev => prev + 1);
      setCurrentComboIndex(-1);
      setHighlightedCards([]);
      setAnnouncement(null);
    } else {
      // All targets counted
      if (!completedRef.current) {
        completedRef.current = true;
        setIsComplete(true);
        setAnnouncement('Counting complete!');
        
        // Trigger next hand after delay
        setTimeout(() => {
          onCountingComplete();
        }, 2000);
      }
    }
  }, [currentTargetIndex, countingTargets.length, onCountingComplete]);

  // Propagate announcements to parent for dealer announcement area
  useEffect(() => {
    if (onAnnouncementChange) {
      onAnnouncementChange(announcement, currentTarget?.label || null);
    }
  }, [announcement, currentTarget?.label, onAnnouncementChange]);

  // Check if a card should be highlighted
  const isCardHighlighted = (card: CribbageCard) => {
    return highlightedCards.some(
      hc => hc.rank === card.rank && hc.suit === card.suit
    );
  };

  if (!currentTarget) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
      {/* Peg Board - stays visible during counting */}
      <div className="absolute top-[25%] left-6 right-6 z-10">
        <CribbagePegBoard 
          players={players}
          playerStates={Object.fromEntries(
            Object.entries(cribbageState.playerStates).map(([id, ps]) => [
              id,
              { ...ps, pegScore: animatedScores[id] ?? ps.pegScore }
            ])
          )}
          winningScore={CRIBBAGE_WINNING_SCORE}
        />
      </div>

      {/* Cards being scored - horizontal layout with cut card */}
      <div className="absolute top-[55%] left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-end gap-1">
          {/* Player's 4 cards */}
          {currentTarget.hand.map((card, i) => (
            <div 
              key={`${card.rank}-${card.suit}-${i}`}
              className={`transition-all duration-300 ${
                isCardHighlighted(card) 
                  ? 'transform -translate-y-2 ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' 
                  : ''
              }`}
            >
              <CribbagePlayingCard card={card} size="md" />
            </div>
          ))}
          
          {/* Cut card with label */}
          {cribbageState.cutCard && (
            <div className="flex flex-col items-center ml-2">
              <span className="text-[8px] text-white/60 mb-0.5">Cut</span>
              <div 
                className={`transition-all duration-300 ${
                  isCardHighlighted(cribbageState.cutCard) 
                    ? 'transform -translate-y-2 ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' 
                    : ''
                }`}
              >
                <CribbagePlayingCard card={cribbageState.cutCard} size="md" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
