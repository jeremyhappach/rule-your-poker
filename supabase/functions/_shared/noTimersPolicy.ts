// supabase/functions/_shared/noTimersPolicy.ts
//
// No-Timers global harness — edge-function policy resolver.
//
// Canonical persisted key: `system_settings.key = 'no_timers'`
// (same key the client reads via `src/lib/geometryLab/noTimersStore.ts`).
//
// Both `enforce-deadlines` (client-driven slim path) and
// `enforce-all-deadlines` (cron-driven comprehensive path) MUST call
// `isNoTimersEnabled(supabase)` once per invocation and short-circuit
// BEFORE performing any mutation (RPCs, updates, etc.) when it returns
// true. Existing deadlines are intentionally left intact so flipping
// the harness OFF restores normal behavior on the next tick.
//
// Failure mode: if the fetch errors, we conservatively return `false`
// so production safety nets keep running.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function isNoTimersEnabled(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "no_timers")
      .maybeSingle();
    if (error || !data?.value) return false;
    const v = data.value as { enabled?: unknown };
    return v?.enabled === true;
  } catch {
    return false;
  }
}
