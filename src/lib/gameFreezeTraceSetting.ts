/**
 * Shared Game Freeze Trace visibility gate.
 *
 * This is deliberately separate from harnesses and the Debug Tray's local
 * pill preferences.  The shared `system_settings.game_freeze_trace` value
 * controls whether players can see the player-operated recorder.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const GAME_FREEZE_TRACE_KEY = 'game_freeze_trace';

let enabled = false;
let loaded = false;
let loadPromise: Promise<void> | null = null;
let realtimeBound = false;
const listeners = new Set<() => void>();

function publish(next: boolean): void {
  if (enabled === next && loaded) return;
  enabled = next;
  loaded = true;
  listeners.forEach((listener) => listener());
}

function bindRealtime(): void {
  if (realtimeBound) return;
  realtimeBound = true;
  try {
    supabase
      .channel('game-freeze-trace-setting')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: `key=eq.${GAME_FREEZE_TRACE_KEY}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { value?: { enabled?: boolean } } | undefined;
          publish(row?.value?.enabled === true);
        },
      )
      .subscribe();
  } catch {
    // A diagnostic control must never interfere with the game route.
  }
}

export async function ensureGameFreezeTraceSettingLoaded(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', GAME_FREEZE_TRACE_KEY)
        .maybeSingle();
      if (!error) publish((data?.value as { enabled?: boolean } | null)?.enabled === true);
    } finally {
      bindRealtime();
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export function isGameFreezeTraceEnabled(): boolean {
  return enabled;
}

export function subscribeGameFreezeTraceSetting(listener: () => void): () => void {
  listeners.add(listener);
  void ensureGameFreezeTraceSettingLoaded();
  return () => listeners.delete(listener);
}

export function useGameFreezeTraceEnabled(): boolean {
  return useSyncExternalStore(
    subscribeGameFreezeTraceSetting,
    isGameFreezeTraceEnabled,
    isGameFreezeTraceEnabled,
  );
}

export async function setGameFreezeTraceEnabled(next: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      [{ key: GAME_FREEZE_TRACE_KEY, value: { enabled: next } as never }],
      { onConflict: 'key' },
    );
  if (error) return false;
  publish(next);
  return true;
}
