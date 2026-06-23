import { useMemo, useRef, useEffect, useLayoutEffect, useState } from "react";
import {
  useLifecycleMount,
  recordLifecycleEvent,
} from "@/lib/canonicalShell/lifecycleDebug";
import { useDealRuntime } from "@/lib/canonicalShell/cardTransport/DealRuntime";
import { getCanonicalTimerEligibility } from "@/lib/canonicalShell/timerEligibility";
import {
  recordThreeFiveSevenTimerOwner,
  unregisterThreeFiveSevenTimerOwner,
} from "@/lib/canonicalShell/cardTransport/threeFiveSevenForensicsStore";
import { record357DiagnosticViolation } from "@/lib/canonicalShell/cardTransport/threeFiveSevenPresentationForensics";
import {
  registerHolmTimerOwner,
  updateHolmTimerOwner,
  unregisterHolmTimerOwner,
  beginHolmTimerSegment,
  recordHolmTimerSample,
  endHolmTimerSegment,
  recordHolmTimerWrite,
} from "@/lib/canonicalShell/cardTransport/holmSelfTimerForensics";

// Monotonically increasing instance counter so we can distinguish a
// fresh mount (new id) from a re-render of the same mount (same id).
// Confirms or refutes the "MobilePlayerTimer remounts on every turn
// transition" hypothesis driving the stale-seed flash.
let __mptInstanceSeq = 0;

interface MobilePlayerTimerProps {
  timeLeft: number | null;
  maxTime: number;
  isActive: boolean;
  size?: number;
  /**
   * Canonical timer activation key. STABLE for the entire lifetime of
   * one uninterrupted turn segment. Changes ONLY when canonical turn
   * identity changes (new turn / new actor / new hand) or when an
   * explicit pause-resume generation increments. When provided, the
   * activation edge fires exactly once per distinct key — no rerenders,
   * prop ticks, rAFs, or clock motion may refire it. Same key forbids
   * rewriting deadline/duration/activation sequence. Null/undefined
   * key falls back to legacy wasActiveRef behavior for non-Holm
   * callers that have not been wired through ActivePlayerHUD yet.
   */
  activationKey?: string | null;
  children: React.ReactNode;
}

export const MobilePlayerTimer = ({
  timeLeft,
  maxTime,
  isActive,
  size = 48,
  activationKey,
  children
}: MobilePlayerTimerProps) => {

  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const deal = useDealRuntime();
  const eligibility = deal
    ? getCanonicalTimerEligibility({
        gameType: deal.gameType,
        dealPhase: deal.phase,
        dealSettled: deal.dealSettled,
        readyReleased: deal.readyReleased,
        activePlayerId: isActive ? 'MobilePlayerTimer' : null,
      })
    : { visible: isActive, running: isActive && timeLeft !== null && timeLeft > 0 };
  const effectiveIsActive = eligibility.visible && isActive;
  const effectiveTimeLeft = eligibility.running ? timeLeft : null;
  const blocked357TimerAttempt = !!deal && !deal.timerAllowed && !!isActive && timeLeft !== null && timeLeft > 0;

  // ── DIAGNOSTIC: timer remount audit ─────────────────────────────
  const instanceIdRef = useRef<number>(0);
  if (instanceIdRef.current === 0) {
    __mptInstanceSeq += 1;
    instanceIdRef.current = __mptInstanceSeq;
  }
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  useLifecycleMount('MobilePlayerTimer', {
    id: instanceIdRef.current,
    initialTimeLeft: timeLeft,
    initialMaxTime: maxTime,
    initialIsActive: isActive,
  });

  // Track activation identity to suppress transition on first active frame.
  const wasActiveRef = useRef(false);
  const [suppressTransition, setSuppressTransition] = useState(true);

  // Canonical timer invariant:
  //   For a given (non-paused) active-turn segment, capture an immutable
  //   deadline + duration EXACTLY ONCE at activation. All subsequent
  //   progress is derived purely from (deadline − now)/duration. No
  //   render, effect, rAF, prop tick, or timeLeft update may rebase
  //   the deadline. Pause→resume is a new segment (wasActive flips
  //   false→true) and may intentionally re-capture.
  const segmentDeadlineMsRef = useRef<number | null>(null);
  const segmentDurationMsRef = useRef<number | null>(null);
  const activationSeqRef = useRef(0);
  const [nowTickMs, setNowTickMs] = useState(() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  // Detect activation edge during render so the very first paint of a
  // new active segment is already snapped to full. Capture the
  // immutable segment deadline ONCE here.
  //
  // KEY-DRIVEN ACTIVATION (canonical):
  //   When the parent supplies a stable `activationKey`, the activation
  //   edge fires exactly once per distinct key. This eliminates the
  //   prior wasActiveRef-derived predicate which re-fired every render
  //   for a single active segment (the proven upward-refill defect).
  //
  //   Same key → NO writes to segmentDeadlineMsRef, segmentDurationMsRef,
  //   activationSeqRef, suppressTransition, or wasActiveRef. Hard
  //   forensic violation if the activation branch is ever entered twice
  //   for one key.
  //
  //   Null/absent key → legacy fallback (wasActiveRef edge) for callers
  //   not yet threading a canonical key.
  const isHolmRender = deal?.gameType === 'holm-game';
  const activeSegmentIdRef = useRef<string | null>(null);
  const lastActivationKeyRef = useRef<string | null>(null);
  const usingKeyMode = activationKey != null;
  const effectiveActivationKey = effectiveIsActive ? (activationKey ?? null) : null;

  const runActivationCapture = (writerLabel: string, callsiteLine: string, segmentKey: string | null) => {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const durationMs = Math.max(1, (maxTime || 0) * 1000);
    const seedSecs = effectiveTimeLeft != null && effectiveTimeLeft > 0
      ? Math.min(effectiveTimeLeft, maxTime || effectiveTimeLeft)
      : (maxTime || 0);
    const priorDeadline = segmentDeadlineMsRef.current;
    const priorDuration = segmentDurationMsRef.current;
    const priorSeq = activationSeqRef.current;
    segmentDurationMsRef.current = durationMs;
    segmentDeadlineMsRef.current = nowMs + seedSecs * 1000;
    activationSeqRef.current += 1;
    const newSegId = segmentKey ?? `inst${instanceIdRef.current}#seg${activationSeqRef.current}@${deal?.handContextId ?? 'nohand'}`;
    activeSegmentIdRef.current = newSegId;
    if (isHolmRender) {
      recordHolmTimerWrite({ field: 'segmentDurationMsRef', prior: priorDuration, next: durationMs, writer: writerLabel, callsite: callsiteLine, reason: 'capture immutable duration at activation', kind: 'activation', segmentId: newSegId, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
      recordHolmTimerWrite({ field: 'segmentDeadlineMsRef', prior: priorDeadline, next: segmentDeadlineMsRef.current, writer: writerLabel, callsite: callsiteLine, reason: 'capture immutable deadline at activation', kind: 'activation', segmentId: newSegId, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
      recordHolmTimerWrite({ field: 'activationSeqRef', prior: priorSeq, next: activationSeqRef.current, writer: writerLabel, callsite: callsiteLine, reason: 'activation increment', kind: 'activation', segmentId: newSegId, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
    }
  };

  if (usingKeyMode) {
    // KEY-DRIVEN mode (canonical Holm path via ActivePlayerHUD).
    if (effectiveActivationKey && effectiveActivationKey !== lastActivationKeyRef.current) {
      const priorKey = lastActivationKeyRef.current;
      lastActivationKeyRef.current = effectiveActivationKey;
      runActivationCapture('MobilePlayerTimer.activationEdge[keyed]', 'src/components/MobilePlayerTimer.tsx:keyed', effectiveActivationKey);
      if (isHolmRender) {
        recordHolmTimerWrite({ field: 'activationKey', prior: priorKey, next: effectiveActivationKey, writer: 'MobilePlayerTimer.activationEdge[keyed]', callsite: 'src/components/MobilePlayerTimer.tsx:keyed', reason: 'canonical key transition (new segment)', kind: 'activation', segmentId: effectiveActivationKey, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
      }
    } else if (!effectiveActivationKey) {
      // Inactive — clear refs and key.
      const priorDeadline = segmentDeadlineMsRef.current;
      const priorDuration = segmentDurationMsRef.current;
      const closingSeg = activeSegmentIdRef.current;
      const priorKey = lastActivationKeyRef.current;
      segmentDeadlineMsRef.current = null;
      segmentDurationMsRef.current = null;
      if (isHolmRender && closingSeg && (priorDeadline != null || priorDuration != null)) {
        recordHolmTimerWrite({ field: 'segmentDeadlineMsRef', prior: priorDeadline, next: null, writer: 'MobilePlayerTimer.deactivation[keyed]', callsite: 'src/components/MobilePlayerTimer.tsx:keyed', reason: 'effectiveActivationKey=null → clear', kind: 'render-derivation', segmentId: closingSeg, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
        recordHolmTimerWrite({ field: 'segmentDurationMsRef', prior: priorDuration, next: null, writer: 'MobilePlayerTimer.deactivation[keyed]', callsite: 'src/components/MobilePlayerTimer.tsx:keyed', reason: 'effectiveActivationKey=null → clear', kind: 'render-derivation', segmentId: closingSeg, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
        if (priorKey) {
          recordHolmTimerWrite({ field: 'activationKey', prior: priorKey, next: null, writer: 'MobilePlayerTimer.deactivation[keyed]', callsite: 'src/components/MobilePlayerTimer.tsx:keyed', reason: 'canonical key cleared', kind: 'render-derivation', segmentId: closingSeg, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
        }
      }
      activeSegmentIdRef.current = null;
      lastActivationKeyRef.current = null;
    }
    // SAME-KEY active path: intentionally no-op. No deadline rewrite,
    // no activation seq increment, no transition toggle.
  } else {
    // Legacy wasActiveRef fallback (non-keyed callers).
    if (effectiveIsActive && !wasActiveRef.current) {
      runActivationCapture('MobilePlayerTimer.activationEdge[legacy]', 'src/components/MobilePlayerTimer.tsx:legacy', null);
    } else if (!effectiveIsActive) {
      const priorDeadline = segmentDeadlineMsRef.current;
      const priorDuration = segmentDurationMsRef.current;
      const closingSeg = activeSegmentIdRef.current;
      segmentDeadlineMsRef.current = null;
      segmentDurationMsRef.current = null;
      if (isHolmRender && closingSeg && (priorDeadline != null || priorDuration != null)) {
        recordHolmTimerWrite({ field: 'segmentDeadlineMsRef', prior: priorDeadline, next: null, writer: 'MobilePlayerTimer.deactivation[legacy]', callsite: 'src/components/MobilePlayerTimer.tsx:legacy', reason: 'effectiveIsActive=false → clear', kind: 'render-derivation', segmentId: closingSeg, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
        recordHolmTimerWrite({ field: 'segmentDurationMsRef', prior: priorDuration, next: null, writer: 'MobilePlayerTimer.deactivation[legacy]', callsite: 'src/components/MobilePlayerTimer.tsx:legacy', reason: 'effectiveIsActive=false → clear', kind: 'render-derivation', segmentId: closingSeg, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
      }
      activeSegmentIdRef.current = null;
    }
  }

  // Record every prop change while a segment is active. These are the
  // raw external inputs; any deadline mutation must originate from a
  // prop change or an internal write — this gives the writer trail.
  const lastPropsRef = useRef<{ timeLeft: number | null; maxTime: number; isActive: boolean }>({ timeLeft, maxTime, isActive });
  if (isHolmRender && activeSegmentIdRef.current) {
    const prev = lastPropsRef.current;
    if (prev.timeLeft !== timeLeft) {
      recordHolmTimerWrite({ field: 'timeLeftProp', prior: prev.timeLeft, next: timeLeft, writer: 'MobilePlayerTimer.props', callsite: 'src/components/MobilePlayerTimer.tsx:props', reason: 'incoming timeLeft prop tick', kind: 'prop-update', segmentId: activeSegmentIdRef.current, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
    }
    if (prev.maxTime !== maxTime) {
      recordHolmTimerWrite({ field: 'maxTimeProp', prior: prev.maxTime, next: maxTime, writer: 'MobilePlayerTimer.props', callsite: 'src/components/MobilePlayerTimer.tsx:props', reason: 'incoming maxTime prop change', kind: 'prop-update', segmentId: activeSegmentIdRef.current, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
    }
    if (prev.isActive !== isActive) {
      recordHolmTimerWrite({ field: 'isActiveProp', prior: prev.isActive, next: isActive, writer: 'MobilePlayerTimer.props', callsite: 'src/components/MobilePlayerTimer.tsx:props', reason: 'incoming isActive prop change', kind: 'prop-update', segmentId: activeSegmentIdRef.current, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
    }
  }
  lastPropsRef.current = { timeLeft, maxTime, isActive };




  // Pre-paint suppression: fire ONCE per activation seq increment.
  // Drives the two-rAF snap-to-full + transition re-enable. Gated on
  // activationSeqRef change (not the wasActiveRef edge) so it cooperates
  // with keyed mode where wasActiveRef is no longer the source of truth.
  const lastSuppressActivationSeqRef = useRef(0);
  useEffect(() => {
    if (!effectiveIsActive) {
      wasActiveRef.current = false;
      return;
    }
    if (lastSuppressActivationSeqRef.current === activationSeqRef.current) {
      // Same activation segment; do not re-arm suppression. This is the
      // primary fix for the upward-refill defect: prior code re-fired
      // this effect on every render of an active turn.
      return;
    }
    lastSuppressActivationSeqRef.current = activationSeqRef.current;
    wasActiveRef.current = true;
    const segId = activeSegmentIdRef.current;
    if (isHolmRender) {
      recordHolmTimerWrite({ field: 'suppressTransition', prior: suppressTransition, next: true, writer: 'MobilePlayerTimer.activateEffect.suppress', callsite: 'src/components/MobilePlayerTimer.tsx:suppress', reason: 'pre-paint suppression on activation seq increment', kind: 'effect', segmentId: segId, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
    }
    setSuppressTransition(true);
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        if (isHolmRender) {
          recordHolmTimerWrite({ field: 'suppressTransition', prior: true, next: false, writer: 'MobilePlayerTimer.activateEffect.rAF2', callsite: 'src/components/MobilePlayerTimer.tsx:rAF2', reason: 'two-rAF transition re-enable', kind: 'raf', segmentId: segId, instanceId: instanceIdRef.current, commitId: activationSeqRef.current });
        }
        setSuppressTransition(false);
      });
      (setSuppressTransition as unknown as { __r2?: number }).__r2 = r2;
    });
    recordLifecycleEvent('timer.activate', {
      component: 'MobilePlayerTimer',
      instance_id: instanceIdRef.current,
      time_left_seed: effectiveTimeLeft,
      max_time: maxTime,
      timer_seed_source: effectiveTimeLeft === null ? 'null-seed' : 'prop-seed',
      snapped_full: true,
      segment_deadline_ms: segmentDeadlineMsRef.current,
      segment_duration_ms: segmentDurationMsRef.current,
      activation_key: lastActivationKeyRef.current,
    });
    return () => cancelAnimationFrame(r1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIsActive, activationSeqRef.current]);


  // Drive descent purely from clock vs fixed deadline. 100ms tick — no
  // dependency on incoming prop ticks, so deadline can never rebase.
  useEffect(() => {
    if (!effectiveIsActive) return;
    const id = window.setInterval(() => {
      setNowTickMs(typeof performance !== 'undefined' ? performance.now() : Date.now());
    }, 100);
    return () => window.clearInterval(id);
  }, [effectiveIsActive, activationSeqRef.current]);

  const progress = useMemo(() => {
    if (!effectiveIsActive) return 0;
    const deadline = segmentDeadlineMsRef.current;
    const duration = segmentDurationMsRef.current;
    if (deadline == null || duration == null || duration <= 0) return 1;
    // Activation edge: ref not yet committed → force full.
    if (!wasActiveRef.current) return 1;
    const remaining = deadline - nowTickMs;
    return Math.max(0, Math.min(1, remaining / duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIsActive, nowTickMs, activationSeqRef.current]);

  
  const strokeDashoffset = circumference * (1 - progress);
  
  // Determine urgency levels
  const isUrgent = effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft <= 3;
  const isWarning = effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft <= 5 && effectiveTimeLeft > 3;
  const isNormal = effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft > 5;
  
  // Color based on time remaining
  const getStrokeColor = () => {
    if (!effectiveIsActive || effectiveTimeLeft === null) return 'hsl(var(--muted))';
    if (progress > 0.5) return 'hsl(142, 76%, 36%)'; // Green
    if (progress > 0.25) return 'hsl(45, 93%, 47%)'; // Yellow/Gold
    return 'hsl(0, 84%, 60%)'; // Red
  };
  
  // Get glow color for the outer ring
  const getGlowStyle = () => {
    if (isUrgent) {
      return {
        borderColor: 'hsl(0, 84%, 60%)',
        boxShadow: '0 0 16px hsl(0, 84%, 60%), 0 0 32px hsl(0, 84%, 50% / 0.5), inset 0 0 8px hsl(0, 84%, 60% / 0.3)'
      };
    }
    if (isWarning) {
      return {
        borderColor: 'hsl(45, 93%, 47%)',
        boxShadow: '0 0 12px hsl(45, 93%, 47%), 0 0 24px hsl(45, 93%, 47% / 0.4)'
      };
    }
    if (isNormal) {
      return {
        borderColor: 'hsl(142, 76%, 36%)',
        boxShadow: '0 0 10px hsl(142, 76%, 36%), 0 0 20px hsl(142, 76%, 36% / 0.4)'
      };
    }
    return {};
  };

  const timerOwnerId = `MobilePlayerTimer:${instanceIdRef.current}`;
  useEffect(() => {
    recordThreeFiveSevenTimerOwner(timerOwnerId, {
      componentName: 'MobilePlayerTimer',
      gameType: deal?.gameType ?? null,
      handContextId: deal?.handContextId ?? null,
      waveContextId: deal?.handContextId ?? null,
      dealRuntimeId: deal?.handContextId?.replace(/#r\d+$/, '') ?? null,
      phase: deal?.phase ?? 'NO_RUNTIME',
      visible: !!effectiveIsActive,
      running: !!effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft > 0,
      timeLeft: effectiveTimeLeft,
      usesDealRuntime: !!deal,
      suppressedLegacySource: deal?.phase === 'DEALING' && isActive ? 'MobilePlayerTimer props' : null,
      attemptedRunning: !!isActive && timeLeft !== null && timeLeft > 0,
      reactKey: `MobilePlayerTimer:${instanceIdRef.current}`,
      renderCount: renderCountRef.current,
    });
  }, [timerOwnerId, deal?.handContextId, deal?.phase, deal?.dealSettled, deal?.readyReleased, effectiveIsActive, effectiveTimeLeft, isActive, timeLeft]);
  useEffect(() => () => unregisterThreeFiveSevenTimerOwner(timerOwnerId), [timerOwnerId]);

  useEffect(() => {
    if (!blocked357TimerAttempt || !deal) return;
    record357DiagnosticViolation('357_TIMER_TICK_DURING_DEAL_BLOCKED', {
      component: 'MobilePlayerTimer',
      attemptedTimeLeft: timeLeft,
      dealPhase: deal.phase,
      dealSettled: deal.dealSettled,
      readyReleased: deal.readyReleased,
    }, {
      handContextId: deal.handContextId,
      phase: deal.phase,
      component: 'PLAYER_HAND',
    });
  }, [blocked357TimerAttempt, deal, deal?.handContextId, deal?.phase, deal?.dealSettled, deal?.readyReleased, timeLeft]);

  // ─── HOLM SELF-TIMER FORENSICS ─────────────────────────────────
  // Pure instrumentation. No behavior changes. Gated to Holm only.
  const isHolm = deal?.gameType === 'holm-game';
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const holmOwnerRegisteredRef = useRef(false);
  const holmLastSegmentIdRef = useRef<string | null>(null);
  const holmLastActiveRef = useRef(false);
  const holmRenderCountRef = useRef(0);
  holmRenderCountRef.current += 1;

  useEffect(() => {
    if (!isHolm) return;
    if (!holmOwnerRegisteredRef.current) {
      holmOwnerRegisteredRef.current = true;
      registerHolmTimerOwner({
        instanceId: instanceIdRef.current,
        componentName: 'MobilePlayerTimer',
        callsite: 'src/components/MobilePlayerTimer.tsx',
        gameType: deal?.gameType ?? null,
        handContextId: deal?.handContextId ?? null,
        selfPlayerId: null,
        activePlayerId: null,
        seatPosition: null,
        mounted: true,
        mountedAt: performance.now(),
        unmountedAt: null,
        lastSegmentId: null,
        renderCount: 0,
      });
    }
    updateHolmTimerOwner(instanceIdRef.current, {
      handContextId: deal?.handContextId ?? null,
      renderCount: holmRenderCountRef.current,
    });
    return () => {
      if (holmOwnerRegisteredRef.current) {
        unregisterHolmTimerOwner(instanceIdRef.current);
        holmOwnerRegisteredRef.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHolm]);

  // Capture every prepaint commit; emit on activation edge.
  useLayoutEffect(() => {
    if (!isHolm) return;
    const wasActive = holmLastActiveRef.current;
    const activated = effectiveIsActive && !wasActive;
    const deactivated = !effectiveIsActive && wasActive;
    holmLastActiveRef.current = effectiveIsActive;

    if (activated) {
      const segmentId = `inst${instanceIdRef.current}#seg${activationSeqRef.current}@${deal?.handContextId ?? 'nohand'}`;
      const prevSegmentId = holmLastSegmentIdRef.current;
      holmLastSegmentIdRef.current = segmentId;

      // Read SVG ground-truth pre-paint.
      let dashoffset: number | null = null;
      let circ: number | null = null;
      let className: string | null = null;
      let cssTransition: string | null = null;
      try {
        const svgCircle = wrapperRef.current?.querySelector<SVGCircleElement>('svg circle:nth-of-type(2)');
        if (svgCircle) {
          const off = svgCircle.getAttribute('stroke-dashoffset');
          const da = svgCircle.getAttribute('stroke-dasharray');
          dashoffset = off != null ? Number(off) : null;
          circ = da != null ? Number(da) : null;
          className = svgCircle.getAttribute('class');
          const cs = typeof window !== 'undefined' ? window.getComputedStyle(svgCircle) : null;
          cssTransition = cs
            ? `prop=${cs.transitionProperty} dur=${cs.transitionDuration} delay=${cs.transitionDelay} fn=${cs.transitionTimingFunction}`
            : null;
        }
      } catch { /* noop */ }

      // pause/resume heuristic: same handContextId as previous segment ⇒ refill.
      const sameHandAsPrev = !!prevSegmentId && prevSegmentId.endsWith(`@${deal?.handContextId ?? 'nohand'}`);

      beginHolmTimerSegment({
        instanceId: instanceIdRef.current,
        segmentId,
        handContextId: deal?.handContextId ?? null,
        selfPlayerId: null,
        activePlayerId: null,
        duration: maxTime,
        deadline: effectiveTimeLeft != null ? performance.now() + effectiveTimeLeft * 1000 : null,
        paused: false,
        authoritativeSource: 'MobilePlayerTimer props (timeLeft,maxTime,isActive)',
        preCommitProgress: 1,
        classNameFirstCommit: className,
        cssTransition,
        domSvgDashoffset: dashoffset,
        domSvgCircumference: circ,
        prevSegmentId,
        isPauseResume: sameHandAsPrev,
      });
    } else if (deactivated) {
      endHolmTimerSegment(instanceIdRef.current, holmLastSegmentIdRef.current, 'effectiveIsActive→false');
    }
  });

  // rAF1 / rAF2 / 250ms sampling on activation. Plus continuous tick.
  useEffect(() => {
    if (!isHolm || !effectiveIsActive) return;
    const segmentId = holmLastSegmentIdRef.current;
    if (!segmentId) return;
    let raf1 = 0;
    let raf2 = 0;
    let t250 = 0;
    let tick = 0;

    const readDom = () => {
      let dashoffset: number | null = null;
      let circ: number | null = null;
      let className: string | null = null;
      let cssTransition: string | null = null;
      try {
        const svgCircle = wrapperRef.current?.querySelector<SVGCircleElement>('svg circle:nth-of-type(2)');
        if (svgCircle) {
          const off = svgCircle.getAttribute('stroke-dashoffset');
          const da = svgCircle.getAttribute('stroke-dasharray');
          dashoffset = off != null ? Number(off) : null;
          circ = da != null ? Number(da) : null;
          className = svgCircle.getAttribute('class');
          const cs = typeof window !== 'undefined' ? window.getComputedStyle(svgCircle) : null;
          cssTransition = cs
            ? `prop=${cs.transitionProperty} dur=${cs.transitionDuration} delay=${cs.transitionDelay} fn=${cs.transitionTimingFunction}`
            : null;
        }
      } catch { /* noop */ }
      let visibleOwnerCount = 0;
      try {
        const all = document.querySelectorAll<HTMLElement>('[data-mobile-player-timer][data-forensics-timer-running="1"]');
        for (const el of Array.from(all)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) visibleOwnerCount++;
        }
      } catch { /* noop */ }
      return { dashoffset, circ, className, cssTransition, visibleOwnerCount };
    };

    const sample = (stage: 'FIRST_RAF' | 'SECOND_RAF' | '250MS' | 'TICK') => {
      const dom = readDom();
      recordHolmTimerSample({
        instanceId: instanceIdRef.current,
        segmentId,
        stage,
        logicalProgress: (() => {
          const d = segmentDeadlineMsRef.current; const dur = segmentDurationMsRef.current;
          if (d == null || dur == null || dur <= 0) return 1;
          return Math.max(0, Math.min(1, (d - (typeof performance !== 'undefined' ? performance.now() : Date.now())) / dur));
        })(),
        timeLeft: effectiveTimeLeft,
        deadline: segmentDeadlineMsRef.current,
        domSvgDashoffset: dom.dashoffset,
        domSvgCircumference: dom.circ,
        className: dom.className,
        cssTransition: dom.cssTransition,
        visibleOwnerCount: dom.visibleOwnerCount,
      });
    };

    raf1 = window.requestAnimationFrame(() => {
      sample('FIRST_RAF');
      raf2 = window.requestAnimationFrame(() => sample('SECOND_RAF'));
    });
    t250 = window.setTimeout(() => sample('250MS'), 250);
    tick = window.setInterval(() => sample('TICK'), 100);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(t250);
      window.clearInterval(tick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHolm, effectiveIsActive, activationSeqRef.current]);
  // ─── END HOLM SELF-TIMER FORENSICS ─────────────────────────────

  if (blocked357TimerAttempt || (!!deal && !deal.timerAllowed)) {
    return <>{children}</>;
  }

  // Ring is mounted as an absolute overlay concentric with the
  // children box. The children (chip disc) define the cell's natural
  // size — the ring's center inherits the children's geometric center
  // exactly via left-1/2 / top-1/2 / -translate-1/2. The ring may
  // extend beyond the disc via its explicit `ringOuter` dimension; its
  // center is mathematically identical to the disc center at every
  // responsive size.
  const ringOuter = size + 8;

  return (
    <div
      ref={wrapperRef}
      data-mobile-player-timer=""
      data-forensics-component="MobilePlayerTimer"
      data-forensics-timer-owner-id={timerOwnerId}
      data-forensics-timer-phase={deal?.phase ?? 'NO_RUNTIME'}
      data-forensics-timer-running={effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft > 0 ? '1' : '0'}
      data-forensics-timer-time-left={effectiveTimeLeft === null ? '' : String(effectiveTimeLeft)}
      data-forensics-instance={instanceIdRef.current}
      className="relative inline-flex items-center justify-center"
    >
      {/* Content defines the cell's natural geometric center. */}
      <div className="relative z-10 inline-flex items-center justify-center">
        {children}
      </div>

      {/* Flashing glow ring — concentric overlay. */}
      {effectiveIsActive && effectiveTimeLeft !== null && (
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 pointer-events-none ${isUrgent ? 'animate-pulse' : isWarning ? 'animate-pulse' : ''}`}
          style={{
            width: ringOuter,
            height: ringOuter,
            ...getGlowStyle(),
            borderWidth: isUrgent ? '4px' : '3px',
            animation: isNormal ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined,
          }}
        />
      )}

      {/* SVG Timer Ring — concentric overlay. */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 pointer-events-none"
        width={size}
        height={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted) / 0.3)"
          strokeWidth={strokeWidth}
        />
        {effectiveIsActive && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getStrokeColor()}
            strokeWidth={strokeWidth + (isUrgent ? 2 : 0)}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={suppressTransition ? "" : "transition-[stroke-dashoffset] duration-1000 ease-linear"}
            style={{
              filter: isUrgent
                ? 'drop-shadow(0 0 8px hsl(0, 84%, 60%))'
                : isWarning
                  ? 'drop-shadow(0 0 6px hsl(45, 93%, 47%))'
                  : isNormal
                    ? 'drop-shadow(0 0 4px hsl(142, 76%, 36%))'
                    : undefined,
            }}
          />
        )}
      </svg>
    </div>
  );
};
