/**
 * No-Timers — GLOBAL admin harness that disables every timer/deadline-driven
 * auto-advance mechanism while preserving normal (explicit) gameplay paths
 * and presentation-only animations.
 *
 * Canonical persisted key:  `system_settings.key = 'no_timers'`
 * Canonical value shape:    { enabled: boolean }
 *
 * One canonical setting name. All four resolution paths resolve THIS key:
 *   - Geometry Lab draft  →  useDomainDraft(NO_TIMERS_KEY, NO_TIMERS_DEFAULTS)
 *   - system_settings     →  the modal-wide Apply upsert
 *   - Client cache + realtime  →  GeometryLabDefaultsLoader → registerDomain
 *   - Edge-function helper     →  _shared/noTimersPolicy.ts (same key)
 *
 * Cached sync accessor (`isNoTimersEnabledCached`) is safe to call from any
 * non-React path (effects, callbacks, store mutators). React paths should
 * prefer `useNoTimersEnabled()` for reactive updates.
 */

import { useSyncExternalStore } from 'react';
import {
  registerDomain,
  getSnapshot,
  subscribe,
  _setFromLocalCommit,
} from './defaultsRegistry';
import { supabase } from '@/integrations/supabase/client';

export interface NoTimersConfig {
  enabled: boolean;
}

export const NO_TIMERS_KEY = 'no_timers';

export const NO_TIMERS_DEFAULTS: NoTimersConfig = {
  enabled: false,
};

function sanitize(value: unknown): NoTimersConfig {
  const v = (value ?? {}) as Partial<Record<keyof NoTimersConfig, unknown>>;
  return { enabled: v.enabled === true };
}

// In-memory mirror for cheap synchronous reads from non-React code paths
// (Game.tsx effects, edge-function client polling guard, etc.). Kept in
// lock-step with the registry snapshot via `onApply`.
let cached: NoTimersConfig = { ...NO_TIMERS_DEFAULTS };

registerDomain<NoTimersConfig>({
  key: NO_TIMERS_KEY,
  defaults: NO_TIMERS_DEFAULTS,
  sanitize,
  firstPaintCacheKey: 'ptp_no_timers_v1',
  onApply: (next) => {
    cached = next;
    try {
      (window as unknown as { __NO_TIMERS__?: NoTimersConfig }).__NO_TIMERS__ = next;
    } catch { /* SSR safety */ }
  },
});

/** Synchronous accessor for non-React code paths. */
export function isNoTimersEnabledCached(): boolean {
  return cached.enabled === true;
}

/** Reactive hook. Re-renders when the shared snapshot changes. */
export function useNoTimersEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => subscribe<NoTimersConfig>(NO_TIMERS_KEY, () => cb()),
    () => getSnapshot<NoTimersConfig>(NO_TIMERS_KEY).enabled,
    () => getSnapshot<NoTimersConfig>(NO_TIMERS_KEY).enabled,
  );
}

/**
 * Admin instant-write path (Admin Settings → No Timers row).
 * Persists `{ enabled }` to `system_settings.key = 'no_timers'`, then
 * optimistically updates the local snapshot so the UI reflects the new
 * value without waiting for the realtime echo. The realtime channel
 * owned by <GeometryLabDefaultsLoader /> will reconfirm to every client.
 */
export async function setNoTimersEnabled(enabled: boolean): Promise<boolean> {
  const value: NoTimersConfig = { enabled };
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      [{ key: NO_TIMERS_KEY, value: value as unknown as never }],
      { onConflict: 'key' },
    );
  if (error) return false;
  _setFromLocalCommit(NO_TIMERS_KEY, value);
  return true;
}
