export type AuthoritativeRealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | string;

interface LatestAuthoritativeLoaderOptions<T> {
  load: (source: string) => Promise<T>;
  apply: (value: T, source: string) => void;
  onError?: (error: unknown, source: string) => void;
}

export interface LatestAuthoritativeLoader {
  refresh: (source: string) => Promise<boolean>;
  invalidate: () => void;
  dispose: () => void;
}

export type AuthoritativeRecoverySource =
  | 'visibility'
  | 'focus'
  | 'pageshow'
  | 'online'
  | 'realtime_reconnect'
  | 'realtime_fallback'
  | 'action_surface_mismatch';

const AUTHORITATIVE_RECOVERY_EVENT = 'app:authoritative-recovery-snapshot';

export function dispatchAuthoritativeRecoverySnapshot(source: AuthoritativeRecoverySource): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTHORITATIVE_RECOVERY_EVENT, { detail: { source } }));
}

export function subscribeAuthoritativeRecoverySnapshot(
  listener: (source: AuthoritativeRecoverySource) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleRecovery = (event: Event) => {
    const source = (event as CustomEvent<{ source?: AuthoritativeRecoverySource }>).detail?.source;
    if (source) listener(source);
  };
  window.addEventListener(AUTHORITATIVE_RECOVERY_EVENT, handleRecovery);
  return () => window.removeEventListener(AUTHORITATIVE_RECOVERY_EVENT, handleRecovery);
}

/**
 * Applies exact authoritative snapshots monotonically. A newer successful read
 * supersedes an older one, while a newer failed read cannot erase an older
 * successful snapshot that is still valid.
 */
export function createLatestAuthoritativeLoader<T>(
  options: LatestAuthoritativeLoaderOptions<T>,
): LatestAuthoritativeLoader {
  let generation = 0;
  let latestAppliedGeneration = 0;
  let invalidatedThroughGeneration = 0;
  let disposed = false;

  // A reconnect, a parent recovery notification, and a Postgres UPDATE can
  // legitimately arrive together. They describe one exact identity, so do not
  // fan them out into concurrent projection reads. Keep one read in flight and
  // retain only the latest trigger for one immediately-following read. That
  // follow-up is important: it cannot be replaced with a cache because a write
  // may have committed while the first read was running.
  let inFlightRefresh: Promise<boolean> | null = null;
  let queuedRefresh: { source: string; resolvers: Array<(result: boolean) => void> } | null = null;

  const runRefresh = async (source: string): Promise<boolean> => {
    const requestGeneration = ++generation;
    try {
      const value = await options.load(source);
      // A request is obsolete only when a newer snapshot actually applied,
      // or an authoritative Realtime payload explicitly invalidated it.
      // Merely starting a newer request must not erase an older successful
      // snapshot when the newer request fails.
      if (
        disposed
        || requestGeneration <= invalidatedThroughGeneration
        || requestGeneration < latestAppliedGeneration
      ) return false;
      latestAppliedGeneration = requestGeneration;
      options.apply(value, source);
      return true;
    } catch (error) {
      if (!disposed && requestGeneration === generation) {
        options.onError?.(error, source);
      }
      return false;
    }
  };

  const startRefresh = (source: string): Promise<boolean> => {
    const request = runRefresh(source);
    inFlightRefresh = request;
    void request.then((result) => {
      if (inFlightRefresh !== request) return;
      inFlightRefresh = null;
      const queued = queuedRefresh;
      queuedRefresh = null;
      if (!queued) return;
      if (disposed) {
        queued.resolvers.forEach((resolve) => resolve(false));
        return;
      }
      void startRefresh(queued.source).then((nextResult) => {
        queued.resolvers.forEach((resolve) => resolve(nextResult));
      });
    });
    return request;
  };

  return {
    refresh(source: string): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (inFlightRefresh) {
        return new Promise<boolean>((resolve) => {
          if (queuedRefresh) {
            queuedRefresh.source = source;
            queuedRefresh.resolvers.push(resolve);
            return;
          }
          queuedRefresh = { source, resolvers: [resolve] };
        });
      }
      return startRefresh(source);
    },
    invalidate(): void {
      invalidatedThroughGeneration = generation;
      generation += 1;
      const queued = queuedRefresh;
      queuedRefresh = null;
      queued?.resolvers.forEach((resolve) => resolve(false));
    },
    dispose(): void {
      disposed = true;
      invalidatedThroughGeneration = generation;
      generation += 1;
      const queued = queuedRefresh;
      queuedRefresh = null;
      queued?.resolvers.forEach((resolve) => resolve(false));
    },
  };
}

interface RealtimeStatusOptions {
  source: string;
  catchUp: (source: string) => Promise<unknown>;
  onUnavailable?: (status: string, error?: unknown) => void;
}

export function isAuthoritativeRealtimeUnavailable(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
}

/**
 * Every successful channel join closes its fetch-before-subscribe blind window
 * with an exact snapshot. Supabase emits SUBSCRIBED again after reconnect, so
 * the same owner also repairs missed edges without a fallback poll.
 */
export function handleAuthoritativeRealtimeStatus(
  status: AuthoritativeRealtimeStatus,
  error: unknown,
  options: RealtimeStatusOptions,
): void {
  if (status === 'SUBSCRIBED') {
    void options.catchUp('realtime-subscribed-catchup').catch((catchUpError) => {
      console.warn(`[REALTIME_CATCHUP] ${options.source} authoritative snapshot failed`, catchUpError);
    });
    return;
  }

  if (isAuthoritativeRealtimeUnavailable(status)) {
    // Keep the full Supabase error object: structured cause/name fields are
    // frequently more useful than error.message alone.
    console.warn(`[REALTIME_CATCHUP] ${options.source} channel unavailable`, { status, error });
    options.onUnavailable?.(status, error);
  }
}
