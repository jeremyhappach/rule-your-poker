import { useState, useEffect, useCallback, useRef } from 'react';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { getHandScoringCombos, getTotalFromCombos, type ScoringCombo } from '@/lib/cribbageScoringDetails';
import { CribbagePlayingCard } from './CribbagePlayingCard';
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

type TransitionPhase = 'scoring' | 'exiting' | 'entering';

interface CribbageCountingPhaseProps {
  cribbageState: CribbageState;
  players: Player[];
  onCountingComplete: () => void;
  cardBackColors: { color: string; darkColor: string };
  onAnnouncementChange?: (announcement: string | null, targetLabel: string | null) => void;
}

const COMBO_DELAY_MS = 2000; // 2 seconds per combo
const EXIT_ANIMATION_MS = 1500; // 1.5 seconds for cards to exit
const ENTER_ANIMATION_MS = 800; // 0.8 seconds for cards to enter

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
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('entering');
  const [exitingCards, setExitingCards] = useState<CribbageCard[]>([]);
  
  const completedRef = useRef(false);

  // Initialize animated scores from current peg scores (before counting)
  useEffect(() => {
    const initialScores: Record<string, number> = {};
    for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
      const playerHandCards = cribbageState.pegging.playedCards
        .filter(pc => pc.playerId === playerId)
        .map(pc => pc.card);
      const handScore = getHandScoringCombos(playerHandCards, cribbageState.cutCard, false);
      const handTotal = getTotalFromCombos(handScore);
      
      let cribTotal = 0;
      if (playerId === cribbageState.dealerPlayerId) {
        const cribCombos = getHandScoringCombos(cribbageState.crib, cribbageState.cutCard, true);
        cribTotal = getTotalFromCombos(cribCombos);
      }
      
      initialScores[playerId] = cribbageState.playerStates[playerId].pegScore - handTotal - cribTotal;
    }
    setAnimatedScores(initialScores);
    
    // Start with entering animation
    setTimeout(() => {
      setTransitionPhase('scoring');
    }, ENTER_ANIMATION_MS);
  }, []);

  // Build counting order: left of dealer first, then clockwise, dealer's hand, then crib
  const countingTargets: CountingTarget[] = (() => {
    const targets: CountingTarget[] = [];
    const dealerId = cribbageState.dealerPlayerId;
    
    for (const playerId of cribbageState.turnOrder) {
      if (playerId === dealerId) continue;
      
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

  // Animation loop - only runs during 'scoring' phase
  useEffect(() => {
    if (isComplete || !currentTarget || transitionPhase !== 'scoring') return;

    const timer = setTimeout(() => {
      if (currentComboIndex === -1) {
        if (currentCombos.length === 0) {
          setAnnouncement('0 points');
          setTimeout(() => {
            startExitTransition();
          }, 1000);
        } else {
          setCurrentComboIndex(0);
        }
      } else if (currentComboIndex < currentCombos.length) {
        const combo = currentCombos[currentComboIndex];
        setHighlightedCards(combo.cards);
        setAnnouncement(`${combo.label}: +${combo.points}`);
        
        setAnimatedScores(prev => ({
          ...prev,
          [currentTarget.playerId]: (prev[currentTarget.playerId] || 0) + combo.points,
        }));
        
        setTimeout(() => {
          setCurrentComboIndex(prev => prev + 1);
        }, COMBO_DELAY_MS);
      } else {
        // All combos shown - show total and start exit
        setHighlightedCards([]);
        const total = getTotalFromCombos(currentCombos);
        setAnnouncement(`Total: ${total} points`);
        
        setTimeout(() => {
          startExitTransition();
        }, 1500);
      }
    }, currentComboIndex === -1 ? 500 : 0);

    return () => clearTimeout(timer);
  }, [currentTargetIndex, currentComboIndex, isComplete, transitionPhase]);

  const startExitTransition = useCallback(() => {
    if (!currentTarget) return;
    
    // Save current cards for exit animation
    setExitingCards([...currentTarget.hand]);
    setTransitionPhase('exiting');
    
    // After exit animation, move to next target
    setTimeout(() => {
      if (currentTargetIndex < countingTargets.length - 1) {
        setCurrentTargetIndex(prev => prev + 1);
        setCurrentComboIndex(-1);
        setHighlightedCards([]);
        setExitingCards([]);
        setTransitionPhase('entering');
        
        // After enter animation, start scoring
        setTimeout(() => {
          setTransitionPhase('scoring');
        }, ENTER_ANIMATION_MS);
      } else {
        // All targets counted
        if (!completedRef.current) {
          completedRef.current = true;
          setIsComplete(true);
          setAnnouncement('Counting complete!');
          setExitingCards([]);
          
          setTimeout(() => {
            onCountingComplete();
          }, 2000);
        }
      }
    }, EXIT_ANIMATION_MS);
  }, [currentTarget, currentTargetIndex, countingTargets.length, onCountingComplete]);

  // Propagate announcements to parent for dealer announcement area
  useEffect(() => {
    if (onAnnouncementChange) {
      onAnnouncementChange(announcement, currentTarget?.label || null);
    }
  }, [announcement, currentTarget?.label, onAnnouncementChange]);

  const isCardHighlighted = (card: CribbageCard) => {
    return highlightedCards.some(
      hc => hc.rank === card.rank && hc.suit === card.suit
    );
  };

  if (!currentTarget && !isComplete) {
    return null;
  }

  // Determine animation classes based on phase
  const getCardContainerClasses = () => {
    if (transitionPhase === 'exiting') {
      return 'animate-[slideUpFade_1.5s_ease-out_forwards]';
    }
    if (transitionPhase === 'entering') {
      return 'animate-[slideInFromSource_0.8s_ease-out_forwards]';
    }
    return '';
  };

  const cardsToShow = transitionPhase === 'exiting' ? exitingCards : currentTarget?.hand || [];

  return (
    <>
      {/* CSS Keyframes */}
      <style>{`
        @keyframes slideUpFade {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(-80px);
            opacity: 0;
          }
        }
        @keyframes slideInFromSource {
          0% {
            transform: translateY(-60px) scale(0.6);
            opacity: 0;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
        {/* Cards being scored - horizontal layout */}
        <div className="absolute top-[58%] left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-end gap-1">
            {/* Player's 4 cards - these animate in/out */}
            <div 
              className={getCardContainerClasses()}
              style={{ transformOrigin: 'center center' }}
            >
              <div className="flex items-end gap-1">
                {cardsToShow.map((card, i) => (
                  <div 
                    key={`${card.rank}-${card.suit}-${i}-${currentTargetIndex}`}
                    className={`transition-all duration-300 ${
                      isCardHighlighted(card) && transitionPhase === 'scoring'
                        ? 'transform -translate-y-2 ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50' 
                        : ''
                    }`}
                  >
                    <CribbagePlayingCard card={card} size="md" />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Cut card with label - stays in place during scoring, hidden when complete */}
            {cribbageState.cutCard && !isComplete && (
              <div className="flex flex-col items-center ml-2">
                <span className="text-[8px] text-white/60 mb-0.5">Cut</span>
                <div 
                  className={`transition-all duration-300 ${
                    isCardHighlighted(cribbageState.cutCard) && transitionPhase === 'scoring'
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
    </>
  );
};
