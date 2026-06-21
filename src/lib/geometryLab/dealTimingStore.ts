/**
 * Deal Timing — local-only Geometry Lab knobs that tune ONE DEAL motion.
 *
 * Persisted in localStorage, mirroring Geometry Lab overlay-flag persistence.
 * Read at dispatch time by CribbageDealOrchestrator, and at settle time by
 * CardTransportRuntime, so live edits apply to the next deal without reload.
 *
 *   dealLaunchSpacingMs       — gap between successive card launches
 *   dealDurationMs            — translate(0)→translate(dx,dy) flight time
 *   dealOwnershipClaimDelayMs — pause between arrival and destination
 *                               claiming ownership (transport destroyed)
 *
 * Inspect Mode still applies its own (slower) override for visual auditing.
 * Normal play uses these values, which the user can tune in Geometry Lab.
 */

import { useSyncExternalStore } from 'react';

export interface DealTimingConfig {
  launchSpacingMs: number;
  durationMs: number;
  ownershipClaimDelayMs: number;
}

export const DEAL_TIMING_DEFAULTS: DealTimingConfig = {
  launchSpacingMs: 80,
  durationMs: 220,
  ownershipClaimDelayMs: 16,
};

export const DEAL_TIMING_BOUNDS = {
  launchSpacingMs: { min: 20, max: 800, step: 5 },
  durationMs: { min: 75, max: 600, step: 5 },
  ownershipClaimDelayMs: { min: 0, max: 100, step: 1 },
} as const;

const STORAGE_KEY = 'geometryLab.dealTiming.v1';

function clamp(n: number, key: keyof DealTimingConfig): number {
  const b = DEAL_TIMING_BOUNDS[key];
  if (!Number.isFinite(n)) return DEAL_TIMING_DEFAULTS[key];
  return Math.max(b.min, Math.min(b.max, n));
}

function load(): DealTimingConfig {
  if (typeof window === 'undefined') return { ...DEAL_TIMING_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEAL_TIMING_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<DealTimingConfig>;
    return {
      launchSpacingMs: clamp(parsed.launchSpacingMs ?? DEAL_TIMING_DEFAULTS.launchSpacingMs, 'launchSpacingMs'),
      durationMs: clamp(parsed.durationMs ?? DEAL_TIMING_DEFAULTS.durationMs, 'durationMs'),
      ownershipClaimDelayMs: clamp(parsed.ownershipClaimDelayMs ?? DEAL_TIMING_DEFAULTS.ownershipClaimDelayMs, 'ownershipClaimDelayMs'),
    };
  } catch {
    return { ...DEAL_TIMING_DEFAULTS };
  }
}

let snapshot: DealTimingConfig = load();
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export function getDealTiming(): DealTimingConfig {
  return snapshot;
}

export function setDealTiming(next: Partial<DealTimingConfig>) {
  snapshot = {
    launchSpacingMs: clamp(next.launchSpacingMs ?? snapshot.launchSpacingMs, 'launchSpacingMs'),
    durationMs: clamp(next.durationMs ?? snapshot.durationMs, 'durationMs'),
    ownershipClaimDelayMs: clamp(next.ownershipClaimDelayMs ?? snapshot.ownershipClaimDelayMs, 'ownershipClaimDelayMs'),
  };
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch { /* ignore quota errors */ }
  emit();
}

export function resetDealTiming() {
  setDealTiming({ ...DEAL_TIMING_DEFAULTS });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useDealTiming(): DealTimingConfig {
  return useSyncExternalStore(subscribe, getDealTiming, getDealTiming);
}
