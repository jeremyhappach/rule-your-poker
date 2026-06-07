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

export interface ShellTimerState {
  /** Seconds remaining (integer, clamped >= 0 by renderer). */
  secondsRemaining: number;
  /** Denominator for the progress bar. Must be > 0. */
  totalSeconds: number;
  /** True when the game is paused. Overrides timer visuals. */
  paused?: boolean;
  /** Optional short label appended to the timer caption. */
  actorLabel?: string | null;
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
  const registrationIdRef = useRef<number | null>(null);
  if (registrationIdRef.current === null) {
    registrationIdRef.current = nextShellTimerRegistrationId++;
  }
  const signature = state
    ? JSON.stringify({
        s: state.secondsRemaining,
        t: state.totalSeconds,
        p: !!state.paused,
        a: state.actorLabel ?? null,
        k: state.identityKey ?? null,
      })
    : 'null';
  useEffect(() => {
    if (!register) return;
    if (!state) {
      register(registrationIdRef.current!, null);
      return;
    }
    register(registrationIdRef.current!, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, signature]);
  useEffect(() => {
    return () => {
      register?.(registrationIdRef.current!, null);
    };
  }, [register]);
}

/** Shell-rendered timer. Reads from the provider. */
export function ShellTimerRail() {
  const state = useContext(ShellTimerStateContext);

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

  if (!state) return null;

  const paused = !!state.paused;
  const total = state.totalSeconds > 0 ? state.totalSeconds : 1;
  const seconds = Math.max(0, Math.round(state.secondsRemaining));
  const pct = paused ? 100 : Math.max(0, Math.min(100, (seconds / total) * 100));

  const fillClass = paused
    ? 'bg-muted-foreground/40'
    : seconds <= 3
      ? 'bg-red-500'
      : seconds <= 5
        ? 'bg-yellow-500'
        : 'bg-green-500';

  const caption = paused
    ? '⏸ Paused'
    : state.actorLabel
      ? `${seconds}s remaining · ${state.actorLabel}`
      : `${seconds}s remaining`;

  return (
    <div
      data-canonical-shell-timer-rail=""
      data-shell-timer-paused={paused ? '1' : '0'}
      className="w-full px-3"
    >
      <div className="h-4 w-full bg-muted rounded-full overflow-hidden border border-border">
        <div
          className={`h-full ${mounted ? 'transition-[width] duration-1000 ease-linear' : ''} ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-center text-muted-foreground mt-0.5">{caption}</p>
    </div>
  );
}

/** Internal helper for tests / shells: returns the current published state. */
export function useShellTimerStateForRender(): ShellTimerState | null {
  return useContext(ShellTimerStateContext);
}
