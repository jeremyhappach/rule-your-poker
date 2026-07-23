/**
 * WinnerChipEndpointRegistry — table-scoped registry of live chip
 * endpoint HTMLElements, keyed by authoritative (playerId, position).
 *
 * Contract (see approved substrate spec):
 *   - Registry is scoped to a mounted canonical table/shell instance
 *     via React context. There is NO module-global registry, so state
 *     cannot leak across games, dealer games, remounts, or multiple
 *     rendered tables.
 *   - Registrations retain the live HTMLElement, not a cached DOMRect.
 *     Rects are measured lazily by callers via `element.getBoundingClientRect()`
 *     at animation start.
 *   - Registrations are keyed by both `playerId` and `position`.
 *     Resolution verifies both when both are supplied.
 *   - Both endpoint owners (opponent seat cluster, local viewer chip
 *     endpoint) register into the same contract via
 *     `useRegisterWinnerChipEndpoint`.
 *   - Cleanup is identity-safe: each registration receives a unique
 *     token; unmount only removes entries whose token matches. An
 *     older component's cleanup cannot delete a newer registration
 *     that reused the same (playerId, position) key.
 *   - Duplicate/ambiguous registrations for the same key are NOT
 *     silently disambiguated. Resolver returns `{ status: 'ambiguous' }`.
 *   - No timers, no coordinate fallback, no viewer/HOME/DOM-order bias.
 *
 * This module intentionally exports only registration + resolution
 * primitives. It does not drive animations, does not mutate refs owned
 * by consumers, and does not participate in any lifecycle beyond React
 * mount/unmount of the endpoint components.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

interface Registration {
  token: symbol;
  playerId: string | null;
  position: number | null;
  element: HTMLElement;
}

export type ResolveInput = {
  playerId?: string | null;
  position?: number | null;
};

export type ResolveResult =
  | { status: 'resolved'; element: HTMLElement; playerId: string | null; position: number | null }
  | { status: 'missing' }
  | { status: 'ambiguous'; count: number }
  | { status: 'identity-mismatch'; foundPlayerId: string | null; foundPosition: number | null };

interface RegistryApi {
  register(entry: Omit<Registration, 'token'>): symbol;
  unregister(token: symbol): void;
  resolve(input: ResolveInput): ResolveResult;
}

const WinnerChipEndpointRegistryContext = createContext<RegistryApi | null>(null);

export function WinnerChipEndpointRegistryProvider({ children }: { children: ReactNode }) {
  // Table-instance-owned mutable store. Kept in a ref so registrations
  // outside React render cycles (e.g. inside effects) don't churn state.
  const storeRef = useRef<Map<symbol, Registration>>(new Map());

  const api = useMemo<RegistryApi>(() => ({
    register(entry) {
      const token = Symbol('winner-chip-endpoint');
      storeRef.current.set(token, { ...entry, token });
      return token;
    },
    unregister(token) {
      // Identity-safe: only removes the entry whose token matches.
      storeRef.current.delete(token);
    },
    resolve({ playerId = null, position = null }) {
      const entries = Array.from(storeRef.current.values());
      // Prefer full (playerId + position) match; then playerId-only; then position-only.
      // At each tier, any ambiguity is a hard failure — we never silently pick.
      const filters: Array<(r: Registration) => boolean> = [];
      if (playerId != null && position != null) {
        filters.push((r) => r.playerId === playerId && r.position === position);
        filters.push((r) => r.playerId === playerId);
        filters.push((r) => r.position === position);
      } else if (playerId != null) {
        filters.push((r) => r.playerId === playerId);
      } else if (position != null) {
        filters.push((r) => r.position === position);
      } else {
        return { status: 'missing' };
      }
      for (const filter of filters) {
        const matches = entries.filter(filter);
        if (matches.length === 1) {
          const only = matches[0];
          // If caller supplied identity that disagrees with the
          // discovered entry, surface it distinctly rather than
          // accepting a coincidental single match.
          if (
            playerId != null && only.playerId != null && only.playerId !== playerId
          ) {
            return {
              status: 'identity-mismatch',
              foundPlayerId: only.playerId,
              foundPosition: only.position,
            };
          }
          if (
            position != null && only.position != null && only.position !== position
          ) {
            return {
              status: 'identity-mismatch',
              foundPlayerId: only.playerId,
              foundPosition: only.position,
            };
          }
          return {
            status: 'resolved',
            element: only.element,
            playerId: only.playerId,
            position: only.position,
          };
        }
        if (matches.length > 1) {
          return { status: 'ambiguous', count: matches.length };
        }
      }
      return { status: 'missing' };
    },
  }), []);

  return (
    <WinnerChipEndpointRegistryContext.Provider value={api}>
      {children}
    </WinnerChipEndpointRegistryContext.Provider>
  );
}

/**
 * Register a live chip endpoint element. The registration is torn down
 * when the component unmounts OR when any of (playerId, position,
 * element) changes — the previous token is released first and only
 * the new token remains, so cleanup can never delete a newer entry.
 *
 * Safe to call outside a provider (no-op) so consumers rendered in
 * projection-only trees (tests, non-shell surfaces) don't crash.
 */
export function useRegisterWinnerChipEndpoint(input: {
  playerId: string | null | undefined;
  position: number | null | undefined;
  element: HTMLElement | null;
}) {
  const ctx = useContext(WinnerChipEndpointRegistryContext);
  const { playerId, position, element } = input;
  useEffect(() => {
    if (!ctx) return;
    if (!element) return;
    if (playerId == null && position == null) return;
    const token = ctx.register({
      playerId: playerId ?? null,
      position: position ?? null,
      element,
    });
    return () => {
      ctx.unregister(token);
    };
  }, [ctx, playerId, position, element]);
}

/**
 * Table-scoped resolver. Returns a stable callback that reads the live
 * registry at call time — the caller is expected to invoke it at
 * animation start and immediately measure `getBoundingClientRect()` on
 * the returned element.
 */
export function useResolveWinnerChipEndpoint():
  ((input: ResolveInput) => ResolveResult) {
  const ctx = useContext(WinnerChipEndpointRegistryContext);
  return useCallback((input: ResolveInput) => {
    if (!ctx) return { status: 'missing' };
    return ctx.resolve(input);
  }, [ctx]);
}
