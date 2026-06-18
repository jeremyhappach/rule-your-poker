/**
 * DEBUG UI VISIBILITY
 *
 * Visibility of debug pills, badges, trays, and trace controls is mapped to
 * the admin-controlled Global Debug Mode (system_settings.debug_mode) — the
 * same gate that arms debug harnesses. When Global Debug Mode is OFF, all
 * debug overlays are hidden; instrumentation/logging is unaffected.
 *
 * Usage in components:
 *   const hidden = useHideDebugUI();
 *   if (hidden) return null;
 *
 * Legacy `HIDE_DEBUG_UI` constant is retained as a synchronous snapshot
 * (reads the current cached value) for non-reactive call sites only. Prefer
 * the hook in any React tree so toggles propagate live.
 */

import { useEffect, useState } from 'react';
import {
  ensureHarnessCacheLoaded,
  isGlobalDebugModeCached,
  isGlobalDebugModeLoaded,
  subscribeGlobalDebugMode,
} from '@/lib/debugHarness/runtimeCache';

export function useHideDebugUI(): boolean {
  const [enabled, setEnabled] = useState<boolean>(isGlobalDebugModeCached());
  useEffect(() => {
    if (!isGlobalDebugModeLoaded()) void ensureHarnessCacheLoaded();
    setEnabled(isGlobalDebugModeCached());
    const unsub = subscribeGlobalDebugMode((v) => setEnabled(v));
    return () => { unsub(); };
  }, []);
  return !enabled;
}

/** @deprecated Non-reactive snapshot. Prefer useHideDebugUI(). */
export const HIDE_DEBUG_UI = false;
