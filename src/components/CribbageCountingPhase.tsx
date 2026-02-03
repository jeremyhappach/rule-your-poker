import { useState, useEffect, useCallback, useRef } from 'react';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { getHandScoringCombos, getTotalFromCombos, type ScoringCombo } from '@/lib/cribbageScoringDetails';
import { CribbagePlayingCard } from './CribbagePlayingCard';
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
  onCountingComplete: (winDetected: boolean) => void;
  cardBackColors: { color: string; darkColor: string };
  onAnnouncementChange?: (announcement: string | null, targetLabel: string | null) => void;
  onScoreUpdate?: (scores: Record<string, number>) => void;
  /** Optional baseline scores to start the counting animation from (typically pegging-phase scores). */
  initialScores?: Record<string, number>;
  /** When true, the counting animation should freeze - parent detected a win via score subscription */
  winFrozen?: boolean;
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
  onScoreUpdate,
  initialScores,
  winFrozen = false,
}: CribbageCountingPhaseProps) => {
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [currentComboIndex, setCurrentComboIndex] = useState(-1); // -1 = showing hand, not combo yet
  const [highlightedCards, setHighlightedCards] = useState<CribbageCard[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [animatedScores, setAnimatedScores] = useState<Record<string, number>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('entering');
  const [exitingCards, setExitingCards] = useState<CribbageCard[]>([]);
  const [baselineInitialized, setBaselineInitialized] = useState(false);
  
  const completedRef = useRef(false);
  const enterToScoringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Capture the initial baseline once per mount so it can't fluctuate with state churn.
  const initialScoresRef = useRef<Record<string, number> | null>(null);
  // Avoid stale closures inside timeouts when parent freezes the win.
  const winFrozenRef = useRef(winFrozen);

  useEffect(() => {
    winFrozenRef.current = winFrozen;
  }, [winFrozen]);

  // If the parent freezes due to a win, immediately clear any pending transitions and
  // stop emitting counting announcements (the dealer banner should switch to the win message).
  useEffect(() => {
    if (!winFrozen) return;

    if (enterToScoringTimerRef.current) {
      clearTimeout(enterToScoringTimerRef.current);
      enterToScoringTimerRef.current = null;
    }
    if (exitTransitionTimerRef.current) {
      clearTimeout(exitTransitionTimerRef.current);
      exitTransitionTimerRef.current = null;
    }
    if (enterTransitionTimerRef.current) {
      clearTimeout(enterTransitionTimerRef.current);
      enterTransitionTimerRef.current = null;
    }
    if (completeTimerRef.current) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }

    setAnnouncement(null);
    onAnnouncementChange?.(null, null);
  }, [winFrozen, onAnnouncementChange]);

  // Calculate baseline scores (before counting) - this is what scores were after pegging
  const baselineScores = (() => {
    const scores: Record<string, number> = {};
    for (const [playerId] of Object.entries(cribbageState.playerStates)) {
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
      
      // Final pegScore minus all counting scores = baseline after pegging
      scores[playerId] = cribbageState.playerStates[playerId].pegScore - handTotal - cribTotal;
    }
    return scores;
  })();

  if (!initialScoresRef.current) {
    initialScoresRef.current = initialScores ?? baselineScores;
  }

  // Initialize animated scores from baseline and propagate to parent IMMEDIATELY
  useEffect(() => {
    if (baselineInitialized) return;

    const scoresToInit = initialScoresRef.current ?? baselineScores;
    setAnimatedScores(scoresToInit);

    // Propagate initial baseline scores to parent for peg board sync BEFORE any animation
    if (onScoreUpdate) {
      onScoreUpdate(scoresToInit);
    }
    
    setBaselineInitialized(true);
    
    // Start entering animation after baseline is set
    enterToScoringTimerRef.current = setTimeout(() => {
      if (winFrozenRef.current) return;
      setTransitionPhase('scoring');
    }, ENTER_ANIMATION_MS);
  }, [baselineInitialized, onScoreUpdate]);

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
  // When winFrozen is true, we stop advancing but keep current cards highlighted
  useEffect(() => {
    if (isComplete || !currentTarget || transitionPhase !== 'scoring') return;
    // If win is frozen by parent (reactive score subscription detected win), stop advancing
    if (winFrozen) return;

    let innerTimer: ReturnType<typeof setTimeout> | null = null;

    const timer = setTimeout(() => {
      if (currentComboIndex === -1) {
        if (currentCombos.length === 0) {
          setHighlightedCards([]);
          setAnnouncement('0 points');

          innerTimer = setTimeout(() => {
            if (!winFrozenRef.current) startExitTransition();
          }, 1000);
        } else {
          setCurrentComboIndex(0);
        }
        return;
      }

      if (currentComboIndex < currentCombos.length) {
        const combo = currentCombos[currentComboIndex];
        setHighlightedCards(combo.cards);
        setAnnouncement(`${combo.label}: +${combo.points}`);

        // IMPORTANT: functional update prevents re-processing the same combo due to rerenders.
        setAnimatedScores((prev) => {
          const next = {
            ...prev,
            [currentTarget.playerId]: (prev[currentTarget.playerId] || 0) + combo.points,
          };

          // Propagate animated scores to parent for peg board sync AND reactive win detection
          if (onScoreUpdate) onScoreUpdate(next);
          return next;
        });

        // Advance to the next combo after a delay
        innerTimer = setTimeout(() => {
          if (!winFrozenRef.current) setCurrentComboIndex((prev) => prev + 1);
        }, COMBO_DELAY_MS);
        return;
      }

      // All combos shown - show total and start exit
      setHighlightedCards([]);
      const total = getTotalFromCombos(currentCombos);
      setAnnouncement(`Total: ${total} points`);

      innerTimer = setTimeout(() => {
        if (!winFrozenRef.current) startExitTransition();
      }, 1500);
    }, currentComboIndex === -1 ? 500 : 0);

    return () => {
      clearTimeout(timer);
      if (innerTimer) clearTimeout(innerTimer);
    };
    // Intentionally OMIT animatedScores/currentTarget/currentCombos from deps:
    // - animatedScores changes would re-run this effect and double-apply points.
    // - currentTarget/currentCombos are derived and may churn identities each render.
    // This effect is driven strictly by the combo indices + phase.
  }, [currentTargetIndex, currentComboIndex, isComplete, transitionPhase, winFrozen]);

  const startExitTransition = useCallback(() => {
    if (!currentTarget) return;
    // Don't exit if win is frozen
    if (winFrozen) return;
    
    // Save current cards for exit animation
    setExitingCards([...currentTarget.hand]);
    setTransitionPhase('exiting');
    
    // After exit animation, move to next target
    if (exitTransitionTimerRef.current) clearTimeout(exitTransitionTimerRef.current);
    exitTransitionTimerRef.current = setTimeout(() => {
      if (winFrozenRef.current) return;

      if (currentTargetIndex < countingTargets.length - 1) {
        setCurrentTargetIndex(prev => prev + 1);
        setCurrentComboIndex(-1);
        setHighlightedCards([]);
        setExitingCards([]);
        setTransitionPhase('entering');
        
        // After enter animation, start scoring
        if (enterTransitionTimerRef.current) clearTimeout(enterTransitionTimerRef.current);
        enterTransitionTimerRef.current = setTimeout(() => {
          if (winFrozenRef.current) return;
          setTransitionPhase('scoring');
        }, ENTER_ANIMATION_MS);
      } else {
        // All targets counted - no win was detected (parent would have frozen us)
        if (!completedRef.current && !winFrozenRef.current) {
          completedRef.current = true;
          setIsComplete(true);
          setAnnouncement('Counting complete!');
          setExitingCards([]);
          
          if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
          completeTimerRef.current = setTimeout(() => {
            if (winFrozenRef.current) return;
            onCountingComplete(false); // No win detected during counting
          }, 2000);
        }
      }
    }, EXIT_ANIMATION_MS);
  }, [currentTarget, currentTargetIndex, countingTargets.length, onCountingComplete, winFrozen]);

  // Propagate announcements to parent for dealer announcement area
  useEffect(() => {
    if (winFrozen) return;
    if (onAnnouncementChange) {
      onAnnouncementChange(announcement, currentTarget?.label || null);
    }
  }, [announcement, currentTarget?.label, onAnnouncementChange, winFrozen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (enterToScoringTimerRef.current) clearTimeout(enterToScoringTimerRef.current);
      if (exitTransitionTimerRef.current) clearTimeout(exitTransitionTimerRef.current);
      if (enterTransitionTimerRef.current) clearTimeout(enterTransitionTimerRef.current);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, []);

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
