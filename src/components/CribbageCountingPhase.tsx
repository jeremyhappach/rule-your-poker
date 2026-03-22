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
  onAnnouncementChange?: (announcement: string | null, targetLabel: string | null, announcementKey?: number) => void;
  onScoreUpdate?: (scores: Record<string, number>) => void;
  /** Optional baseline scores to start the counting animation from (typically pegging-phase scores). */
  initialScores?: Record<string, number>;
  /** When true, the counting animation should freeze - parent detected a win via score subscription */
  winFrozen?: boolean;
  /** ISO timestamp from DB: when counting began. Used to skip ahead on reconnect/late join. */
  countingStartedAt?: string | null;
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
  countingStartedAt,
}: CribbageCountingPhaseProps) => {
  const [currentTargetIndex, setCurrentTargetIndex] = useState(0);
  const [currentComboIndex, setCurrentComboIndex] = useState(-1); // -1 = showing hand, not combo yet
  const [highlightedCards, setHighlightedCards] = useState<CribbageCard[]>([]);
  // Store announcement WITH its target label to prevent label mismatch during transitions
  const [announcementData, setAnnouncementData] = useState<{ text: string; targetLabel: string; key: number } | null>(null);
  const [animatedScores, setAnimatedScores] = useState<Record<string, number>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('entering');
  const [exitingCards, setExitingCards] = useState<CribbageCard[]>([]);
  const [baselineInitialized, setBaselineInitialized] = useState(false);
  const skipAheadAppliedRef = useRef(false);
  
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

    setAnnouncementData(null);
    onAnnouncementChange?.(null, null);
  }, [winFrozen, onAnnouncementChange]);

  // Build counting order: left of dealer first, then clockwise, dealer's hand, then crib
  // MOVED ABOVE baseline init so skip-ahead can reference targets.
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

  // CRITICAL: Always use initialScores prop as the authoritative baseline.
  // The parent (CribbageMobileGameTable) captures the correct pegging-phase scores BEFORE
  // phase transition and passes them here. Recalculating from cribbageState is unreliable
  // because the DB pegScore may already reflect post-counting values due to race conditions.
  if (!initialScoresRef.current) {
    if (initialScores) {
      initialScoresRef.current = initialScores;
    } else {
      // Fallback: use current pegScore (should rarely happen if parent passes initialScores)
      const scores: Record<string, number> = {};
      for (const [playerId, ps] of Object.entries(cribbageState.playerStates)) {
        scores[playerId] = ps.pegScore ?? 0;
      }
      initialScoresRef.current = scores;
    }
  }

  // Initialize animated scores from baseline, apply skip-ahead if needed, and propagate to parent
  useEffect(() => {
    if (baselineInitialized) return;
    if (!initialScoresRef.current) return;

    const scoresToInit = { ...initialScoresRef.current };

    // ── Skip-ahead computation ───────────────────────────────────
    // If countingStartedAt is available, compute elapsed time and jump to the
    // approximate target/combo position so reconnecting clients don't replay from zero.
    let skipTargetIndex = 0;
    let skipComboIndex = -1; // -1 = pre-combo (entering phase)
    let skipPhase: TransitionPhase = 'entering';

    if (countingStartedAt && !skipAheadAppliedRef.current) {
      const elapsedMs = Date.now() - new Date(countingStartedAt).getTime();
      // Include the 2s pre-counting delay from parent
      const PRE_DELAY = 2000;
      let budget = elapsedMs - PRE_DELAY;

      if (budget > 0) {
        // Walk through targets, consuming time budget
        for (let ti = 0; ti < countingTargets.length && budget > 0; ti++) {
          const target = countingTargets[ti];
          const combos = getHandScoringCombos(target.hand, cribbageState.cutCard, target.type === 'crib');
          
          // Time for entering this target
          const enterTime = ENTER_ANIMATION_MS; // 800ms
          budget -= enterTime;
          if (budget <= 0) {
            skipTargetIndex = ti;
            skipComboIndex = -1;
            skipPhase = 'entering';
            break;
          }

          // Initial 500ms delay before first combo
          budget -= 500;
          if (budget <= 0) {
            skipTargetIndex = ti;
            skipComboIndex = -1;
            skipPhase = 'scoring';
            break;
          }

          if (combos.length === 0) {
            // "0 points" display + 1000ms + exit 1500ms
            budget -= 1000 + EXIT_ANIMATION_MS;
            if (budget <= 0) {
              skipTargetIndex = ti;
              skipComboIndex = -1;
              skipPhase = 'scoring';
              break;
            }
            continue; // Target fully elapsed, move to next
          }

          // Walk through combos
          let reachedEnd = false;
          for (let ci = 0; ci < combos.length && budget > 0; ci++) {
            budget -= COMBO_DELAY_MS; // 2000ms per combo
            if (budget <= 0) {
              // We're mid-combo — land on this combo
              skipTargetIndex = ti;
              skipComboIndex = ci;
              skipPhase = 'scoring';
              // Pre-apply scores for ALL combos up to and including this one
              for (let pci = 0; pci <= ci; pci++) {
                scoresToInit[target.playerId] = (scoresToInit[target.playerId] || 0) + combos[pci].points;
              }
              reachedEnd = true;
              break;
            }
            // Combo elapsed, accumulate its score
            scoresToInit[target.playerId] = (scoresToInit[target.playerId] || 0) + combos[ci].points;
          }
          if (reachedEnd) break;

          // Total display (1500ms) + exit (1500ms)
          budget -= 1500 + EXIT_ANIMATION_MS;
          if (budget <= 0) {
            // Past all combos, about to exit — skip to next target entering
            skipTargetIndex = Math.min(ti + 1, countingTargets.length - 1);
            skipComboIndex = -1;
            skipPhase = 'entering';
            break;
          }
          // Target fully elapsed
        }

        // If budget consumed all targets, counting is effectively done
        if (budget > 0 && skipTargetIndex === 0 && skipComboIndex === -1) {
          // All targets consumed — skip to end
          skipTargetIndex = countingTargets.length - 1;
          skipComboIndex = -1;
          skipPhase = 'scoring';
          // Pre-apply ALL scores
          for (const target of countingTargets) {
            const combos = getHandScoringCombos(target.hand, cribbageState.cutCard, target.type === 'crib');
            for (const combo of combos) {
              scoresToInit[target.playerId] = (scoresToInit[target.playerId] || 0) + combo.points;
            }
          }
        }
      }

      skipAheadAppliedRef.current = true;

      // Only apply skip-ahead if we're actually skipping past the start
      if (skipTargetIndex > 0 || skipComboIndex > -1) {
        console.log('[CribbageCountingPhase] Skip-ahead applied', {
          elapsedMs: elapsedMs,
          skipTargetIndex,
          skipComboIndex,
          skipPhase,
          totalTargets: countingTargets.length,
        });
        setCurrentTargetIndex(skipTargetIndex);
        setCurrentComboIndex(skipComboIndex);
        setTransitionPhase(skipPhase);
      }
    }

    setAnimatedScores(scoresToInit);

    // Propagate initial baseline scores to parent for peg board sync BEFORE any animation
    if (onScoreUpdate) {
      onScoreUpdate(scoresToInit);
    }
    
    setBaselineInitialized(true);
    
    // Start entering animation after baseline is set
    // If we skipped ahead to 'scoring', skip the enter delay
    if (skipPhase === 'scoring' && (skipTargetIndex > 0 || skipComboIndex > -1)) {
      // Already in scoring phase from skip-ahead
    } else {
      enterToScoringTimerRef.current = setTimeout(() => {
        if (winFrozenRef.current) return;
        setTransitionPhase('scoring');
      }, ENTER_ANIMATION_MS);
    }
  }, [baselineInitialized, onScoreUpdate]);

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
          setAnnouncementData(prev => ({
            text: '0 points',
            targetLabel: currentTarget.label,
            key: (prev?.key ?? 0) + 1,
          }));

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
        setAnnouncementData(prev => ({
          text: `${combo.label}: +${combo.points}`,
          targetLabel: currentTarget.label,
          key: (prev?.key ?? 0) + 1,
        }));

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

      setHighlightedCards([]);
      const total = getTotalFromCombos(currentCombos);
      setAnnouncementData(prev => ({
        text: `Total: ${total} points`,
        targetLabel: currentTarget.label,
        key: (prev?.key ?? 0) + 1,
      }));

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
          // Clear announcement - no "Counting complete!" message needed
          setAnnouncementData(null);
          setExitingCards([]);
          
          if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
          completeTimerRef.current = setTimeout(() => {
            if (winFrozenRef.current) return;
            onCountingComplete(false); // No win detected during counting
          }, 1000); // Shorter delay since no announcement to read
        }
      }
    }, EXIT_ANIMATION_MS);
  }, [currentTarget, currentTargetIndex, countingTargets.length, onCountingComplete, winFrozen]);

  // Propagate announcements to parent for dealer announcement area
  // Uses announcementData which atomically stores text + targetLabel to prevent mismatch during transitions
  useEffect(() => {
    if (winFrozen) return;
    if (onAnnouncementChange) {
      onAnnouncementChange(
        announcementData?.text ?? null, 
        announcementData?.targetLabel ?? null, 
        announcementData?.key
      );
    }
  }, [announcementData, onAnnouncementChange, winFrozen]);

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
