/**
 * SurfaceReadinessContract — capability-driven readiness reporting.
 *
 * Lets a gameplay surface family (Gin today; others as they need it)
 * declare when its first authoritative, RENDERABLE frame is available
 * for a given slot identity. The canonical shell consumes this signal
 * to gate the neutral→active transition. No gameType branches in shell
 * lifecycle; the shell only consumes whatever readiness has been
 * reported for the identity it's about to mount.
 *
 * Contract:
 *   - A reporter (typically a small probe component mounted as a sibling
 *     of the gameplay slot, OR the gameplay surface itself) calls
 *     useReportSurfaceReady(identity, ready).
 *   - A consumer (PlayfieldSlotController parent / Game.tsx) calls
 *     useSurfaceReadiness(identity) and ANDs the result with its
 *     identity scoping check.
 *   - When no probe has reported for the identity, the default is
 *     `true` (backwards compatible: surfaces that don't need explicit
 *     readiness continue to mount on identity alone).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface SurfaceReadinessIdentity {
  dealerGameId: string;
  /** Optional sub-scope (e.g. roundId) when readiness is round-bound. */
  scope?: string | null;
}

function identityKey(id: SurfaceReadinessIdentity | null): string {
  if (!id) return '';
  return `${id.dealerGameId}::${id.scope ?? ''}`;
}

interface ReadinessState {
  reports: Map<string, boolean>;
}

interface ReadinessContextValue {
  state: ReadinessState;
  report: (id: SurfaceReadinessIdentity, ready: boolean) => void;
  clear: (id: SurfaceReadinessIdentity) => void;
}

const ReadinessContext = createContext<ReadinessContextValue | null>(null);

export function SurfaceReadinessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReadinessState>(() => ({
    reports: new Map(),
  }));

  const report = useCallback((id: SurfaceReadinessIdentity, ready: boolean) => {
    const key = identityKey(id);
    if (!key) return;
    setState(prev => {
      const existing = prev.reports.get(key);
      if (existing === ready) return prev;
      const next = new Map(prev.reports);
      next.set(key, ready);
      return { reports: next };
    });
  }, []);

  const clear = useCallback((id: SurfaceReadinessIdentity) => {
    const key = identityKey(id);
    if (!key) return;
    setState(prev => {
      if (!prev.reports.has(key)) return prev;
      const next = new Map(prev.reports);
      next.delete(key);
      return { reports: next };
    });
  }, []);

  const value = useMemo<ReadinessContextValue>(
    () => ({ state, report, clear }),
    [state, report, clear],
  );

  return (
    <ReadinessContext.Provider value={value}>
      {children}
    </ReadinessContext.Provider>
  );
}

/**
 * Reporter hook. Stable across re-renders; only emits when value
 * actually changes.
 */
export function useReportSurfaceReady(
  identity: SurfaceReadinessIdentity | null,
  ready: boolean,
) {
  const ctx = useContext(ReadinessContext);
  const lastReportedRef = useRef<{ key: string; ready: boolean } | null>(null);

  useEffect(() => {
    if (!ctx || !identity) return;
    const key = identityKey(identity);
    if (!key) return;

    const prev = lastReportedRef.current;
    if (prev && prev.key === key && prev.ready === ready) return;

    ctx.report(identity, ready);
    lastReportedRef.current = { key, ready };

    return () => {
      // Clear when identity changes; allows fresh readiness lifecycle
      // for the next identity.
      const cur = lastReportedRef.current;
      if (cur && cur.key !== identityKey(identity)) {
        // no-op; cleared by the new identity's effect
      }
    };
  }, [ctx, identity?.dealerGameId, identity?.scope, ready]);

  // Clear on unmount.
  useEffect(() => {
    return () => {
      const prev = lastReportedRef.current;
      if (prev && ctx) {
        ctx.clear({ dealerGameId: prev.key.split('::')[0], scope: prev.key.split('::')[1] || null });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Consumer hook. Returns `true` when:
 *   - no probe has reported for this identity (default-allow), OR
 *   - the latest reported value for this identity is true.
 *
 * Returns `false` only when a probe has explicitly reported `false`
 * for the exact identity.
 */
export function useSurfaceReadiness(
  identity: SurfaceReadinessIdentity | null,
): boolean {
  const ctx = useContext(ReadinessContext);
  if (!ctx || !identity) return true;
  const key = identityKey(identity);
  if (!key) return true;
  const reported = ctx.state.reports.get(key);
  return reported === undefined ? true : reported;
}
