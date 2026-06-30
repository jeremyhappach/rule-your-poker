/**
 * Geometry Lab — Global Defaults Registry (Phase 1).
 *
 * Generic substrate for shared, realtime, admin-edited geometry defaults.
 * One in-memory snapshot per registered domain. Shared values live in
 * `public.system_settings`. The substrate is initialised once at app boot
 * by <GeometryLabDefaultsLoader />, which owns the only realtime channel
 * and the only initial fetch. Writes go through the modal-scoped draft
 * provider (`GeometryLabDraftProvider`); this module exposes
 * read/subscribe + an internal setter the loader and the draft provider
 * call after a successful commit / realtime echo.
 *
 * Authority discipline (Phase 1, JSON-blob domains only):
 *   1. Synchronous seed = spec.defaults so first render is never blank.
 *   2. If spec.firstPaintCacheKey is set, hydrate from localStorage ONCE
 *      to avoid a one-frame flash. This is a first-paint cache only.
 *   3. As soon as the loader's initial fetch returns, the shared
 *      committed snapshot REPLACES whatever the cache produced and
 *      becomes the runtime authority. From that point on, the cache is
 *      only ever rewritten FROM the committed snapshot — never read as
 *      a source of truth.
 *
 * Phase 1 ships JSON-blob storage only (one `system_settings` row per
 * domain). Phase 2 adds a collection adapter for `geometry_overrides`.
 */

import { useSyncExternalStore } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────

export interface DomainSpec<T> {
  /** system_settings.key (also the registry key). */
  key: string;
  /** Synchronous seed used for first render. Must equal LIVE_BASELINE. */
  defaults: T;
  /** Total function; never throws. Used on every remote read + write. */
  sanitize: (raw: unknown) => T;
  /**
   * Optional. If set, the registry hydrates from localStorage[key] on
   * first mount as a first-paint cache. The cache is replaced by the
   * committed snapshot as soon as the loader's initial fetch returns.
   */
  firstPaintCacheKey?: string;
  /** Optional side-effect run after every committed snapshot update. */
  onApply?: (next: T) => void;
}

interface DomainEntry<T = unknown> {
  spec: DomainSpec<T>;
  snapshot: T;
  /**
   * True once the loader has reconciled this domain against the shared
   * row (success OR explicit "no row" decision). Until then, drafts seed
   * from the cache or the seed; after that, drafts seed from the
   * committed shared snapshot only.
   */
  bootstrapped: boolean;
  /** True once an admin has ever committed a write through the modal. */
  everCommitted: boolean;
  listeners: Set<(next: T) => void>;
}

const registry = new Map<string, DomainEntry>();

/**
 * Late-registration observers. The defaults loader subscribes here so it
 * can issue a one-shot fetch for any domain that registers AFTER the
 * loader's initial bulk fetch. Without this hook the loader's captured
 * key set permanently excludes any module imported lazily (e.g. when
 * the consumer component first mounts), and that domain would never
 * receive its committed value or any remote realtime echoes. See
 * GeometryLabDefaultsLoader for the consumer side.
 */
const registrationObservers = new Set<(key: string) => void>();

export function _subscribeRegistrations(
  observer: (key: string) => void,
): () => void {
  registrationObservers.add(observer);
  return () => { registrationObservers.delete(observer); };
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerDomain<T>(spec: DomainSpec<T>): void {
  if (registry.has(spec.key)) {
    // Re-registration is a no-op so HMR + multiple imports stay safe.
    return;
  }

  // 1) Seed.
  let initial: T = spec.defaults;

  // 2) Optional first-paint cache hydration.
  if (spec.firstPaintCacheKey && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(spec.firstPaintCacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        initial = spec.sanitize(parsed);
      }
    } catch {
      /* cache corruption is non-fatal; fall back to seed */
    }
  }

  const entry: DomainEntry<T> = {
    spec,
    snapshot: initial,
    bootstrapped: false,
    everCommitted: false,
    listeners: new Set(),
  };
  registry.set(spec.key, entry as DomainEntry);
  // Apply side-effect for the seed/cache value too.
  try { spec.onApply?.(initial); } catch { /* noop */ }
  // Notify the loader so it can lazily fetch this domain's committed
  // value if the loader has already done its initial bulk fetch.
  registrationObservers.forEach((o) => {
    try { o(spec.key); } catch { /* one bad observer must not break others */ }
  });
}


// ─── Read / subscribe ────────────────────────────────────────────────────

export function getSnapshot<T>(key: string): T {
  const e = registry.get(key);
  if (!e) {
    throw new Error(`[GeometryLabDefaultsRegistry] domain not registered: ${key}`);
  }
  return e.snapshot as T;
}

export function isBootstrapped(key: string): boolean {
  const e = registry.get(key);
  return e ? e.bootstrapped : false;
}

export function hasEverBeenCommitted(key: string): boolean {
  const e = registry.get(key);
  return e ? e.everCommitted : false;
}

export function subscribe<T>(
  key: string,
  listener: (next: T) => void,
): () => void {
  const e = registry.get(key);
  if (!e) {
    throw new Error(`[GeometryLabDefaultsRegistry] domain not registered: ${key}`);
  }
  e.listeners.add(listener as (next: unknown) => void);
  return () => {
    e.listeners.delete(listener as (next: unknown) => void);
  };
}

/** React-friendly subscription. Re-renders when the snapshot changes. */
export function useDomainSnapshot<T>(key: string): T {
  return useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getSnapshot<T>(key),
    () => getSnapshot<T>(key),
  );
}

// ─── Internal mutators (loader + draft provider only) ────────────────────

function dispatch<T>(entry: DomainEntry<T>): void {
  entry.listeners.forEach((l) => {
    try { l(entry.snapshot); } catch { /* one bad subscriber must not break others */ }
  });
  try { entry.spec.onApply?.(entry.snapshot); } catch { /* noop */ }
  // Update first-paint cache from authoritative committed snapshot.
  if (entry.spec.firstPaintCacheKey && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        entry.spec.firstPaintCacheKey,
        JSON.stringify(entry.snapshot),
      );
    } catch { /* noop */ }
  }
}

/** Called by the loader for the initial fetch result and for realtime echoes. */
export function _setFromRemote(
  key: string,
  raw: unknown,
  opts: { isInitialFetch?: boolean; rowExists?: boolean } = {},
): void {
  const e = registry.get(key);
  if (!e) return;
  const next = e.spec.sanitize(raw);
  e.snapshot = next;
  if (opts.isInitialFetch) {
    e.bootstrapped = true;
    // A row existing in system_settings means an admin (or this seed migration)
    // populated it. For Phase 1 / 3-5-7, the seed equals LIVE_BASELINE, so
    // "row exists but equals baseline" is treated as not-yet-committed so
    // pre-migration localStorage values can still seed the first draft.
    if (opts.rowExists && JSON.stringify(next) !== JSON.stringify(e.spec.defaults)) {
      e.everCommitted = true;
    }
  } else {
    // A realtime echo always means an admin committed.
    e.bootstrapped = true;
    e.everCommitted = true;
  }
  dispatch(e);
}

/** Called by the loader when the initial fetch finds no row for this key. */
export function _markBootstrappedNoRow(key: string): void {
  const e = registry.get(key);
  if (!e) return;
  e.bootstrapped = true;
  // snapshot stays as seed/cache; no listener dispatch needed.
}

/** Called by the draft provider after a successful Apply Changes commit. */
export function _setFromLocalCommit(key: string, value: unknown): void {
  const e = registry.get(key);
  if (!e) return;
  const next = e.spec.sanitize(value);
  e.snapshot = next;
  e.bootstrapped = true;
  e.everCommitted = true;
  dispatch(e);
}

// ─── Registry introspection (for loader + diagnostics) ───────────────────

export function listRegisteredKeys(): string[] {
  return Array.from(registry.keys());
}

/** Returns the cached first-paint value (if any) so the modal can offer to
 * seed a draft from pre-migration local edits the very first time an admin
 * opens the panel after the shared substrate ships. The registry treats
 * this purely as a hint — it does NOT influence the runtime snapshot. */
export function getFirstPaintCachedValue<T>(key: string): T | null {
  const e = registry.get(key);
  if (!e || !e.spec.firstPaintCacheKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(e.spec.firstPaintCacheKey);
    if (!raw) return null;
    return e.spec.sanitize(JSON.parse(raw)) as T;
  } catch {
    return null;
  }
}
