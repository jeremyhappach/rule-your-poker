/**
 * Geometry Lab — modal-wide draft context (Phase 1).
 *
 * Exactly one draft session per Geometry Lab modal open. Every registered
 * domain shares the same draft session; opening the modal seeds drafts
 * lazily from the COMMITTED snapshot (or, the very first time after the
 * substrate ships and only when the shared row equals the baked
 * baseline, from the device's pre-migration first-paint cache so admins
 * don't silently lose existing edits).
 *
 * Renderer subscribers never observe drafts. Drafts only become visible
 * to renderers when the admin clicks Apply Changes, which triggers a
 * single upsert against `system_settings` (atomic per-domain at this
 * phase — Phase 2 swaps the commit path for a cross-table RPC).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  _setFromLocalCommit,
  getFirstPaintCachedValue,
  getSnapshot,
  hasEverBeenCommitted,
  isBootstrapped,
} from './defaultsRegistry';

interface DraftEntry {
  initial: unknown; // committed snapshot at the moment of first read
  current: unknown;
}

interface DraftContextValue {
  getDraft: <T>(key: string) => T;
  setDraft: <T>(key: string, updater: T | ((prev: T) => T)) => void;
  resetDomain: (key: string) => void;
  isDomainDirty: (key: string) => boolean;
  dirtyKeys: string[];
  isDirty: boolean;
  applying: boolean;
  applyError: string | null;
  applyAll: () => Promise<{ ok: boolean; error?: string }>;
  cancelAll: () => void;
}

const Ctx = createContext<DraftContextValue | null>(null);

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function GeometryLabDraftProvider({ children }: { children: React.ReactNode }) {
  const draftsRef = useRef<Map<string, DraftEntry>>(new Map());
  // Bump to force consumers to re-read drafts. We deliberately do not put
  // the draft map in React state — controls call getDraft on every render.
  const [tick, setTick] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const seedDraft = useCallback((key: string): DraftEntry => {
    const committed = getSnapshot<unknown>(key);
    // Option A — preserve current established device-local values. Only
    // applies before the shared row has ever been committed AND only when
    // the committed snapshot still equals the baked baseline (i.e. row was
    // seeded by the Phase 1 migration). Once an admin commits anywhere,
    // every other device's draft seeds from committed only.
    let initial = committed;
    if (
      isBootstrapped(key) &&
      !hasEverBeenCommitted(key)
    ) {
      const cached = getFirstPaintCachedValue<unknown>(key);
      if (cached != null && !deepEqual(cached, committed)) {
        initial = cached;
      }
    }
    const entry: DraftEntry = { initial: committed, current: initial };
    draftsRef.current.set(key, entry);
    return entry;
  }, []);

  const getDraft = useCallback(<T,>(key: string): T => {
    let e = draftsRef.current.get(key);
    if (!e) e = seedDraft(key);
    return e.current as T;
  }, [seedDraft]);

  const setDraft = useCallback(<T,>(key: string, updater: T | ((prev: T) => T)) => {
    let e = draftsRef.current.get(key);
    if (!e) e = seedDraft(key);
    const next = typeof updater === 'function'
      ? (updater as (p: T) => T)(e.current as T)
      : updater;
    e.current = next;
    setTick((t) => t + 1);
  }, [seedDraft]);

  const resetDomain = useCallback((key: string) => {
    // Reset to baked defaults (the seed). Still a draft — admin must Apply.
    // We pull the defaults via a sentinel: round-trip through getSnapshot
    // would give the committed snapshot, not the seed. Instead, we ask
    // every consumer that calls resetDomain to know its own defaults; the
    // panel passes them via setDraft. To keep the API simple here, this
    // helper just clears the draft so the consumer can re-seed.
    draftsRef.current.delete(key);
    setTick((t) => t + 1);
  }, []);

  const isDomainDirty = useCallback((key: string): boolean => {
    const e = draftsRef.current.get(key);
    if (!e) return false;
    return !deepEqual(e.current, e.initial);
  }, []);

  const dirtyKeys = useMemo(() => {
    // Recomputed when tick changes.
    void tick;
    const out: string[] = [];
    draftsRef.current.forEach((e, k) => {
      if (!deepEqual(e.current, e.initial)) out.push(k);
    });
    return out;
  }, [tick]);

  const isDirty = dirtyKeys.length > 0;

  const cancelAll = useCallback(() => {
    draftsRef.current.clear();
    setApplyError(null);
    setTick((t) => t + 1);
  }, []);

  const applyAll = useCallback(async () => {
    setApplyError(null);
    const keys = dirtyKeys;
    if (keys.length === 0) return { ok: true };

    setApplying(true);
    try {
      // Phase 1: one upsert against `system_settings` carrying every
      // dirty JSON-blob domain. PostgREST executes this as a single
      // statement, so all domains commit or none do.
      const rows = keys.map((k) => ({
        key: k,
        value: draftsRef.current.get(k)!.current as never,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('system_settings')
        .upsert(rows, { onConflict: 'key' });

      if (error) {
        setApplying(false);
        setApplyError(error.message);
        return { ok: false, error: error.message };
      }

      // Optimistic local promotion — realtime echo will reconfirm.
      for (const k of keys) {
        _setFromLocalCommit(k, draftsRef.current.get(k)!.current);
      }
      // Clear drafts; subsequent reads will seed from the new committed.
      draftsRef.current.clear();
      setApplying(false);
      setTick((t) => t + 1);
      return { ok: true };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      setApplying(false);
      setApplyError(msg);
      return { ok: false, error: msg };
    }
  }, [dirtyKeys]);

  const value: DraftContextValue = useMemo(
    () => ({
      getDraft,
      setDraft,
      resetDomain,
      isDomainDirty,
      dirtyKeys,
      isDirty,
      applying,
      applyError,
      applyAll,
      cancelAll,
    }),
    [getDraft, setDraft, resetDomain, isDomainDirty, dirtyKeys, isDirty, applying, applyError, applyAll, cancelAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGeometryLabDraft(): DraftContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useGeometryLabDraft must be used inside <GeometryLabDraftProvider>');
  }
  return v;
}

/**
 * Convenience hook for a single domain. `defaults` is the baked seed —
 * provided by the consumer so Reset can re-seed the draft to the seed
 * value (the registry does not expose seeds directly to keep the API
 * surface narrow).
 */
export function useDomainDraft<T>(key: string, defaults: T) {
  const { getDraft, setDraft, resetDomain, isDomainDirty } = useGeometryLabDraft();
  const value = getDraft<T>(key);
  return {
    value,
    setValue: (updater: T | ((prev: T) => T)) => setDraft<T>(key, updater),
    reset: () => {
      resetDomain(key);
      // Re-seed immediately to the baked defaults so the user sees
      // baseline values before clicking Apply.
      setDraft<T>(key, defaults);
    },
    dirty: isDomainDirty(key),
  };
}
