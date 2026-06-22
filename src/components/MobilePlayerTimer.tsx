import { useMemo, useRef, useEffect, useState } from "react";
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
        dealPhase: deal.phase,
        dealSettled: deal.dealSettled,
        readyReleased: deal.readyReleased,
        activePlayerId: isActive ? 'MobilePlayerTimer' : null,
      })
    : { visible: isActive, running: isActive && timeLeft !== null && timeLeft > 0 };
  const effectiveIsActive = eligibility.visible && isActive;
  const effectiveTimeLeft = eligibility.running ? timeLeft : null;

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

  // Track activation identity to suppress transition on first active frame
  const wasActiveRef = useRef(false);
  const [suppressTransition, setSuppressTransition] = useState(false);

  // Null-seed paint guard: when isActive flips true with timeLeft===null
  // (the "null-seed" source observed in lifecycle traces), the progress
  // ring would otherwise jump from full→actual in a single 1s ease as
  // the real seed lands one frame later. Suppress the progress ring
  // entirely until the first non-null timeLeft commit per activation,
  // eliminating the visible flash even if the activation happens on a
  // freshly-mounted instance.
  const seedReadyRef = useRef(false);
  const [seedReady, setSeedReady] = useState(false);

  useEffect(() => {
    if (effectiveIsActive && !wasActiveRef.current) {
      setSuppressTransition(true);
      requestAnimationFrame(() => setSuppressTransition(false));
      seedReadyRef.current = effectiveTimeLeft !== null;
      setSeedReady(effectiveTimeLeft !== null);
      recordLifecycleEvent('timer.activate', {
        component: 'MobilePlayerTimer',
        instance_id: instanceIdRef.current,
        time_left_seed: effectiveTimeLeft,
        max_time: maxTime,
        timer_seed_source: effectiveTimeLeft === null ? 'null-seed' : 'prop-seed',
      });
    } else if (effectiveIsActive && !seedReadyRef.current && effectiveTimeLeft !== null) {
      seedReadyRef.current = true;
      setSeedReady(true);
    } else if (!effectiveIsActive && wasActiveRef.current) {
      seedReadyRef.current = false;
      setSeedReady(false);
    }
    wasActiveRef.current = effectiveIsActive;
  }, [effectiveIsActive, effectiveTimeLeft, maxTime]);

  
  const progress = useMemo(() => {
    if (!effectiveIsActive || effectiveTimeLeft === null || maxTime <= 0) return 0;
    return Math.max(0, Math.min(1, effectiveTimeLeft / maxTime));
  }, [effectiveTimeLeft, maxTime, effectiveIsActive]);
  
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
      gameType: null,
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

  return (
    <div 
      data-mobile-player-timer=""
      data-forensics-component="MobilePlayerTimer"
      data-forensics-timer-owner-id={timerOwnerId}
      data-forensics-timer-phase={deal?.phase ?? 'NO_RUNTIME'}
      data-forensics-timer-running={effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft > 0 ? '1' : '0'}
      data-forensics-timer-time-left={effectiveTimeLeft === null ? '' : String(effectiveTimeLeft)}
      className="relative inline-flex items-center justify-center" 
      style={{ width: size + 8, height: size + 8 }}
    >
      {/* Flashing glow ring when active */}
      {effectiveIsActive && effectiveTimeLeft !== null && (
        <div 
          className={`absolute inset-0 rounded-full border-3 ${isUrgent ? 'animate-pulse' : isWarning ? 'animate-pulse' : ''}`}
          style={{ 
            ...getGlowStyle(),
            borderWidth: isUrgent ? '4px' : '3px',
            animation: isNormal ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : undefined
          }}
        />
      )}
      
      {/* SVG Timer Ring */}
      <svg
        className="absolute -rotate-90"
        width={size}
        height={size}
        style={{ top: 4, left: 4 }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted) / 0.3)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle — gated on seedReady so a null-seed activation
            does not paint a stale full-ring before the real timeLeft
            commits the following frame. */}
        {effectiveIsActive && seedReady && effectiveTimeLeft !== null && (
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
                    : undefined
            }}
          />
        )}
      </svg>
      
      {/* Content inside the ring */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
