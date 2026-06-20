/**
 * SettlementRuntime — drives the canonical settlement phase machine in
 * response to submit()'d intents.
 *
 * Wave 1 behavior:
 *   - When activeIntent is present, the runtime runs an internal timer
 *     for the prelude dwell (if any) → flips to SETTLEMENT → fires
 *     economy + celebration concurrently → flips per-track flags when
 *     each track's minimum dwell expires.
 *   - The barrier (economySettled AND celebrationComplete) lives in
 *     the provider's reducer and flips SETTLEMENT → SETTLEMENT_COMPLETE
 *     automatically when both flags are true.
 *   - No game has called submit() yet in Wave 1 (Cribbage uses shadow
 *     mode), so this runtime is dormant in practice. Mounting it now
 *     gives Wave 2 a working pipeline the moment Cribbage flips.
 *
 * Wave 2+ behavior (not in this commit):
 *   - Economy track will dispatch ChipTransport intents via
 *     useChipTransport() and set economySettled from onAllSettled.
 *   - Celebration track will emit the canonical announcement via
 *     useAnnouncementContext() and set celebrationComplete from the
 *     announcement TTL (or minDurationMs floor, whichever is greater).
 *
 * STATE-ONLY contract: runtime never calls onComplete callbacks.
 * Consumers observe phase from useSettlementPhase().
 */

import { useEffect, useRef } from 'react';
import { useSettlement } from './SettlementProvider';

const DEFAULT_PRELUDE_MS = 1800;
const DEFAULT_CELEBRATION_MS = 2400;
const DEFAULT_ECONOMY_MS = 1200;

export function SettlementRuntime() {
  const { phase, activeIntent, __setPhase, __setFlag } = useSettlement();
  const activeIntentIdRef = useRef<string | null>(null);

  // Prelude dwell → SETTLEMENT.
  useEffect(() => {
    if (phase !== 'PRELUDE' || !activeIntent) return;
    const ms = activeIntent.prelude?.minDurationMs ?? DEFAULT_PRELUDE_MS;
    const t = window.setTimeout(() => {
      __setPhase('SETTLEMENT', 'SettlementRuntime.preludeExpired');
    }, ms);
    return () => window.clearTimeout(t);
  }, [phase, activeIntent, __setPhase]);

  // SETTLEMENT entry: arm economy + celebration timers (Wave 1 stub —
  // synthetic dwell. Wave 2 swaps in ChipTransport.onAllSettled +
  // announcement TTL.).
  useEffect(() => {
    if (phase !== 'SETTLEMENT' || !activeIntent) return;
    // Re-arm only on new intent.
    if (activeIntentIdRef.current === activeIntent.gameId + ':' + activeIntent.handNumber) {
      return;
    }
    activeIntentIdRef.current = activeIntent.gameId + ':' + activeIntent.handNumber;

    const econMs = DEFAULT_ECONOMY_MS;
    const celMs = activeIntent.celebration.minDurationMs ?? DEFAULT_CELEBRATION_MS;
    const econTimer = window.setTimeout(() => {
      __setFlag('economySettled', true, 'SettlementRuntime.economyTrack');
    }, econMs);
    const celTimer = window.setTimeout(() => {
      __setFlag('celebrationComplete', true, 'SettlementRuntime.celebrationTrack');
    }, celMs);
    return () => {
      window.clearTimeout(econTimer);
      window.clearTimeout(celTimer);
    };
  }, [phase, activeIntent, __setFlag]);

  // Clear the per-intent latch when settlement closes.
  useEffect(() => {
    if (phase === 'IDLE' || phase === 'SETTLEMENT_COMPLETE') {
      // Keep latch until a new intent arrives to prevent re-arming on
      // re-render. The submit() path resets phase to PRELUDE/SETTLEMENT
      // with a new intent id, which is the only re-arm trigger.
      if (phase === 'IDLE') activeIntentIdRef.current = null;
    }
  }, [phase]);

  return null;
}
