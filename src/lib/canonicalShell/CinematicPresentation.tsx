import {createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {PresentationMode} from './presentationMode';
import {SLOT_CHOREOGRAPHY} from './slotChoreography';

type Phase = 'stable' | 'outgoing' | 'bridge' | 'incoming';
interface Context {
  active: boolean;
  register: (mode: PresentationMode) => () => void;
}
export const CinematicPresentationContext = createContext<Context | null>(null);
export const useCinematicTransitionActive = () => useContext(CinematicPresentationContext)?.active ?? false;

/** Readiness means an admitted, hydrated surface has committed its actual layout. */
export function usePresentationSurfaceReady(mode: PresentationMode, ready = true) {
  const register = useContext(CinematicPresentationContext)?.register;
  useLayoutEffect(() => ready && register ? register(mode) : undefined, [register, mode, ready]);
}

/** Retains a single outgoing React tree until it has faded. No clones, routes or authority changes. */
export function useCinematicPresentation<T extends {presentationMode?: PresentationMode}>(input: T, blocked: boolean) {
  const desired = input.presentationMode ?? 'table';
  const [state, setState] = useState<{mode: PresentationMode; phase: Phase}>({mode: desired, phase: 'stable'});
  const lastFrame = useRef(input), latestMode = useRef(desired), started = useRef(0);
  latestMode.current = desired;
  const [ready, setReady] = useState<Record<PresentationMode, number>>({table: 0, fullscreen: 0});
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const columnRef = useRef<HTMLDivElement>(null), restoreFocus = useRef(false);
  const mismatch = desired !== state.mode;
  const active = state.phase !== 'stable' || (mismatch && !blocked);
  const frame = mismatch ? lastFrame.current : input;
  useLayoutEffect(() => { if (!mismatch) lastFrame.current = input; });
  useLayoutEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const register = useCallback((mode: PresentationMode) => {
    setReady(value => ({...value, [mode]: value[mode] + 1}));
    return () => setReady(value => ({...value, [mode]: value[mode] - 1}));
  }, []);
  useLayoutEffect(() => {
    if (state.phase !== 'stable' || !mismatch || blocked) return;
    started.current = performance.now();
    restoreFocus.current = !!columnRef.current?.contains(document.activeElement);
    setState(reduced ? {mode: desired, phase: 'bridge'} : {...state, phase: 'outgoing'});
  }, [state, desired, mismatch, blocked, reduced]);
  useLayoutEffect(() => {
    if (state.phase !== 'outgoing') return;
    const timer = setTimeout(() => setState({mode: latestMode.current, phase: 'bridge'}), reduced ? 0 : SLOT_CHOREOGRAPHY.dissolveOutMs);
    return () => clearTimeout(timer);
  }, [state.phase, reduced]);
  useLayoutEffect(() => {
    if (state.phase !== 'bridge') return;
    if (mismatch) { setState({mode: desired, phase: 'bridge'}); return; }
    if (ready[state.mode] === 0) return;
    // Time shapes the dissolve only. A real readiness registration is also required.
    const remaining = reduced ? 0 : Math.max(0, SLOT_CHOREOGRAPHY.interstitialDwellMs - SLOT_CHOREOGRAPHY.dissolveInMs - (performance.now() - started.current));
    const timer = setTimeout(() => setState({...state, phase: reduced ? 'stable' : 'incoming'}), remaining);
    return () => clearTimeout(timer);
  }, [state, ready, reduced, desired, mismatch]);
  useLayoutEffect(() => {
    if (state.phase !== 'incoming') return;
    const timer = setTimeout(() => setState({...state, phase: 'stable'}), reduced ? 0 : SLOT_CHOREOGRAPHY.dissolveInMs);
    return () => clearTimeout(timer);
  }, [state, reduced]);
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    column.inert = active;
    if (!active && restoreFocus.current) {
      restoreFocus.current = false;
      if (!document.activeElement || document.activeElement === document.body || column.contains(document.activeElement)) column.focus({preventScroll: true});
    }
  }, [active]);
  const context = useMemo(() => ({active, register}), [active, register]);
  return {frame, phase: state.phase, active, columnRef, context};
}
