import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { getHandScoringCombos, getTotalFromCombos, type ScoringCombo } from '@/lib/cribbageScoringDetails';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { getDisplayName } from '@/lib/botAlias';
import { logDebugEvent } from '@/lib/debugEventLogger';
import { useCardOverlap } from '@/lib/geometryLab/cardArtifactOverlap';
import { countingTruthLedger, makeEmptyContradictions, type CountingTruthEntry } from '@/lib/cribbage/countingTruthLedger';
// CribbageCountingTruthPill is mounted at CribbageMobileGameTable so it
// escapes any transformed felt ancestor and remains visible.



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
  // Announcement carries owner-identity (targetIndex + comboIndex) so the
  // render layer can identity-suppress stale prior-owner announcements
  // and hard-guarantee the render never bleeds into the next owner.
  const [announcementData, setAnnouncementData] = useState<{
    text: string;
    targetLabel: string;
    key: number;
    targetIndex: number;
    comboIndex: number;
    category: CountingTruthEntry['announcementCategory'];
  } | null>(null);
  const [animatedScores, setAnimatedScores] = useState<Record<string, number>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('entering');
  const [exitingCards, setExitingCards] = useState<CribbageCard[]>([]);
  const [baselineInitialized, setBaselineInitialized] = useState(false);
  const skipAheadAppliedRef = useRef(false);
  // Monotonic announcement key so we can publish the rail emit in the
  // SAME tick as the highlight state update (bound to the presentation
  // beat, not to the useEffect that runs after paint).
  const announcementKeyRef = useRef(0);
  // Track announcement visibility timing for the truth ledger.
  const announcementStartedAtRef = useRef<number | null>(null);
  const announcementHiddenAtRef = useRef<number | null>(null);
  const lastAnnouncementCategoryRef = useRef<CountingTruthEntry['announcementCategory']>(null);
  // Refs mirror the freshest scoring-owner identity so publishAnnouncement
  // stamps the emit with the target/combo it belongs to, even when called
  // inside a scheduled timer.
  const currentTargetIndexRef = useRef(0);
  const currentComboIndexRef = useRef(-1);
  const publishAnnouncement = useCallback(
    (text: string, targetLabel: string, category: CountingTruthEntry['announcementCategory'] = 'combo') => {
      const key = ++announcementKeyRef.current;
      const now = Date.now();
      announcementStartedAtRef.current = now;
      announcementHiddenAtRef.current = null;
      announcementPublishedAtRef.current = now;
      lastAnnouncementCategoryRef.current = category;
      const targetIndex = currentTargetIndexRef.current;
      const comboIndex = currentComboIndexRef.current;
      setAnnouncementData({ text, targetLabel, key, targetIndex, comboIndex, category });
      onAnnouncementChange?.(text, targetLabel, key);
      countingTruthLedger.record({
        source: category === 'zero' ? 'zero_announce' : category === 'total' ? 'total_announce' : 'combo_announce',
        ...truthSnapshotRef.current,
        announcementText: text,
        announcementCategory: category,
        announcementComboKey: key,
        announcementVisible: true,
        announcementMounted: true,
        announcementStartedAt: announcementStartedAtRef.current,
        announcementHiddenAt: null,
        announcementClearReason: null,
        totalSummaryVisible: category === 'total',
        totalSummaryText: category === 'total' ? text : truthSnapshotRef.current.totalSummaryText,
        totalSummaryOwnerPlayerId: category === 'total' ? truthSnapshotRef.current.scoringOwnerPlayerId : truthSnapshotRef.current.totalSummaryOwnerPlayerId,
        totalSummaryMountedAt: category === 'total' ? now : truthSnapshotRef.current.totalSummaryMountedAt,
        announcementPublishedAt: now,
        contradictions: makeEmptyContradictions(),
      });
      // Also emit distinct producer event flavor for combo/total publish
      const producerSource: CountingTruthEntry['source'] | null =
        category === 'combo' ? 'combo_announce_publish'
        : category === 'total' ? 'total_announce_publish'
        : null;
      if (producerSource) {
        countingTruthLedger.record({
          source: producerSource,
          ...truthSnapshotRef.current,
          eventSource: 'publishAnnouncement',
          eventReason: `${category}-publish`,
          currentTargetIndex: targetIndex,
          currentComboIndex: comboIndex,
          announcementDataText: text,
          announcementDataCategory: category,
          announcementDataKey: key,
          announcementDataTargetIndex: targetIndex,
          announcementDataComboIndex: comboIndex,
          announcementPublishedAt: now,
          contradictions: makeEmptyContradictions(),
        });
      }
    },
    [onAnnouncementChange],
  );

  // Keep identity refs in sync every render.
  currentTargetIndexRef.current = currentTargetIndex;
  currentComboIndexRef.current = currentComboIndex;




  // ── Truth-ledger snapshot ref (instrumentation only) ─────────
  // Updated every render below with the freshest identity/state so
  // effects/timeouts always publish accurate entries without prop drilling.
  const truthSnapshotRef = useRef<Omit<CountingTruthEntry, 'ts' | 'source' | 'contradictions'>>({
    roundId: null, handNumber: null, handContextId: null,
    scoringOwnerPlayerId: null, scoringOwnerRole: null,
    scoringPhase: null, scoringSubphase: null, scoringHandKey: null,
    scoringStepIndex: null, totalCombosForOwner: null,
    isFinalComboForOwner: null, nextOwnerPlayerId: null,
    announcementText: null, announcementCategory: null,
    announcementOwnerPlayerId: null, announcementComboKey: null,
    announcementVisible: false, announcementMounted: false,
    announcementStartedAt: null, announcementHiddenAt: null,
    announcementClearReason: null,
    staleAnnouncementOwnerMismatch: false, staleAnnouncementComboMismatch: false,
    currentComboLabel: null, currentComboPoints: null, currentComboCardIds: [],
    comboHighlightActive: false, comboRaiseActive: false,
    comboHighlightStartedAt: null, comboHighlightEndedAt: null,
    comboTransitionReason: null, previousComboIndex: null, nextComboIndex: null,
    domCards: [],
    totalSummaryVisible: false, totalSummaryOwnerPlayerId: null,
    totalSummaryText: null, totalSummaryPoints: null, totalSummaryMountedAt: null,
    finalComboAnnouncementVisibleWhenSummaryMounts: false,
    finalComboAnnouncementVisibleWhenNextOwnerStarts: false,
  });
  const recordTruth = useCallback(
    (
      source: CountingTruthEntry['source'],
      patch: Partial<Omit<CountingTruthEntry, 'ts' | 'source'>> = {},
    ) => {
      countingTruthLedger.record({
        source,
        ...truthSnapshotRef.current,
        ...patch,
        contradictions: { ...makeEmptyContradictions(), ...(patch.contradictions ?? {}) },
      });
    },
    [],
  );

  // ── Producer-lifecycle instrumentation refs (no behavior) ───
  const announcementPublishedAtRef = useRef<number | null>(null);
  const announcementClearRequestedAtRef = useRef<number | null>(null);
  const announcementClearSourceRef = useRef<string | null>(null);
  const prevHighlightedCardIdsRef = useRef<string[]>([]);
  const rafSampleCountRef = useRef(0);
  const transitionEndReceivedRef = useRef<{ cardIds: string[]; props: string[]; elapsed: number[] }>({
    cardIds: [], props: [], elapsed: [],
  });
  const finalLowerWatchedIdsRef = useRef<string[]>([]);
  const finalLowerWatchedNodeCountRef = useRef<number>(0);
  const finalLowerMissingIdsRef = useRef<string[]>([]);

  const buildEventMeta = useCallback((extra: Partial<CountingTruthEntry> = {}): Partial<CountingTruthEntry> => {
    const snap = truthSnapshotRef.current;
    const pending = finalLowerPendingRef.current;
    return {
      eventSource: extra.eventSource ?? null,
      eventReason: extra.eventReason ?? null,
      currentTargetIndex: currentTargetIndexRef.current,
      currentComboIndex: currentComboIndexRef.current,
      totalCombos: snap.totalCombosForOwner ?? null,
      transitionPhase: snap.scoringSubphase ?? null,
      announcementDataText: snap.announcementText ?? null,
      announcementDataCategory: snap.announcementCategory ?? null,
      announcementDataKey: snap.announcementComboKey ?? null,
      announcementDataTargetIndex: currentTargetIndexRef.current,
      announcementDataComboIndex: currentComboIndexRef.current,
      highlightedCardIds: snap.comboHighlightActive ? snap.currentComboCardIds : [],
      previousHighlightedCardIds: prevHighlightedCardIdsRef.current,
      currentComboLabelSnapshot: snap.currentComboLabel ?? null,
      currentComboCardIdsSnapshot: snap.currentComboCardIds ?? [],
      finalComboLowerPending: pending != null,
      finalComboLowerPendingCardIds: pending?.cardIds ?? [],
      finalComboLowerPendingStartedAt: pending?.startedAt ?? null,
      deadmanActive: finalLowerTimersRef.current.deadman != null,
      announcementPublishedAt: announcementPublishedAtRef.current,
      announcementClearRequestedAt: announcementClearRequestedAtRef.current,
      announcementClearSource: announcementClearSourceRef.current,
      ...extra,
    };
  }, []);

  const recordEvent = useCallback(
    (source: CountingTruthEntry['source'], extra: Partial<CountingTruthEntry> = {}) => {
      recordTruth(source, buildEventMeta(extra));
    },
    [recordTruth, buildEventMeta],
  );

  // Universal fan-overlap (Geometry Lab). Cribbage scoring uses TWO
  // independent controls: cluster card-to-card overlap + cluster ↔ cut

  // card horizontal gap. Cut card is NOT part of the hand fan.
  // Both controls resolve from the ACTUAL responsive card width via
  // ResizeObserver; no fixed-px width or breakpoint map.
  const scoringFanOverlap = useCardOverlap('cardOverlap.cribbage.scoringHand');
  const scoringToCutGap = useCardOverlap('cardOverlap.cribbage.scoringHandToCutGap');
  const firstCardRef = useRef<HTMLDivElement | null>(null);
  const [measuredCardWidthPx, setMeasuredCardWidthPx] = useState<number>(40);
  useEffect(() => {
    const el = firstCardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setMeasuredCardWidthPx(w);
    });
    ro.observe(el);
    const w = el.getBoundingClientRect().width;
    if (w > 0) setMeasuredCardWidthPx(w);
    return () => ro.disconnect();
  }, []);
  const scoringHandMarginPx = -scoringFanOverlap * measuredCardWidthPx;
  const scoringHandToCutGapPx = scoringToCutGap * measuredCardWidthPx;
  
  const completedRef = useRef(false);
  const enterToScoringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Visual-lower gate: pending state for the final-combo → total handoff.
  // While non-null, the effect defers publishing the Total announcement
  // until the scoring-card DOM lower transition is visually complete
  // (transitionend on transform for the tracked card IDs) or a deadman
  // fallback fires. See lifecycle contract in the scoring effect.
  const finalLowerPendingRef = useRef<null | {
    cardIds: string[];
    targetIndex: number;
    targetLabel: string;
    total: number;
    startedAt: number;
  }>(null);
  const finalLowerTimersRef = useRef<{
    deadman: ReturnType<typeof setTimeout> | null;
    raf: number | null;
  }>({ deadman: null, raf: null });
  const finalLowerCleanupRef = useRef<null | (() => void)>(null);
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
    if (finalLowerTimersRef.current.deadman) {
      clearTimeout(finalLowerTimersRef.current.deadman);
      finalLowerTimersRef.current.deadman = null;
    }
    if (finalLowerTimersRef.current.raf != null) {
      cancelAnimationFrame(finalLowerTimersRef.current.raf);
      finalLowerTimersRef.current.raf = null;
    }
    if (finalLowerCleanupRef.current) {
      finalLowerCleanupRef.current();
      finalLowerCleanupRef.current = null;
    }
    finalLowerPendingRef.current = null;

    announcementHiddenAtRef.current = Date.now();
    setAnnouncementData(null);
    onAnnouncementChange?.(null, null);
    countingTruthLedger.record({
      source: 'win_frozen',
      ...truthSnapshotRef.current,
      announcementVisible: false,
      announcementMounted: false,
      announcementHiddenAt: announcementHiddenAtRef.current,
      announcementClearReason: 'win-frozen',
      contradictions: makeEmptyContradictions(),
    });

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

  // ── Keep truth-ledger snapshot fresh every render (instrumentation only) ──
  {
    const t = countingTargets[currentTargetIndex];
    const next = countingTargets[currentTargetIndex + 1];
    const combo = currentComboIndex >= 0 && currentComboIndex < currentCombos.length
      ? currentCombos[currentComboIndex]
      : null;
    const cardId = (c: CribbageCard) => `${c.rank}${c.suit?.[0] ?? '?'}`;
    truthSnapshotRef.current = {
      ...truthSnapshotRef.current,
      roundId: debugContext?.roundId ?? null,
      handNumber: debugContext?.handNumber ?? null,
      handContextId: null,
      scoringOwnerPlayerId: t?.playerId ?? null,
      scoringOwnerRole: t
        ? (t.type === 'crib' ? 'crib' : (t.playerId === cribbageState.dealerPlayerId ? 'dealer' : 'opponent'))
        : null,
      scoringPhase: cribbageState.phase,
      scoringSubphase: transitionPhase,
      scoringHandKey: persistedHandKey ?? null,
      scoringStepIndex: currentComboIndex,
      totalCombosForOwner: currentCombos.length,
      isFinalComboForOwner: currentCombos.length > 0 && currentComboIndex === currentCombos.length - 1,
      nextOwnerPlayerId: next?.playerId ?? null,
      announcementText: announcementData?.text ?? null,
      announcementOwnerPlayerId: t?.playerId ?? null,
      announcementComboKey: announcementData?.key ?? null,
      announcementVisible: !!announcementData,
      announcementMounted: !!announcementData,
      announcementStartedAt: announcementStartedAtRef.current,
      announcementHiddenAt: announcementHiddenAtRef.current,
      announcementCategory: lastAnnouncementCategoryRef.current,
      currentComboLabel: combo?.label ?? null,
      currentComboPoints: combo?.points ?? null,
      currentComboCardIds: combo ? combo.cards.map(cardId) : [],
      comboHighlightActive: highlightedCards.length > 0,
      // Instrumentation truthfulness: raiseActive requires an actual combo
      // set to be logically active. Cannot report raiseActive=true when
      // there is no current combo label/card set.
      comboRaiseActive:
        highlightedCards.length > 0 &&
        transitionPhase === 'scoring' &&
        combo != null &&
        combo.cards.length > 0,
      previousComboIndex: currentComboIndex - 1,
      nextComboIndex: currentComboIndex + 1,
    };
  }



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

  // (countCompletedCombos removed — no longer needed with persisted-progress resume)

  // Initialize animated scores from baseline, apply skip-ahead if needed, and propagate to parent
  useEffect(() => {
    if (baselineInitialized) return;
    if (!initialScoresRef.current) return;

    const scoresToInit = { ...initialScoresRef.current };
    const baselineScores = { ...initialScoresRef.current };

    // ── Skip-ahead via PERSISTED counting progress ──────────────
    // The authoritative source of truth for counting position is
    // persistedTargetIndex / persistedBeatIndex from the DB state,
    // NOT score deltas (which are not written incrementally).
    let skipTargetIndex = 0;
    let skipComboIndex = -1;
    let skipPhase: TransitionPhase = 'entering';
    let skipIsTerminal = false;
    let completedCombosPreApplied = 0;

    const hasPersistedProgress = persistedTargetIndex != null && persistedTargetIndex > 0;
    const hasPersistedBeat = persistedBeatIndex != null && persistedBeatIndex > -1;

    if ((hasPersistedProgress || hasPersistedBeat) && !skipAheadAppliedRef.current) {
      const pTargetIdx = persistedTargetIndex ?? 0;
      const pBeatIdx = persistedBeatIndex ?? -1;
      const { beats, targets: targetTimelines, totalDuration } = buildBeatTimeline();

      // Terminal check: if persisted target is beyond all targets, skip to completion
      if (pTargetIdx >= targetTimelines.length) {
        skipIsTerminal = true;
      } else {
        // Pre-apply all completed targets' scores to baseline
        for (let ti = 0; ti < pTargetIdx; ti++) {
          const target = targetTimelines[ti];
          scoresToInit[target.playerId] = (scoresToInit[target.playerId] || 0) + target.totalPoints;
          completedCombosPreApplied += target.combos.length;
        }

        // Within the current target, pre-apply completed combos
        const resumeTarget = targetTimelines[pTargetIdx];
        const combosToPreApply = Math.max(0, pBeatIdx);
        for (let ci = 0; ci < Math.min(combosToPreApply, resumeTarget.combos.length); ci++) {
          scoresToInit[resumeTarget.playerId] = (scoresToInit[resumeTarget.playerId] || 0) + resumeTarget.combos[ci].points;
          completedCombosPreApplied++;
        }

        skipTargetIndex = pTargetIdx;

        // Map persisted beat index to animation state
        if (pBeatIdx <= -1) {
          // Still entering
          skipComboIndex = -1;
          skipPhase = 'entering';
        } else if (pBeatIdx === 0) {
          // At first combo, start scoring
          skipComboIndex = 0;
          skipPhase = 'scoring';
        } else if (pBeatIdx < resumeTarget.combos.length) {
          // Mid-combo
          skipComboIndex = pBeatIdx;
          skipPhase = 'scoring';
        } else {
          // Past all combos — show total then exit
          skipComboIndex = resumeTarget.combos.length;
          skipPhase = 'scoring';
        }
      }

      console.log('[CribbageCountingPhase] Persisted-progress skip-ahead applied', {
        persistedTargetIndex: pTargetIdx,
        persistedBeatIndex: pBeatIdx,
        skipTargetIndex,
        skipComboIndex,
        skipPhase,
        skipIsTerminal,
        completedCombosPreApplied,
      });

      logCountingDebug('crib:counting_resume_skip_compute', {
        source: 'persisted_progress',
        persistedTargetIndex: pTargetIdx,
        persistedBeatIndex: pBeatIdx,
        persistedHandKey: persistedHandKey ?? null,
        computedTargetIndex: skipTargetIndex,
        computedComboIndex: skipComboIndex,
        computedTransitionPhase: skipPhase,
        completedCombosPreApplied,
        skipIsTerminal,
        baselineScores,
        baselineScoresUsed: { ...scoresToInit },
      });

      skipAheadAppliedRef.current = true;
    } else if (countingStartedAt && !skipAheadAppliedRef.current) {
      // Fallback: time-based skip for cases where persisted progress is 0/0
      // (i.e., the writing client hasn't advanced yet but time has elapsed)
      const rawElapsed = Date.now() - new Date(countingStartedAt).getTime();
      const elapsedMs = Math.max(0, rawElapsed);
      const PRE_DELAY = 2000;
      const timeIntoAnimation = elapsedMs - PRE_DELAY;
      const { totalDuration } = buildBeatTimeline();

      if (timeIntoAnimation >= totalDuration && totalDuration > 0) {
        skipIsTerminal = true;
      }

      logCountingDebug('crib:counting_resume_skip_compute', {
        source: 'time_fallback',
        elapsedMs,
        timeIntoAnimation,
        totalDuration,
        skipIsTerminal,
        baselineScores,
      });

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
      persistedTargetIndex: persistedTargetIndex ?? null,
      persistedBeatIndex: persistedBeatIndex ?? null,
      persistedHandKey: persistedHandKey ?? null,
      initialTargetIndex: skipIsTerminal ? 'terminal' : skipTargetIndex,
      initialComboIndex: skipIsTerminal ? 'terminal' : skipComboIndex,
      initialTransitionPhase: skipIsTerminal ? 'terminal' : skipPhase,
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
    if ((skipPhase as TransitionPhase) !== 'scoring' && (skipPhase as TransitionPhase) !== 'exiting') {
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
          recordEvent('combo_enter', {
            eventSource: 'scoringEffect',
            eventReason: 'enter-zero',
            timerThatAdvancedCombo: 'timer.enter->zero(500ms)',
            effectThatRan: 'scoringEffect',
            dependenciesSnapshot: { currentTargetIndex, currentComboIndex, transitionPhase, isComplete, winFrozen },
          });
          setHighlightedCards([]);
          publishAnnouncement('0 points', currentTarget.label, 'zero');

          innerTimer = setTimeout(() => {
            if (!winFrozenRef.current) startExitTransition();
          }, 1000);
        } else {
          recordEvent('combo_enter', {
            eventSource: 'scoringEffect',
            eventReason: 'enter-first-combo',
            timerThatAdvancedCombo: 'timer.enter->combo0(500ms)',
            effectThatRan: 'scoringEffect',
            dependenciesSnapshot: { currentTargetIndex, currentComboIndex, transitionPhase, isComplete, winFrozen },
          });
          setCurrentComboIndex(0);
          onProgressUpdate?.(currentTargetIndex, 0);
        }
        return;
      }

      if (currentComboIndex < currentCombos.length) {
        const combo = currentCombos[currentComboIndex];
        const comboIds = combo.cards.map((c) => `${c.rank}${c.suit?.[0] ?? '?'}`);
        recordEvent('combo_raise_start', {
          eventSource: 'scoringEffect',
          eventReason: 'raise-combo',
          highlightedCardIds: comboIds,
          previousHighlightedCardIds: prevHighlightedCardIdsRef.current,
          currentComboLabelSnapshot: combo.label,
          currentComboCardIdsSnapshot: comboIds,
          effectThatRan: 'scoringEffect',
          dependenciesSnapshot: { currentTargetIndex, currentComboIndex, transitionPhase, isComplete, winFrozen },
        });
        setHighlightedCards(combo.cards);
        publishAnnouncement(`${combo.label}: +${combo.points}`, currentTarget.label, 'combo');

        setAnimatedScores((prev) => {
          const next = {
            ...prev,
            [currentTarget.playerId]: (prev[currentTarget.playerId] || 0) + combo.points,
          };
          if (onScoreUpdate) onScoreUpdate(next);
          return next;
        });

        innerTimer = setTimeout(() => {
          if (!winFrozenRef.current) {
            const nextCombo = currentComboIndex + 1;
            setCurrentComboIndex(nextCombo);
            onProgressUpdate?.(currentTargetIndex, nextCombo);
          }
        }, COMBO_DELAY_MS);
        return;
      }

      // ── Final combo → Total: visual-lower gate ─────────────────
      const finalCombo = currentCombos[currentCombos.length - 1];
      const finalComboIds = finalCombo
        ? finalCombo.cards.map((c) => `${c.rank}${c.suit?.[0] ?? '?'}`)
        : [];
      recordEvent('combo_lower_start', {
        eventSource: 'scoringEffect',
        eventReason: 'past-last-combo',
        finalComboLowerPendingCardIds: finalComboIds,
        highlightedCardIds: [],
        previousHighlightedCardIds: prevHighlightedCardIdsRef.current,
        effectThatRan: 'scoringEffect',
      });
      setHighlightedCards([]);
      recordTruth('highlight_cleared', {
        comboHighlightEndedAt: Date.now(),
        comboTransitionReason: 'final-combo-lower-armed',
      });
      const totalPoints = getTotalFromCombos(currentCombos);
      const targetLabel = currentTarget.label;
      const armedTargetIndex = currentTargetIndex;

      if (finalLowerCleanupRef.current) {
        finalLowerCleanupRef.current();
        finalLowerCleanupRef.current = null;
      }
      const startedAt = Date.now();
      finalLowerPendingRef.current = {
        cardIds: finalComboIds,
        targetIndex: armedTargetIndex,
        targetLabel,
        total: totalPoints,
        startedAt,
      };
      finalLowerWatchedIdsRef.current = finalComboIds;
      finalLowerMissingIdsRef.current = [];
      transitionEndReceivedRef.current = { cardIds: [], props: [], elapsed: [] };
      recordEvent('combo_lower_pending', {
        eventSource: 'scoringEffect',
        eventReason: 'gate-armed',
        finalComboLowerPending: true,
        finalComboLowerPendingCardIds: finalComboIds,
        finalComboLowerPendingStartedAt: startedAt,
        watchedCardIds: finalComboIds,
      });

      const finalizeTotal = (
        reason: 'transitionend' | 'deadman' | 'no-cards' | 'raf-dom-identity' | 'node-missing-skip',
      ) => {
        if (winFrozenRef.current) return;
        const pending = finalLowerPendingRef.current;
        if (!pending || pending.targetIndex !== armedTargetIndex) return;
        finalLowerPendingRef.current = null;
        if (finalLowerCleanupRef.current) {
          finalLowerCleanupRef.current();
          finalLowerCleanupRef.current = null;
        }
        const resolvedAt = Date.now();
        const resolveReason: CountingTruthEntry['finalComboLowerResolveReason'] =
          reason === 'transitionend' ? 'transitionend-all'
          : reason === 'deadman' ? 'deadman'
          : reason === 'no-cards' ? 'no-cards'
          : reason === 'raf-dom-identity' ? 'raf-dom-identity'
          : 'node-missing-skip';
        recordEvent('combo_lower_complete', {
          eventSource: 'gate.finalizeTotal',
          eventReason: `resolve:${reason}`,
          finalComboLowerResolvedAt: resolvedAt,
          finalComboLowerResolveReason: resolveReason,
          transitionEndReceivedCardIds: [...transitionEndReceivedRef.current.cardIds],
          transitionEndPropertyNames: [...transitionEndReceivedRef.current.props],
          transitionEndElapsedTimes: [...transitionEndReceivedRef.current.elapsed],
          missingWatchedCardIds: [...finalLowerMissingIdsRef.current],
          watchedCardIds: [...finalLowerWatchedIdsRef.current],
          contradictions: {
            ...makeEmptyContradictions(),
            lowerResolverFiredByDeadman: reason === 'deadman',
          },
        });
        recordTruth('highlight_cleared', {
          comboHighlightEndedAt: resolvedAt,
          comboTransitionReason: `final-combo-lower-complete:${reason}`,
        });
        recordEvent('total_eligible', {
          eventSource: 'gate.finalizeTotal',
          eventReason: 'about-to-publish-total',
          finalComboLowerResolvedAt: resolvedAt,
          finalComboLowerResolveReason: resolveReason,
        });
        publishAnnouncement(`Total: ${pending.total} points`, pending.targetLabel, 'total');
        innerTimer = setTimeout(() => {
          if (!winFrozenRef.current) startExitTransition();
        }, 1500);
      };

      if (typeof document === 'undefined' || finalComboIds.length === 0) {
        finalizeTotal('no-cards');
      } else {
        const raf = requestAnimationFrame(() => {
          finalLowerTimersRef.current.raf = null;
          rafSampleCountRef.current += 1;
          const remaining = new Set(finalComboIds);
          const nodes: Array<{ el: HTMLElement; handler: (e: TransitionEvent) => void }> = [];
          const watchedTransforms: Record<string, string> = {};
          const watchedHighlightedAttr: Record<string, string> = {};
          const missing: string[] = [];
          for (const id of finalComboIds) {
            const el = document.querySelector(
              `[data-cribbage-scoring-card="true"][data-card-id="${id}"]`,
            ) as HTMLElement | null;
            if (!el) {
              remaining.delete(id);
              missing.push(id);
              recordEvent('node_missing', {
                eventSource: 'gate.rafAttach',
                eventReason: 'watched-card-not-in-dom',
                missingWatchedCardIds: [id],
                watchedCardIds: finalComboIds,
              });
              continue;
            }
            const cs = window.getComputedStyle(el);
            const t = cs.transform;
            watchedTransforms[id] = t;
            watchedHighlightedAttr[id] = el.dataset.cardHighlighted ?? '';
            const isIdentity =
              t === 'none' ||
              t === 'matrix(1, 0, 0, 1, 0, 0)' ||
              t === 'matrix(1,0,0,1,0,0)';
            if (isIdentity && el.dataset.cardHighlighted === 'false') {
              remaining.delete(id);
              continue;
            }
            const handler = (e: TransitionEvent) => {
              if (e.propertyName !== 'transform') return;
              transitionEndReceivedRef.current.cardIds.push(id);
              transitionEndReceivedRef.current.props.push(e.propertyName);
              transitionEndReceivedRef.current.elapsed.push(e.elapsedTime ?? 0);
              recordEvent('transitionend', {
                eventSource: 'gate.transitionend',
                eventReason: `end:${id}`,
                watchedCardIds: finalComboIds,
                watchedDomNodeCount: nodes.length,
                transitionEndReceivedCardIds: [id],
                transitionEndPropertyNames: [e.propertyName],
                transitionEndElapsedTimes: [e.elapsedTime ?? 0],
              });
              remaining.delete(id);
              el.removeEventListener('transitionend', handler);
              if (remaining.size === 0) finalizeTotal('transitionend');
            };
            el.addEventListener('transitionend', handler);
            nodes.push({ el, handler });
          }
          finalLowerWatchedNodeCountRef.current = nodes.length;
          finalLowerMissingIdsRef.current = missing;
          const allIdentity = Object.values(watchedTransforms).every(
            (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)' || t === 'matrix(1,0,0,1,0,0)',
          );
          const allHighlightedFalse = Object.values(watchedHighlightedAttr).every((v) => v === 'false');
          recordEvent('raf_sample', {
            eventSource: 'gate.rafAttach',
            eventReason: 'post-attach',
            rafSampleCount: rafSampleCountRef.current,
            rafSampleAt: Date.now(),
            rafWatchedTransforms: watchedTransforms,
            rafWatchedHighlightedAttr: watchedHighlightedAttr,
            rafAllTransformsIdentity: allIdentity,
            rafAllHighlightedFalse: allHighlightedFalse,
            rafResolverFired: remaining.size === 0,
            rafResolverReason: remaining.size === 0 ? 'all-identity-or-missing' : null,
            watchedCardIds: finalComboIds,
            watchedDomNodeCount: nodes.length,
            missingWatchedCardIds: missing,
          });
          finalLowerCleanupRef.current = () => {
            for (const { el, handler } of nodes) el.removeEventListener('transitionend', handler);
            if (finalLowerTimersRef.current.deadman) {
              clearTimeout(finalLowerTimersRef.current.deadman);
              finalLowerTimersRef.current.deadman = null;
            }
          };
          if (remaining.size === 0) {
            finalizeTotal(missing.length === finalComboIds.length ? 'node-missing-skip' : 'raf-dom-identity');
            return;
          }
          const deadmanStartedAt = Date.now();
          finalLowerTimersRef.current.deadman = setTimeout(() => {
            finalLowerTimersRef.current.deadman = null;
            recordEvent('deadman_fired', {
              eventSource: 'gate.deadman',
              eventReason: 'deadman-500ms',
              deadmanActive: false,
              deadmanStartedAt,
              deadmanFiredAt: Date.now(),
              watchedCardIds: finalComboIds,
              transitionEndReceivedCardIds: [...transitionEndReceivedRef.current.cardIds],
            });
            finalizeTotal('deadman');
          }, 500);
        });
        finalLowerTimersRef.current.raf = raf;
      }

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

    // LIFECYCLE CONTRACT (announcement):
    // The total (or trailing zero) announcement belongs to the target that
    // just finished counting. Clear it BEFORE the exit animation begins so
    // it cannot outlive the current owner's scoring beat or bleed into the
    // next owner's entering/scoring phase.
    announcementHiddenAtRef.current = Date.now();
    announcementClearRequestedAtRef.current = announcementHiddenAtRef.current;
    announcementClearSourceRef.current = 'startExitTransition';
    recordEvent('combo_announce_clear', {
      eventSource: 'startExitTransition',
      eventReason: 'cleared-at-exit-start',
      announcementClearRequestedAt: announcementHiddenAtRef.current,
      announcementClearSource: 'startExitTransition',
    });
    setAnnouncementData(null);
    onAnnouncementChange?.(null, null, undefined);
    recordTruth('exit_start', {
      announcementText: null,
      announcementVisible: false,
      announcementMounted: false,
      announcementHiddenAt: announcementHiddenAtRef.current,
      announcementClearReason: 'cleared-at-exit-start',
      contradictions: makeEmptyContradictions(),
    });

    // Save current cards for exit animation
    setExitingCards([...currentTarget.hand]);
    setTransitionPhase('exiting');
    
    
    // After exit animation, move to next target
    if (exitTransitionTimerRef.current) clearTimeout(exitTransitionTimerRef.current);
    exitTransitionTimerRef.current = setTimeout(() => {
      if (winFrozenRef.current) return;

      if (currentTargetIndex < countingTargets.length - 1) {
        const nextTarget = currentTargetIndex + 1;
        // LIFECYCLE CONTRACT: clear any prior-owner announcement BEFORE the
        // next scoring target/owner becomes visually active. This prevents
        // the previous owner's total (or lingering combo) announcement from
        // bleeding into the next owner's scoring beat.
        announcementHiddenAtRef.current = Date.now();
        announcementClearRequestedAtRef.current = announcementHiddenAtRef.current;
        announcementClearSourceRef.current = 'target_advance_timer';
        recordEvent('combo_announce_clear', {
          eventSource: 'target_advance_timer',
          eventReason: 'cleared-before-advance',
          announcementClearRequestedAt: announcementHiddenAtRef.current,
          announcementClearSource: 'target_advance_timer',
        });
        setAnnouncementData(null);
        onAnnouncementChange?.(null, null, undefined);
        recordTruth('target_advance', {
          comboTransitionReason: `advance:${currentTargetIndex}->${nextTarget}`,
          announcementText: null,
          announcementVisible: false,
          announcementMounted: false,
          announcementHiddenAt: announcementHiddenAtRef.current,
          announcementClearReason: 'cleared-before-advance',
          contradictions: makeEmptyContradictions(),
        });
        setCurrentTargetIndex(nextTarget);
        setCurrentComboIndex(-1);
        // Persist progress: advanced to next target
        onProgressUpdate?.(nextTarget, -1);
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
          announcementHiddenAtRef.current = Date.now();
          setAnnouncementData(null);
          setExitingCards([]);
          recordTruth('completion', {
            announcementVisible: false,
            announcementMounted: false,
            announcementHiddenAt: announcementHiddenAtRef.current,
            announcementClearReason: 'counting-complete',
          });

          
          if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
          completeTimerRef.current = setTimeout(() => {
            if (winFrozenRef.current) return;
            onCountingComplete(false); // No win detected during counting
          }, 1000); // Shorter delay since no announcement to read
        }
      }
    }, EXIT_ANIMATION_MS);
  }, [currentTarget, currentTargetIndex, countingTargets.length, onCountingComplete, winFrozen]);

  // ── Announcement propagation is SINGLE-WRITER ──────────────────
  //
  // Parent `onAnnouncementChange` is written exclusively by:
  //   1. `publishAnnouncement(...)` — non-null publish, same synchronous
  //      call stack as `setHighlightedCards(...)` at the combo entry site.
  //   2. Explicit clear sites paired with `setHighlightedCards([])`:
  //        - `startExitTransition` (line ~1153)
  //        - `target_advance_timer` inside the exit timer (line ~1189)
  //        - `winFrozen` effect (line ~375)
  //        - unmount/cleanup (line ~1300 area)
  //
  // The previous reactive propagation effect that re-derived and re-emitted
  // to the parent based on `[announcementData, currentTargetIndex,
  // transitionPhase]` was REMOVED here — it was a second writer that could
  // observe intermediate child state across separate commits and push a
  // stale/null announcement to the parent one commit after the highlighted-
  // cards commit, causing the "announcement one tick behind combo" symptom.
  //
  // This effect is now INSTRUMENTATION-ONLY: it records to the Counting
  // Truth ledger whenever `announcementData` mutates so we can prove that
  // no post-commit re-derivation is writing parent state. It performs NO
  // calls to `onAnnouncementChange`.
  useEffect(() => {
    countingTruthLedger.record({
      source: 'combo_announce_publish',
      ...truthSnapshotRef.current,
      eventSource: 'announcementData-effect',
      eventReason: 'passive-instrumentation-only',
      announcementDataText: announcementData?.text ?? null,
      announcementDataCategory: announcementData?.category ?? null,
      announcementDataKey: announcementData?.key ?? null,
      announcementDataTargetIndex: announcementData?.targetIndex ?? null,
      announcementDataComboIndex: announcementData?.comboIndex ?? null,
      contradictions: makeEmptyContradictions(),
    });
  }, [announcementData]);

  // ── Instrumentation: track prev highlightedCards ids ────────
  useEffect(() => {
    prevHighlightedCardIdsRef.current = highlightedCards.map(
      (c) => `${c.rank}${c.suit?.[0] ?? '?'}`,
    );
  }, [highlightedCards]);

  // ── Instrumentation: log announcement actual unmount timestamp ──
  const prevAnnouncementRef = useRef<typeof announcementData>(null);
  useEffect(() => {
    const prev = prevAnnouncementRef.current;
    if (prev != null && announcementData == null) {
      recordEvent('combo_announce_clear', {
        eventSource: 'announcementData-effect',
        eventReason: 'actually-unmounted',
        announcementActuallyUnmountedAt: Date.now(),
        announcementVisibleAfterClearRequest: false,
      });
    }
    prevAnnouncementRef.current = announcementData;
  }, [announcementData, recordEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (enterToScoringTimerRef.current) clearTimeout(enterToScoringTimerRef.current);
      if (exitTransitionTimerRef.current) clearTimeout(exitTransitionTimerRef.current);
      if (enterTransitionTimerRef.current) clearTimeout(enterTransitionTimerRef.current);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      if (finalLowerTimersRef.current.deadman) clearTimeout(finalLowerTimersRef.current.deadman);
      if (finalLowerTimersRef.current.raf != null) cancelAnimationFrame(finalLowerTimersRef.current.raf);
      if (finalLowerCleanupRef.current) finalLowerCleanupRef.current();
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
          <div className="flex items-end">
            {/* Player's 4 cards - these animate in/out */}
            <div 
              className={getCardContainerClasses()}
              style={{ transformOrigin: 'center center' }}
            >
              <div className="flex items-end">
                {cardsToShow.map((card, i) => {
                  const highlighted = isCardHighlighted(card) && transitionPhase === 'scoring';
                  const comboIds = new Set(
                    (currentComboIndex >= 0 && currentComboIndex < currentCombos.length
                      ? currentCombos[currentComboIndex].cards
                      : []
                    ).map((c) => `${c.rank}${c.suit?.[0] ?? '?'}`),
                  );
                  const cardId = `${card.rank}${card.suit?.[0] ?? '?'}`;
                  const ownerId = currentTarget?.playerId ?? '';
                  const role: 'crib' | 'dealer' | 'opponent' =
                    currentTarget?.type === 'crib'
                      ? 'crib'
                      : ownerId === cribbageState.dealerPlayerId
                        ? 'dealer'
                        : 'opponent';
                  return (
                    <div
                      key={`${card.rank}-${card.suit}-${i}-${currentTargetIndex}`}
                      ref={i === 0 ? firstCardRef : undefined}
                      data-cribbage-scoring-card="true"
                      data-card-id={cardId}
                      data-card-rank={card.rank}
                      data-card-suit={card.suit}
                      data-card-owner={ownerId}
                      data-card-role={role}
                      data-card-highlighted={highlighted ? 'true' : 'false'}
                      data-card-dimmed="false"
                      data-scoring-owner-match="true"
                      data-combo-member={comboIds.has(cardId) ? 'true' : 'false'}
                      className={`transition-all duration-300 ${
                        highlighted
                          ? 'transform -translate-y-2 ring-2 ring-poker-gold rounded-md shadow-lg shadow-poker-gold/50'
                          : ''
                      }`}
                      style={{ marginLeft: i === 0 ? 0 : `${scoringHandMarginPx}px` }}
                    >
                      <CribbagePlayingCard card={card} size="md" />
                    </div>
                  );
                })}

              </div>
            </div>
            
            {/* Cut card with label - stays in place during scoring, hidden when complete */}
            {cribbageState.cutCard && !isComplete && (
              <div
                className="flex flex-col items-center"
                style={{ marginLeft: `${scoringHandToCutGapPx}px` }}
              >
                <span className="text-[8px] text-white/60 mb-0.5">Cut</span>
                <div
                  data-cribbage-scoring-card="true"
                  data-card-id={`${cribbageState.cutCard.rank}${cribbageState.cutCard.suit?.[0] ?? '?'}`}
                  data-card-rank={cribbageState.cutCard.rank}
                  data-card-suit={cribbageState.cutCard.suit}
                  data-card-owner=""
                  data-card-role="cut"
                  data-card-highlighted={isCardHighlighted(cribbageState.cutCard) && transitionPhase === 'scoring' ? 'true' : 'false'}
                  data-card-dimmed="false"
                  data-scoring-owner-match="true"
                  data-combo-member={
                    currentComboIndex >= 0 && currentComboIndex < currentCombos.length
                      && currentCombos[currentComboIndex].cards.some(
                        (c) => c.rank === cribbageState.cutCard?.rank && c.suit === cribbageState.cutCard?.suit,
                      )
                      ? 'true'
                      : 'false'
                  }
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
      {/* CribbageCountingTruthPill mounted at CribbageMobileGameTable */}
    </>

  );
};
