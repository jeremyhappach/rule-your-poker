/**
 * ShellTimerRail — canonical shell-owned timer presentation.
 *
 * Ownership contract:
 *
 *   - Shell owns ALL timer rendering, geometry, color thresholds, and
 *     mount-frame transition snapping. This is non-overridable.
 *   - Games publish SEMANTIC STATE ONLY via `useShellTimer`:
 *       - secondsRemaining: integer seconds left on the active timer
 *       - totalSeconds:     denominator for the progress bar
 *       - paused:           true when the session is paused (overrides
 *                           any timer; renders a single canonical
 *                           paused state)
 *       - actorLabel:       optional short label for the actor on the
 *                           clock (e.g. current turn player's name)
 *   - Games never render clock chips, paused badges, or their own
 *     TimerBar instances. There is one timer renderer for the entire
 *     app.
 *
 * Visual language is the existing `TimerBar` (descending green/yellow/
 * red horizontal bar with seconds-remaining caption). When `paused`
 * is true, the bar renders fully filled in muted style with a "Paused"
 * caption.
 *
 * Mount: rendered by `MobileGameTable` (and any other gameplay surface)
 * inside the canonical HUD row 2 slot. The rail returns `null` when no
 * game has published state, so the row collapses to zero height.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { getCanonicalTimerEligibility } from '@/lib/canonicalShell/timerEligibility';
import {
  recordThreeFiveSevenTimerOwner,
  unregisterThreeFiveSevenTimerOwner,
} from '@/lib/canonicalShell/cardTransport/threeFiveSevenForensicsStore';
import { record357DiagnosticViolation } from '@/lib/canonicalShell/cardTransport/threeFiveSevenPresentationForensics';

export interface ShellTimerState {
  /** Seconds remaining (integer, clamped >= 0 by renderer). */
  secondsRemaining: number;
  /** Denominator for the progress bar. Must be > 0. */
  totalSeconds: number;
  /** True when the game is paused. Overrides timer visuals. */
  paused?: boolean;
  /** Optional short label appended to the timer caption. */
  actorLabel?: string | null;
  activePlayerId?: string | null;
  /**
   * Optional opaque identity string. When it changes, the renderer
   * snaps the bar to its initial width without animating (used for
   * turn handoffs). Games typically pass `${roundId}-${actorId}` or
   * similar.
   */
  identityKey?: string | null;
}

const ShellTimerStateContext = createContext<ShellTimerState | null>(null);
type ShellTimerRegister = (registrationId: number, state: ShellTimerState | null) => void;
const ShellTimerRegisterContext = createContext<ShellTimerRegister | null>(null);
let nextShellTimerRegistrationId = 1;

export function ShellTimerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShellTimerState | null>(null);
  const registrationsRef = useRef<Map<number, ShellTimerState>>(new Map());
  const register = useCallback<ShellTimerRegister>((registrationId, next) => {
    if (next) {
      registrationsRef.current.delete(registrationId);
      registrationsRef.current.set(registrationId, next);
    } else {
      registrationsRef.current.delete(registrationId);
    }
    const registrations = Array.from(registrationsRef.current.values());
    setState(registrations[registrations.length - 1] ?? null);
  }, []);
  return (
    <ShellTimerRegisterContext.Provider value={register}>
      <ShellTimerStateContext.Provider value={state}>
        {children}
      </ShellTimerStateContext.Provider>
    </ShellTimerRegisterContext.Provider>
  );
}

/**
 * Game-facing hook. Publishes timer state to the shell so the shell
 * can render the canonical timer. Pass `null` to clear (no timer
 * visible). Returns nothing — games never render the timer themselves.
 */
export function useShellTimer(state: ShellTimerState | null): void {
  const register = useContext(ShellTimerRegisterContext);
  const deal = useDealRuntime();
  const blocked357State = !!deal && !deal.timerAllowed && !!state && state.secondsRemaining > 0;
  const effectiveState = blocked357State ? null : state;
  const registrationIdRef = useRef<number | null>(null);
  if (registrationIdRef.current === null) {
    registrationIdRef.current = nextShellTimerRegistrationId++;
  }
  const signature = effectiveState
    ? JSON.stringify({
        s: effectiveState.secondsRemaining,
        t: effectiveState.totalSeconds,
        p: !!effectiveState.paused,
        a: effectiveState.actorLabel ?? null,
        pid: effectiveState.activePlayerId ?? null,
        k: effectiveState.identityKey ?? null,
      })
    : 'null';
  useEffect(() => {
    if (!register) return;
    if (!effectiveState) {
      register(registrationIdRef.current!, null);
      return;
    }
    register(registrationIdRef.current!, effectiveState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, signature]);
  useEffect(() => {
    if (!blocked357State || !deal || !state) return;
    record357DiagnosticViolation('357_TIMER_TICK_DURING_DEAL_BLOCKED', {
      component: 'useShellTimer',
      attemptedSeconds: state.secondsRemaining,
      dealPhase: deal.phase,
      dealSettled: deal.dealSettled,
      readyReleased: deal.readyReleased,
    }, {
      handContextId: deal.handContextId,
      phase: deal.phase,
      component: 'PLAYER_HAND',
    });
  }, [blocked357State, deal, deal?.handContextId, deal?.phase, deal?.dealSettled, deal?.readyReleased, state]);
  useEffect(() => {
    return () => {
      register?.(registrationIdRef.current!, null);
    };
  }, [register]);
}

/** Shell-rendered timer. Reads from the provider. */
export function ShellTimerRail() {
  const state = useContext(ShellTimerStateContext);
  const deal = useDealRuntime();
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  // Snap-to-mount: enable CSS width transitions only after the first
  // paint (so the bar appears at its correct width without animating
  // up from zero). Also re-snap when the identityKey changes so a
  // turn handoff resets without animating across actor boundaries.
  const [mounted, setMounted] = useState(false);
  const identityKey = state?.identityKey ?? null;
  useEffect(() => {
    setMounted(false);
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [identityKey]);

  const paused = !!state?.paused;
  const eligibility = deal
    ? getCanonicalTimerEligibility({
        gameType: deal.gameType,
        dealPhase: deal.phase,
        dealSettled: deal.dealSettled,
        readyReleased: deal.readyReleased,
        activePlayerId: state?.activePlayerId ?? state?.identityKey ?? null,
      })
    : { visible: !!state, running: !!state && !paused && state.secondsRemaining > 0 };
  const total = state && state.totalSeconds > 0 ? state.totalSeconds : 1;
  const seconds = Math.max(0, Math.round(state?.secondsRemaining ?? 0));
  const effectivePaused = paused || !eligibility.running;
  const pct = effectivePaused ? 100 : Math.max(0, Math.min(100, (seconds / total) * 100));

  const fillClass = effectivePaused
    ? 'bg-muted-foreground/40'
    : seconds <= 3
      ? 'bg-red-500'
      : seconds <= 5
        ? 'bg-yellow-500'
        : 'bg-green-500';

  const ownerId = `ShellTimerRail:${deal?.handContextId ?? state?.identityKey ?? 'global'}`;
  const blocked357TimerAttempt = !!deal && !deal.timerAllowed && !!state && !paused && seconds > 0;
  useEffect(() => {
    if (!state && !deal) {
      unregisterThreeFiveSevenTimerOwner(ownerId);
      return;
    }
    recordThreeFiveSevenTimerOwner(ownerId, {
      componentName: 'ShellTimerRail',
      gameType: null,
      handContextId: deal?.handContextId ?? null,
      waveContextId: deal?.handContextId ?? null,
      dealRuntimeId: deal?.handContextId?.replace(/#r\d+$/, '') ?? null,
      phase: deal?.phase ?? 'NO_RUNTIME',
      visible: eligibility.visible,
      running: eligibility.running && seconds > 0,
      timeLeft: seconds,
      usesDealRuntime: !!deal,
      suppressedLegacySource: deal?.phase === 'DEALING' && state ? 'ShellTimerRail/useShellTimer' : null,
      attemptedRunning: !!state && !paused && seconds > 0,
      reactKey: state?.identityKey ?? null,
      renderCount: renderCountRef.current,
    });
  }, [ownerId, state, deal, deal?.handContextId, deal?.phase, deal?.dealSettled, deal?.readyReleased, paused, seconds, eligibility.visible, eligibility.running]);
  useEffect(() => () => unregisterThreeFiveSevenTimerOwner(ownerId), [ownerId]);

  useEffect(() => {
    if (!blocked357TimerAttempt || !deal) return;
    record357DiagnosticViolation('357_TIMER_TICK_DURING_DEAL_BLOCKED', {
      component: 'ShellTimerRail',
      attemptedSeconds: seconds,
      dealPhase: deal.phase,
      dealSettled: deal.dealSettled,
      readyReleased: deal.readyReleased,
    }, {
      handContextId: deal.handContextId,
      phase: deal.phase,
      component: 'PLAYER_HAND',
    });
  }, [blocked357TimerAttempt, deal, deal?.handContextId, deal?.phase, deal?.dealSettled, deal?.readyReleased, seconds]);

  if (!eligibility.visible || blocked357TimerAttempt) return null;

  // ROOT-CAUSE FIX (helper-text clipping under timer):
  // The timer row's fixed height (`--hud-h-timer`) clips any text rendered
  // below the bar. Per the canonical contract, the timer row owns the bar
  // ONLY — actor identity belongs to the identity row, and any auxiliary
  // "helper" copy belongs to the active content pane. The bar's length and
  // color already encode seconds-remaining and urgency. We therefore drop
  // the caption entirely instead of leaving a half-clipped line under the
  // bar. `paused` state is conveyed by the muted fill color.
  return (
    <div
      data-canonical-shell-timer-rail=""
      data-shell-timer-paused={effectivePaused ? '1' : '0'}
      data-forensics-component="ShellTimerRail"
      data-forensics-timer-owner-id={ownerId}
      data-forensics-timer-phase={deal?.phase ?? 'NO_RUNTIME'}
      data-forensics-timer-running={eligibility.running && seconds > 0 ? '1' : '0'}
      data-forensics-timer-time-left={String(seconds)}
      aria-label={effectivePaused ? 'Paused' : `${seconds} seconds remaining`}
      className="w-full h-full flex items-center px-3"
    >
      <div className="h-3 w-full bg-muted rounded-full overflow-hidden border border-border">
        <div
          className={`h-full ${mounted ? 'transition-[width] duration-1000 ease-linear' : ''} ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Internal helper for tests / shells: returns the current published state. */
export function useShellTimerStateForRender(): ShellTimerState | null {
  return useContext(ShellTimerStateContext);
}
