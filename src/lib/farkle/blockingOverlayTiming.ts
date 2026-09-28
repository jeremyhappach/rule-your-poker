import { registerDomain, useDomainSnapshot } from '@/lib/geometryLab/defaultsRegistry';

/** Shared Farkle-only display timing. It never participates in game authority. */
export interface FarkleBlockingOverlayTiming {
  displayLifetimeMs: number;
}

export const FARKLE_BLOCKING_OVERLAY_TIMING_KEY = 'farkle_blocking_overlay_timing';

export const FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS: FarkleBlockingOverlayTiming = {
  displayLifetimeMs: 1900,
};

export const FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS = {
  displayLifetimeMs: { min: 1200, max: 4000, step: 50 },
} as const;

function clampLifetime(raw: unknown): number {
  const value = Number(raw);
  const { min, max, step } = FARKLE_BLOCKING_OVERLAY_TIMING_BOUNDS.displayLifetimeMs;
  if (!Number.isFinite(value)) return FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS.displayLifetimeMs;
  return Math.round(Math.max(min, Math.min(max, value)) / step) * step;
}

export function sanitizeFarkleBlockingOverlayTiming(raw: unknown): FarkleBlockingOverlayTiming {
  const value = (raw ?? {}) as Partial<Record<keyof FarkleBlockingOverlayTiming, unknown>>;
  return { displayLifetimeMs: clampLifetime(value.displayLifetimeMs) };
}

registerDomain<FarkleBlockingOverlayTiming>({
  key: FARKLE_BLOCKING_OVERLAY_TIMING_KEY,
  defaults: FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS,
  sanitize: sanitizeFarkleBlockingOverlayTiming,
});

/** Runtime reads only the committed Geometry Lab value. */
export function useFarkleBlockingOverlayTiming(): FarkleBlockingOverlayTiming {
  return useDomainSnapshot<FarkleBlockingOverlayTiming>(FARKLE_BLOCKING_OVERLAY_TIMING_KEY);
}
