/**
 * holmChuckyRevealTimingDbg — Chucky reveal cadence instrumentation.
 *
 * WAR-TIME. No behavior change. Compares the actual reveal cadence
 * driven by the local stepper effect against the configured values in
 * the `game_defaults` table (chucky_second_to_last_delay_seconds,
 * chucky_last_card_delay_seconds).
 *
 * Emits into the Holm timeline:
 *   - CHUCKY_REVEAL_START      (first arm of a hand's stepper)
 *   - CHUCKY_REVEAL_TIMER_ARM  (every setTimeout(arm))
 *   - CHUCKY_REVEAL_STEP       (every reveal advance, with dt)
 *   - CHUCKY_REVEAL_CONFIG_MISMATCH (when |actual - configured| > 25ms)
 *   - CHUCKY_REVEAL_CONFIG_UNWIRED  (when configured exists but stepper
 *                                    uses a hardcoded value)
 *
 * The configured snapshot is lazily fetched from supabase on first arm
 * and cached process-wide. Failures are recorded but never throw.
 */

import { supabase } from '@/integrations/supabase/client';
import { recordHolmTimelineEvent } from './holmWartimeForensics';

interface ChuckyTimingConfig {
  /** seconds (DB) → ms. Last-card pause = first reveal delay equivalent. */
  lastCardDelayMs: number | null;
  /** seconds (DB) → ms. Second-to-last delay = step cadence equivalent. */
  secondToLastDelayMs: number | null;
  source: 'gameDefaults' | 'fallback' | 'fetch-failed' | 'pending';
  fetchedAt: number | null;
}

const STATE = {
  config: null as ChuckyTimingConfig | null,
  fetching: false as boolean,
  // Per-hand bookkeeping for dt calculation and "first arm" detection.
  perHand: new Map<string, { lastFireAt: number | null; armCount: number; startEmitted: boolean }>(),
};

const MISMATCH_TOLERANCE_MS = 25;

async function fetchChuckyConfig(): Promise<void> {
  if (STATE.fetching || STATE.config?.source === 'gameDefaults') return;
  STATE.fetching = true;
  try {
    const { data, error } = await supabase
      .from('game_defaults')
      .select('chucky_second_to_last_delay_seconds, chucky_last_card_delay_seconds')
      .eq('game_type', 'holm')
      .maybeSingle();
    if (error || !data) {
      STATE.config = {
        lastCardDelayMs: null,
        secondToLastDelayMs: null,
        source: 'fetch-failed',
        fetchedAt: performance.now(),
      };
      return;
    }
    const last = Number((data as any).chucky_last_card_delay_seconds);
    const second = Number((data as any).chucky_second_to_last_delay_seconds);
    STATE.config = {
      lastCardDelayMs: Number.isFinite(last) ? last * 1000 : null,
      secondToLastDelayMs: Number.isFinite(second) ? second * 1000 : null,
      source: 'gameDefaults',
      fetchedAt: performance.now(),
    };
  } catch {
    STATE.config = {
      lastCardDelayMs: null,
      secondToLastDelayMs: null,
      source: 'fetch-failed',
      fetchedAt: performance.now(),
    };
  } finally {
    STATE.fetching = false;
  }
}

function ensureFetch(): void {
  if (!STATE.config && !STATE.fetching) {
    STATE.config = {
      lastCardDelayMs: null,
      secondToLastDelayMs: null,
      source: 'pending',
      fetchedAt: null,
    };
    void fetchChuckyConfig();
  }
}

function getHandState(handContextId: string) {
  let s = STATE.perHand.get(handContextId);
  if (!s) {
    s = { lastFireAt: null, armCount: 0, startEmitted: false };
    STATE.perHand.set(handContextId, s);
  }
  return s;
}

/** Call when a stepper arm() runs (setTimeout(...) has been queued). */
export function recordChuckyRevealTimerArm(args: {
  handContextId: string | null;
  delayMs: number;
  index: number;
  total: number;
  /** Origin of the delay value used by the stepper. */
  delaySource: 'hardcoded' | 'gameDefaults' | 'fallback';
}): void {
  if (!args.handContextId) return;
  ensureFetch();
  const cfg = STATE.config;
  const handState = getHandState(args.handContextId);
  handState.armCount += 1;

  // Configured step value selection:
  //   index === total - 1  → last card pause uses lastCardDelayMs
  //   otherwise            → secondToLastDelayMs (step cadence)
  const isLast = args.index === args.total - 1;
  const configuredMs = cfg
    ? isLast
      ? cfg.lastCardDelayMs
      : cfg.secondToLastDelayMs
    : null;

  // First arm of the hand → emit CHUCKY_REVEAL_START.
  if (!handState.startEmitted) {
    handState.startEmitted = true;
    recordHolmTimelineEvent(
      'CHUCKY_REVEAL_START',
      {
        handContextId: args.handContextId,
        configuredInitialDelayMs: configuredMs,
        configuredStepMs: cfg?.secondToLastDelayMs ?? null,
        configuredLastCardMs: cfg?.lastCardDelayMs ?? null,
        actualInitialDelayMs: args.delayMs,
        source: args.delaySource,
        configSource: cfg?.source ?? 'pending',
      },
      args.handContextId,
    );
    if (cfg?.source === 'gameDefaults' && args.delaySource !== 'gameDefaults') {
      recordHolmTimelineEvent(
        'CHUCKY_REVEAL_CONFIG_UNWIRED',
        {
          handContextId: args.handContextId,
          configuredInitialDelayMs: configuredMs,
          configuredStepMs: cfg.secondToLastDelayMs,
          configuredLastCardMs: cfg.lastCardDelayMs,
          actualUsedMs: args.delayMs,
          actualSource: args.delaySource,
          note: 'game_defaults row exists but stepper used a hardcoded delay',
        },
        args.handContextId,
      );
    }
  }

  recordHolmTimelineEvent(
    'CHUCKY_REVEAL_TIMER_ARM',
    {
      handContextId: args.handContextId,
      index: args.index,
      total: args.total,
      armCount: handState.armCount,
      delayMs: args.delayMs,
      source: args.delaySource,
      configuredStepMs: configuredMs,
      configSource: cfg?.source ?? 'pending',
    },
    args.handContextId,
  );
}

/** Call when a stepper timer FIRES and reveal index advances. */
export function recordChuckyRevealStep(args: {
  handContextId: string | null;
  index: number;
  total: number;
  configuredStepMs?: number | null;
  actualDelayUsedMs: number;
  source: 'hardcoded' | 'gameDefaults' | 'fallback';
}): void {
  if (!args.handContextId) return;
  const cfg = STATE.config;
  const handState = getHandState(args.handContextId);
  const now = performance.now();
  const dt = handState.lastFireAt == null ? null : now - handState.lastFireAt;
  handState.lastFireAt = now;

  const isLast = args.index === args.total - 1;
  const configuredMs =
    args.configuredStepMs !== undefined
      ? args.configuredStepMs
      : cfg
        ? isLast
          ? cfg.lastCardDelayMs
          : cfg.secondToLastDelayMs
        : null;

  recordHolmTimelineEvent(
    'CHUCKY_REVEAL_STEP',
    {
      handContextId: args.handContextId,
      index: args.index,
      total: args.total,
      dtFromPreviousReveal: dt,
      actualDelayUsedMs: args.actualDelayUsedMs,
      configuredStepMs: configuredMs,
      source: args.source,
      configSource: cfg?.source ?? 'pending',
    },
    args.handContextId,
  );

  // CHUCKY_REVEAL_CONFIG_MISMATCH — only meaningful when we have a
  // configured value to compare. Tolerance ±25ms.
  if (configuredMs != null && Number.isFinite(configuredMs)) {
    const diff = Math.abs(args.actualDelayUsedMs - configuredMs);
    if (diff > MISMATCH_TOLERANCE_MS) {
      recordHolmTimelineEvent(
        'CHUCKY_REVEAL_CONFIG_MISMATCH',
        {
          handContextId: args.handContextId,
          index: args.index,
          configuredMs,
          actualMs: args.actualDelayUsedMs,
          diffMs: diff,
          toleranceMs: MISMATCH_TOLERANCE_MS,
          source: args.source,
          configSource: cfg?.source ?? 'pending',
        },
        args.handContextId,
      );
    }
  }
}

export function resetChuckyRevealTimingForHand(handContextId: string | null): void {
  if (!handContextId) return;
  STATE.perHand.delete(handContextId);
}

export function __debugGetChuckyTimingConfig(): ChuckyTimingConfig | null {
  return STATE.config;
}
