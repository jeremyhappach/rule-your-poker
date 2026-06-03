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
 * Identity scoping (strict, no stale-leak):
 *   - Probes "register" themselves for a `dealerGameId`. While any
 *     probe is registered for that dealerGameId, the consumer is
 *     default-DENY for unknown scopes under it — a stale ready=true
 *     from a prior round cannot leak forward to a new roundId.
 *   - Probes seed `ready=false` for the new identity synchronously
 *     (layout effect) on every identity change, and clear the previous
 *     identity's entry. The map cannot accumulate stale truthy entries.
 *   - Surfaces that never register a probe stay default-ALLOW
 *     (backwards compatible).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { recordShellLifecycleEvent } from './shellLifecycleLog';

export interface SurfaceReadinessIdentity {
  dealerGameId: string;
  /** Optional sub-scope (e.g. roundId) when readiness is round-bound. */
  scope?: string | null;
}

function identityKey(id: SurfaceReadinessIdentity | null): string {
  if (!id) return '';
  return `${id.dealerGameId}::${id.scope ?? ''}`;
}

function parseKey(key: string): SurfaceReadinessIdentity {
  const [dealerGameId, scope] = key.split('::');
  return { dealerGameId, scope: scope || null };
}

interface ReadinessState {
  reports: Map<string, boolean>;
  /** dealerGameId -> count of active probe registrations. */
  registrations: Map<string, number>;
}

interface ReadinessContextValue {
  state: ReadinessState;
  setReport: (id: SurfaceReadinessIdentity, ready: boolean) => void;
  clearReport: (id: SurfaceReadinessIdentity) => void;
  registerProbe: (dealerGameId: string) => void;
  unregisterProbe: (dealerGameId: string) => void;
}

const ReadinessContext = createContext<ReadinessContextValue | null>(null);

export function SurfaceReadinessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReadinessState>(() => ({
    reports: new Map(),
    registrations: new Map(),
  }));

  const setReport = useCallback((id: SurfaceReadinessIdentity, ready: boolean) => {
    const key = identityKey(id);
    if (!key) return;
    setState(prev => {
      if (prev.reports.get(key) === ready) return prev;
      const reports = new Map(prev.reports);
      reports.set(key, ready);
      recordShellLifecycleEvent('readiness-report', `${key.slice(0, 24)} → ${ready}`, {
        dealerGameId: id.dealerGameId?.slice(0, 8) ?? null,
        scope: id.scope?.slice(0, 8) ?? null,
        previous: prev.reports.get(key) ?? null,
      });
      return { ...prev, reports };
    });
  }, []);

  const clearReport = useCallback((id: SurfaceReadinessIdentity) => {
    const key = identityKey(id);
    if (!key) return;
    setState(prev => {
      if (!prev.reports.has(key)) return prev;
      const reports = new Map(prev.reports);
      reports.delete(key);
      recordShellLifecycleEvent('readiness-clear', key.slice(0, 24), {
        dealerGameId: id.dealerGameId?.slice(0, 8) ?? null,
        scope: id.scope?.slice(0, 8) ?? null,
        previousValue: prev.reports.get(key) ?? null,
      });
      return { ...prev, reports };
    });
  }, []);

  const registerProbe = useCallback((dealerGameId: string) => {
    if (!dealerGameId) return;
    setState(prev => {
      const registrations = new Map(prev.registrations);
      const next = (registrations.get(dealerGameId) ?? 0) + 1;
      registrations.set(dealerGameId, next);
      recordShellLifecycleEvent('readiness-probe-register', `dealer=${dealerGameId.slice(0, 8)} count=${next}`);
      return { ...prev, registrations };
    });
  }, []);

  const unregisterProbe = useCallback((dealerGameId: string) => {
    if (!dealerGameId) return;
    setState(prev => {
      const current = prev.registrations.get(dealerGameId) ?? 0;
      if (current <= 0) return prev;
      const registrations = new Map(prev.registrations);
      const next = current - 1;
      if (next <= 0) {
        registrations.delete(dealerGameId);
        // Also purge any leftover reports under this dealerGameId.
        const reports = new Map(prev.reports);
        let mutated = false;
        for (const k of Array.from(reports.keys())) {
          if (parseKey(k).dealerGameId === dealerGameId) {
            reports.delete(k);
            mutated = true;
          }
        }
        recordShellLifecycleEvent('readiness-probe-unregister', `dealer=${dealerGameId.slice(0, 8)} (last)`, {
          purgedReports: mutated,
        });
        return { reports: mutated ? reports : prev.reports, registrations };
      }
      registrations.set(dealerGameId, next);
      recordShellLifecycleEvent('readiness-probe-unregister', `dealer=${dealerGameId.slice(0, 8)} count=${next}`);
      return { ...prev, registrations };
    });
  }, []);

  const value = useMemo<ReadinessContextValue>(
    () => ({ state, setReport, clearReport, registerProbe, unregisterProbe }),
    [state, setReport, clearReport, registerProbe, unregisterProbe],
  );

  return (
    <ReadinessContext.Provider value={value}>
      {children}
    </ReadinessContext.Provider>
  );
}

/**
 * Reporter hook. On every identity change:
 *   1. Synchronously (layout effect) seeds the new identity as
 *      ready=false and clears the prior identity entry, so no stale
 *      truthy report can leak across roundIds/dealerGames.
 *   2. Registers a probe for the new dealerGameId (default-deny gate).
 *   3. Emits the current `ready` value when it actually changes.
 */
export function useReportSurfaceReady(
  identity: SurfaceReadinessIdentity | null,
  ready: boolean,
) {
  const ctx = useContext(ReadinessContext);
  const prevIdentityRef = useRef<SurfaceReadinessIdentity | null>(null);
  const prevDealerGameIdRef = useRef<string | null>(null);
  // Track latest `ready` value so the identity-change layout effect
  // can seed the new identity with the caller's current readiness,
  // rather than always seeding false (which would force a needless
  // cold/awaiting-surface-ready window when the caller already has a
  // valid frame at bind time).
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Synchronous reset on identity change — runs before paint so the
  // consumer never observes a stale `true` for the new identity.
  useLayoutEffect(() => {
    if (!ctx) return;
    const prev = prevIdentityRef.current;
    const prevKey = identityKey(prev);
    const nextKey = identityKey(identity);

    if (prevKey !== nextKey) {
      if (prev) ctx.clearReport(prev);
      // Seed with the caller's CURRENT readiness. If the caller already
      // has a valid frame for this identity (e.g. parent passed it in
      // synchronously), we must not force a false → true window that
      // would unmount shell chrome.
      if (identity) ctx.setReport(identity, readyRef.current === true);
      prevIdentityRef.current = identity;
    }

    const prevDealer = prevDealerGameIdRef.current;
    const nextDealer = identity?.dealerGameId ?? null;
    if (prevDealer !== nextDealer) {
      if (prevDealer) ctx.unregisterProbe(prevDealer);
      if (nextDealer) ctx.registerProbe(nextDealer);
      prevDealerGameIdRef.current = nextDealer;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, identity?.dealerGameId, identity?.scope]);


  // Report current readiness value.
  useEffect(() => {
    if (!ctx || !identity) return;
    ctx.setReport(identity, ready);
  }, [ctx, identity?.dealerGameId, identity?.scope, ready]);

  // Unmount: release probe registration and clear the report.
  useEffect(() => {
    return () => {
      if (!ctx) return;
      const prev = prevIdentityRef.current;
      const prevDealer = prevDealerGameIdRef.current;
      if (prev) ctx.clearReport(prev);
      if (prevDealer) ctx.unregisterProbe(prevDealer);
      prevIdentityRef.current = null;
      prevDealerGameIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Consumer hook.
 *   - If NO probe is registered for the identity's dealerGameId:
 *     default-ALLOW (returns true). Backwards compatible with surfaces
 *     that don't opt into readiness.
 *   - If a probe IS registered for the dealerGameId: strict default-
 *     DENY. Returns true only when the exact identity (dealerGameId +
 *     scope) has an explicit ready=true report.
 */
export function useSurfaceReadiness(
  identity: SurfaceReadinessIdentity | null,
): boolean {
  const ctx = useContext(ReadinessContext);
  if (!ctx || !identity) return true;
  const gated = (ctx.state.registrations.get(identity.dealerGameId) ?? 0) > 0;
  const key = identityKey(identity);
  const reported = ctx.state.reports.get(key);
  if (!gated) return reported === undefined ? true : reported;
  return reported === true;
}
