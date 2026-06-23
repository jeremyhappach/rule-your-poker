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
  children: React.ReactNode;
}

export const MobilePlayerTimer = ({ 
  timeLeft, 
  maxTime, 
  isActive, 
  size = 48,
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
  const [suppressTransition, setSuppressTransition] = useState(false);

  // Canonical timer initialization invariant:
  //   - On a new actionable turn, snap to FULL before any visible countdown.
  //   - Within one uninterrupted active-turn segment, displayed progress
  //     is monotonic non-increasing (no upward jumps from a stale seed,
  //     a delayed deadline rebase, or a CSS transition off a prior value).
  //   - A fresh full refill is permitted across activation boundaries
  //     (e.g. pause→resume), because `wasActiveRef` flips false→true.
  const displayProgressRef = useRef(1);
  const activationSeqRef = useRef(0);

  // Detect activation edge during render so the very first paint of a
  // new active segment is already snapped to full — the ring never has
  // a chance to paint a stale lower value, so there is no upward
  // transition to chase.
  if (effectiveIsActive && !wasActiveRef.current) {
    displayProgressRef.current = 1;
    activationSeqRef.current += 1;
  }

  useEffect(() => {
    if (effectiveIsActive && !wasActiveRef.current) {
      setSuppressTransition(true);
      requestAnimationFrame(() => setSuppressTransition(false));
      recordLifecycleEvent('timer.activate', {
        component: 'MobilePlayerTimer',
        instance_id: instanceIdRef.current,
        time_left_seed: effectiveTimeLeft,
        max_time: maxTime,
        timer_seed_source: effectiveTimeLeft === null ? 'null-seed' : 'prop-seed',
        snapped_full: true,
      });
    }
    wasActiveRef.current = effectiveIsActive;
  }, [effectiveIsActive, effectiveTimeLeft, maxTime]);

  const progress = useMemo(() => {
    if (!effectiveIsActive) return 0;
    // First committed frame of a new active segment ALWAYS renders at
    // 100%. We detect the activation frame at render time via
    // `wasActiveRef` (still false until the post-paint effect commits
    // it), so no stale seed, late deadline, or partial prop value can
    // paint below full for even one frame. Subsequent ticks may only
    // descend from this baseline.
    const isActivationFrame = !wasActiveRef.current;
    if (isActivationFrame) {
      displayProgressRef.current = 1;
      return 1;
    }
    if (effectiveTimeLeft === null || maxTime <= 0) {
      return displayProgressRef.current;
    }
    const raw = Math.max(0, Math.min(1, effectiveTimeLeft / maxTime));
    const next = Math.min(displayProgressRef.current, raw);
    displayProgressRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTimeLeft, maxTime, effectiveIsActive, activationSeqRef.current]);
  
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
      data-mobile-player-timer=""
      data-forensics-component="MobilePlayerTimer"
      data-forensics-timer-owner-id={timerOwnerId}
      data-forensics-timer-phase={deal?.phase ?? 'NO_RUNTIME'}
      data-forensics-timer-running={effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft > 0 ? '1' : '0'}
      data-forensics-timer-time-left={effectiveTimeLeft === null ? '' : String(effectiveTimeLeft)}
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
            className={suppressTransition ? "" : "transition-all duration-1000 ease-linear"}
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
