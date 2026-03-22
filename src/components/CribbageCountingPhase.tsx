import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { getHandScoringCombos, getTotalFromCombos, type ScoringCombo } from '@/lib/cribbageScoringDetails';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { getDisplayName } from '@/lib/botAlias';
import { logDebugEvent } from '@/lib/debugEventLogger';

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
  /** Persisted counting progress from DB — authoritative target/beat for reconnect resume. */
  persistedTargetIndex?: number | null;
  persistedBeatIndex?: number | null;
  persistedHandKey?: string | null;
  /** Callback to persist counting progress to DB. Fires on target/combo advancement. */
  onProgressUpdate?: (targetIndex: number, beatIndex: number) => void;
  /** Debug context for trace instrumentation */
  debugContext?: {
    gameId: string;
    roundId: string | null;
    userId: string | null;
    handNumber: number;
  };
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
  persistedTargetIndex,
  persistedBeatIndex,
  persistedHandKey,
  onProgressUpdate,
  debugContext,
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

  // ── Debug helper ────────────────────────────────────────────
  const logCountingDebug = useCallback((eventType: string, payload: Record<string, unknown>) => {
    if (!debugContext) return;
    logDebugEvent({
      gameId: debugContext.gameId,
      roundId: debugContext.roundId,
      userId: debugContext.userId,
      clientRole: 'actor',
      eventType,
      payload: { handNumber: debugContext.handNumber, ...payload },
    });
  }, [debugContext]);

  // Track previous target/combo/phase to detect resets after resume
  const prevResumeStateRef = useRef<{ targetIndex: number; comboIndex: number; phase: string } | null>(null);

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
  const targetSummaries = useMemo(() => {
    return countingTargets.map((target, index) => {
      const combos = getHandScoringCombos(target.hand, cribbageState.cutCard, target.type === 'crib');
      return {
        ...target,
        targetIndex: index,
        combos,
        totalPoints: getTotalFromCombos(combos),
      };
    });
  }, [countingTargets, cribbageState.cutCard]);

  const currentCombos = targetSummaries[currentTargetIndex]?.combos ?? [];

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

  // ── Deterministic beat timeline model ────────────────────────────
  // A "beat" is any discrete animation step. The timeline is a flat list
  // derived identically on every client from the same cribbage state.
  //
  // Beat ordering guarantee:
  //   Target order: turnOrder (non-dealer first, clockwise) → dealer hand → crib
  //   Combo order within each target: fifteens → pairs/trips/quads → runs → flush → nobs
  //   (see getHandScoringCombos — deterministic from card values)
  //
  // Beat types per target:
  //   ENTER      — cards fly in (ENTER_ANIMATION_MS)
  //   INITIAL    — 500ms pause before first combo
  //   COMBO(n)   — display nth combo (COMBO_DELAY_MS)
  //   ZERO       — "0 points" for hands with no combos (1000ms)
  //   TOTAL      — total display after last combo (1500ms)
  //   EXIT       — cards fly out (EXIT_ANIMATION_MS)
  //   COMPLETE   — 1000ms final pause after last target's exit
  //
  // Each beat has a duration. Cumulative start times let us binary-search
  // elapsed time → current beat in O(n) at mount.

  type BeatType = 'enter' | 'initial' | 'combo' | 'zero' | 'total' | 'exit' | 'complete';
  interface Beat {
    type: BeatType;
    targetIndex: number;
    comboIndex: number; // -1 for non-combo beats
    durationMs: number;
    /** Points this beat awards (only for 'combo' type) */
    points: number;
    /** Player who receives points */
    playerId: string;
  }

  interface TargetTimeline {
    targetIndex: number;
    playerId: string;
    label: string;
    combos: ScoringCombo[];
    totalPoints: number;
    startMs: number;
    endMs: number;
    beatStartIndex: number;
    beatEndIndex: number;
  }

  const buildBeatTimeline = useCallback((): { beats: Beat[]; targets: TargetTimeline[]; totalDuration: number } => {
    const beats: Beat[] = [];
    const targets: TargetTimeline[] = [];
    let timelineMs = 0;

    const pushBeat = (beat: Beat) => {
      beats.push(beat);
      timelineMs += beat.durationMs;
    };

    for (const summary of targetSummaries) {
      const startMs = timelineMs;
      const beatStartIndex = beats.length;

      pushBeat({ type: 'enter', targetIndex: summary.targetIndex, comboIndex: -1, durationMs: ENTER_ANIMATION_MS, points: 0, playerId: summary.playerId });
      pushBeat({ type: 'initial', targetIndex: summary.targetIndex, comboIndex: -1, durationMs: 500, points: 0, playerId: summary.playerId });

      if (summary.combos.length === 0) {
        pushBeat({ type: 'zero', targetIndex: summary.targetIndex, comboIndex: -1, durationMs: 1000, points: 0, playerId: summary.playerId });
      } else {
        for (let ci = 0; ci < summary.combos.length; ci++) {
          pushBeat({
            type: 'combo',
            targetIndex: summary.targetIndex,
            comboIndex: ci,
            durationMs: COMBO_DELAY_MS,
            points: summary.combos[ci].points,
            playerId: summary.playerId,
          });
        }
        pushBeat({ type: 'total', targetIndex: summary.targetIndex, comboIndex: -1, durationMs: 1500, points: 0, playerId: summary.playerId });
      }

      pushBeat({ type: 'exit', targetIndex: summary.targetIndex, comboIndex: -1, durationMs: EXIT_ANIMATION_MS, points: 0, playerId: summary.playerId });

      targets.push({
        targetIndex: summary.targetIndex,
        playerId: summary.playerId,
        label: summary.label,
        combos: summary.combos,
        totalPoints: summary.totalPoints,
        startMs,
        endMs: timelineMs,
        beatStartIndex,
        beatEndIndex: beats.length - 1,
      });
    }

    if (targets.length > 0) {
      const lastTarget = targets[targets.length - 1];
      pushBeat({ type: 'complete', targetIndex: lastTarget.targetIndex, comboIndex: -1, durationMs: 1000, points: 0, playerId: lastTarget.playerId });
      lastTarget.endMs = timelineMs;
      lastTarget.beatEndIndex = beats.length - 1;
    }

    return { beats, targets, totalDuration: timelineMs };
  }, [targetSummaries]);

  const countCompletedCombos = useCallback((combos: ScoringCombo[], appliedPoints: number) => {
    let totalApplied = 0;
    let completed = 0;

    for (const combo of combos) {
      if (totalApplied + combo.points <= appliedPoints) {
        totalApplied += combo.points;
        completed += 1;
      } else {
        break;
      }
    }

    return completed;
  }, []);

  // Initialize animated scores from baseline, apply skip-ahead if needed, and propagate to parent
  useEffect(() => {
    if (baselineInitialized) return;
    if (!initialScoresRef.current) return;

    const scoresToInit = { ...initialScoresRef.current };
    const baselineScores = { ...initialScoresRef.current };
    const authoritativeScores = Object.fromEntries(
      Object.entries(cribbageState.playerStates).map(([playerId, playerState]) => [playerId, playerState.pegScore ?? 0])
    ) as Record<string, number>;

    // ── Skip-ahead via beat timeline ─────────────────────────────
    let skipTargetIndex = 0;
    let skipComboIndex = -1;
    let skipPhase: TransitionPhase = 'entering';
    let skipIsTerminal = false;
    let derivedCompletedTargetIndex = -1;
    let derivedResumeTargetIndex = 0;
    let completedCombosPreApplied = 0;

    if (countingStartedAt && !skipAheadAppliedRef.current) {
      const rawElapsed = Date.now() - new Date(countingStartedAt).getTime();
      // Clamp: negative elapsed (clock skew) → no skip
      const elapsedMs = Math.max(0, rawElapsed);

      // Include the 2s pre-counting delay from parent
      const PRE_DELAY = 2000;
      const timeIntoAnimation = elapsedMs - PRE_DELAY;

      const { beats, targets: targetTimelines, totalDuration } = buildBeatTimeline();
      const rawScoreDeltas = Object.fromEntries(
        Object.keys(authoritativeScores).map((playerId) => [
          playerId,
          Math.max(0, (authoritativeScores[playerId] ?? 0) - (baselineScores[playerId] ?? 0)),
        ])
      ) as Record<string, number>;

      const consumedByPlayer: Record<string, number> = {};
      let committedPointsWithinTarget = 0;

      for (let ti = 0; ti < targetTimelines.length; ti++) {
        const target = targetTimelines[ti];
        const playerConsumed = consumedByPlayer[target.playerId] ?? 0;
        const rawDeltaForTargetPlayer = rawScoreDeltas[target.playerId] ?? 0;
        const availableForTarget = Math.max(0, rawDeltaForTargetPlayer - playerConsumed);
        const laterPositiveDeltaExists = targetTimelines.slice(ti + 1).some(
          (laterTarget) => (rawScoreDeltas[laterTarget.playerId] ?? 0) > 0,
        );

        if (target.totalPoints <= 0) {
          const zeroPointTargetElapsed = timeIntoAnimation > target.endMs;
          if (laterPositiveDeltaExists || zeroPointTargetElapsed) {
            derivedCompletedTargetIndex = ti;
            derivedResumeTargetIndex = ti + 1;
            continue;
          }

          derivedResumeTargetIndex = ti;
          committedPointsWithinTarget = 0;
          break;
        }

        if (availableForTarget >= target.totalPoints) {
          consumedByPlayer[target.playerId] = playerConsumed + target.totalPoints;
          derivedCompletedTargetIndex = ti;
          derivedResumeTargetIndex = ti + 1;
          continue;
        }

        derivedResumeTargetIndex = ti;
        committedPointsWithinTarget = availableForTarget;
        break;
      }

      const allTargetsScoreCompleted = targetTimelines.length > 0 && derivedResumeTargetIndex >= targetTimelines.length;

      for (let ti = 0; ti <= derivedCompletedTargetIndex; ti++) {
        const target = targetTimelines[ti];
        scoresToInit[target.playerId] = (scoresToInit[target.playerId] || 0) + target.totalPoints;
        completedCombosPreApplied += target.combos.length;
      }

      if (allTargetsScoreCompleted || (timeIntoAnimation >= totalDuration && derivedResumeTargetIndex >= targetTimelines.length - 1)) {
        skipIsTerminal = true;
      } else if (timeIntoAnimation > 0 && targetTimelines.length > 0) {
        const clampedResumeTargetIndex = Math.min(derivedResumeTargetIndex, targetTimelines.length - 1);
        const resumeTarget = targetTimelines[clampedResumeTargetIndex];
        const committedComboCount = countCompletedCombos(resumeTarget.combos, committedPointsWithinTarget);

        for (let ci = 0; ci < committedComboCount; ci++) {
          scoresToInit[resumeTarget.playerId] = (scoresToInit[resumeTarget.playerId] || 0) + resumeTarget.combos[ci].points;
        }

        const targetElapsedMs = Math.max(0, Math.min(timeIntoAnimation - resumeTarget.startMs, Math.max(0, resumeTarget.endMs - resumeTarget.startMs - 1)));

        let localBeatElapsed = 0;
        let activeBeatIndex = resumeTarget.beatStartIndex;
        let activeBeat = beats[resumeTarget.beatStartIndex];

        for (let bi = resumeTarget.beatStartIndex; bi <= resumeTarget.beatEndIndex; bi++) {
          const beat = beats[bi];
          if (localBeatElapsed + beat.durationMs > targetElapsedMs) {
            activeBeatIndex = bi;
            activeBeat = beat;
            break;
          }
          localBeatElapsed += beat.durationMs;
        }

        const timeCompletedCombosWithinTarget = beats
          .slice(resumeTarget.beatStartIndex, activeBeatIndex)
          .filter((beat) => beat.type === 'combo')
          .length;
        const combosToPreApplyWithinTarget = Math.max(committedComboCount, timeCompletedCombosWithinTarget);

        for (let ci = committedComboCount; ci < combosToPreApplyWithinTarget; ci++) {
          scoresToInit[resumeTarget.playerId] = (scoresToInit[resumeTarget.playerId] || 0) + resumeTarget.combos[ci].points;
        }

        completedCombosPreApplied += combosToPreApplyWithinTarget;
        skipTargetIndex = clampedResumeTargetIndex;

        if (activeBeat.type === 'enter' && combosToPreApplyWithinTarget === 0) {
          skipComboIndex = -1;
          skipPhase = 'entering';
        } else if (activeBeat.type === 'initial' || activeBeat.type === 'zero') {
          skipComboIndex = combosToPreApplyWithinTarget > 0 ? combosToPreApplyWithinTarget : -1;
          skipPhase = 'scoring';
        } else if (activeBeat.type === 'combo') {
          skipComboIndex = Math.max(combosToPreApplyWithinTarget, activeBeat.comboIndex);
          skipPhase = 'scoring';
        } else if (activeBeat.type === 'total') {
          skipComboIndex = resumeTarget.combos.length;
          skipPhase = 'scoring';
        } else if (activeBeat.type === 'exit' || activeBeat.type === 'complete') {
          skipComboIndex = -1;
          skipPhase = 'exiting';
        }

        console.log('[CribbageCountingPhase] Score-anchored skip-ahead applied', {
          elapsedMs,
          activeBeatIndex,
          activeBeatType: activeBeat.type,
          derivedCompletedTargetIndex,
          derivedResumeTargetIndex: clampedResumeTargetIndex,
          skipTargetIndex,
          skipComboIndex,
          skipPhase,
          completedCombosPreApplied,
        });

        logCountingDebug('crib:counting_resume_skip_compute', {
          elapsedMs,
          timeIntoAnimation,
          activeBeatIndex,
          activeBeatType: activeBeat.type,
          computedTargetIndex: skipTargetIndex,
          computedComboIndex: skipComboIndex,
          computedTransitionPhase: skipPhase,
          completedCombosPreApplied,
          totalBeats: beats.length,
          totalDuration,
          baselineScores,
          authoritativeScores,
          poneTotal: targetTimelines[0]?.totalPoints ?? null,
          dealerTotal: targetTimelines[1]?.totalPoints ?? null,
          derivedCompletedTargetIndex,
          derivedResumeTargetIndex: clampedResumeTargetIndex,
          baselineScoresUsed: { ...scoresToInit },
        });
      } else {
        logCountingDebug('crib:counting_resume_skip_compute', {
          elapsedMs,
          timeIntoAnimation,
          activeBeatIndex: null,
          activeBeatType: 'pre-delay',
          computedTargetIndex: skipTargetIndex,
          computedComboIndex: skipComboIndex,
          computedTransitionPhase: skipPhase,
          completedCombosPreApplied,
          totalBeats: 0,
          totalDuration,
          baselineScores,
          authoritativeScores,
          poneTotal: targetTimelines[0]?.totalPoints ?? null,
          dealerTotal: targetTimelines[1]?.totalPoints ?? null,
          derivedCompletedTargetIndex,
          derivedResumeTargetIndex,
          baselineScoresUsed: { ...scoresToInit },
        });
      }

      skipAheadAppliedRef.current = true;
    }

    setAnimatedScores(scoresToInit);

    // Propagate to parent for peg board sync
    if (onScoreUpdate) {
      onScoreUpdate(scoresToInit);
    }

    setBaselineInitialized(true);

    // ── Debug: crib:counting_resume_mount ──────────────────────
    logCountingDebug('crib:counting_resume_mount', {
      countingStartedAt: countingStartedAt ?? null,
      initialTargetIndex: skipIsTerminal ? 'terminal' : skipTargetIndex,
      initialComboIndex: skipIsTerminal ? 'terminal' : skipComboIndex,
      initialTransitionPhase: skipIsTerminal ? 'terminal' : skipPhase,
      hadCountingStartedAt: !!countingStartedAt,
      skipAheadRan: skipAheadAppliedRef.current,
      isTerminal: skipIsTerminal,
      baselineScores,
    });

    // ── Terminal: skip directly to completion ───────────────────
    if (skipIsTerminal) {
      completedRef.current = true;
      setIsComplete(true);
      setAnnouncementData(null);
      // Fire completion callback after a brief frame to let state settle
      completeTimerRef.current = setTimeout(() => {
        if (!winFrozenRef.current) onCountingComplete(false);
      }, 100);
      return;
    }

    // Apply skip-ahead state if we're past the start
    if (skipTargetIndex > 0 || skipComboIndex > -1) {
      setCurrentTargetIndex(skipTargetIndex);
      setCurrentComboIndex(skipComboIndex);
      setTransitionPhase(skipPhase);

      // ── Debug: crib:counting_resume_state_apply ─────────────
      logCountingDebug('crib:counting_resume_state_apply', {
        targetIndexApplied: skipTargetIndex,
        comboIndexApplied: skipComboIndex,
        transitionPhaseApplied: skipPhase,
        animatedScoresAfterApply: { ...scoresToInit },
      });
      prevResumeStateRef.current = { targetIndex: skipTargetIndex, comboIndex: skipComboIndex, phase: skipPhase };
    }

    // Start entering animation (skip if already past enter phase)
    if (skipPhase !== 'scoring' && skipPhase !== 'exiting') {
      enterToScoringTimerRef.current = setTimeout(() => {
        if (winFrozenRef.current) return;
        setTransitionPhase('scoring');
      }, ENTER_ANIMATION_MS);
    }
  }, [baselineInitialized, onScoreUpdate]);

  // ── Debug: crib:counting_resume_state_reset ─────────────────
  useEffect(() => {
    if (!baselineInitialized) return;
    const prev = prevResumeStateRef.current;
    if (!prev) {
      prevResumeStateRef.current = { targetIndex: currentTargetIndex, comboIndex: currentComboIndex, phase: transitionPhase };
      return;
    }
    if (prev.targetIndex === currentTargetIndex && prev.comboIndex === currentComboIndex && prev.phase === transitionPhase) return;
    logCountingDebug('crib:counting_resume_state_reset', {
      prevTargetIndex: prev.targetIndex,
      prevComboIndex: prev.comboIndex,
      prevPhase: prev.phase,
      nextTargetIndex: currentTargetIndex,
      nextComboIndex: currentComboIndex,
      nextPhase: transitionPhase,
    });
    prevResumeStateRef.current = { targetIndex: currentTargetIndex, comboIndex: currentComboIndex, phase: transitionPhase };
  }, [currentTargetIndex, currentComboIndex, transitionPhase, baselineInitialized, logCountingDebug]);

  // ── Debug: crib:counting_resume_render ──────────────────────
  const lastRenderDebugRef = useRef<string>('');
  useEffect(() => {
    if (!baselineInitialized) return;
    const key = `${currentTargetIndex}:${currentComboIndex}:${transitionPhase}`;
    if (key === lastRenderDebugRef.current) return;
    lastRenderDebugRef.current = key;
    const target = countingTargets[currentTargetIndex];
    logCountingDebug('crib:counting_resume_render', {
      renderedTargetLabel: target?.label ?? 'none',
      currentTargetIndex,
      currentComboIndex,
      transitionPhase,
      displayedPegboardScores: { ...animatedScores },
      isComplete,
    });
  }, [currentTargetIndex, currentComboIndex, transitionPhase, baselineInitialized, animatedScores, isComplete, logCountingDebug, countingTargets]);

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
