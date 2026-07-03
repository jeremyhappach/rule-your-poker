/**
 * Gin stock remaining-count coupling settings.
 *
 * The stock remaining count is NOT an independently anchored felt
 * artifact. It is part of the stock/discard cluster assembly
 * (`count + stock card + discard destination`) and travels with the
 * cluster whenever cluster geometry moves. Its only independent
 * geometry is:
 *
 *   - placement:   left-center | top-center (default left-center)
 *   - gapPx:       gap in px between count and stock card
 *   - verticalTrimPx: small vertical trim used ONLY for left-center
 *                    placement (positive nudges down, negative up)
 *
 * Changing placement/gap MUST NOT alter stock/discard transport
 * anchors, hit targets, or any game logic.
 *
 * Follows the same GeometryLab defaults contract as
 * `helperTextSettings` — persisted through the shared defaults
 * registry, hydrated by GeometryLabDefaultsLoader, edited via
 * GeometryLabDraftProvider, applied atomically on Apply, and
 * propagated to every connected client through the standard
 * realtime echo.
 */

import { useSyncExternalStore } from 'react';
import {
  registerDomain,
  subscribe,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';

export type GinStockCountPlacement = 'left-center' | 'top-center';

export interface GinStockCountSettings {
  placement: GinStockCountPlacement;
  gapPx: number;
  /** Small vertical trim in px used ONLY when placement is 'left-center'. */
  verticalTrimPx: number;
}

export const GIN_STOCK_COUNT_KEY = 'ginStockCount' as const;
export const GIN_STOCK_COUNT_CACHE_KEY = 'ptp_ginStockCount' as const;

export const GIN_STOCK_COUNT_DEFAULTS: GinStockCountSettings = {
  placement: 'left-center',
  gapPx: 4,
  verticalTrimPx: 0,
};

const PLACEMENTS: readonly GinStockCountPlacement[] = ['left-center', 'top-center'];

function sanitize(raw: unknown): GinStockCountSettings {
  const v = (raw ?? {}) as Partial<Record<keyof GinStockCountSettings, unknown>>;
  const placement = PLACEMENTS.includes(v.placement as GinStockCountPlacement)
    ? (v.placement as GinStockCountPlacement)
    : GIN_STOCK_COUNT_DEFAULTS.placement;
  const gapRaw = typeof v.gapPx === 'number' && Number.isFinite(v.gapPx)
    ? v.gapPx
    : GIN_STOCK_COUNT_DEFAULTS.gapPx;
  const gapPx = Math.max(0, Math.min(64, gapRaw));
  const trimRaw = typeof v.verticalTrimPx === 'number' && Number.isFinite(v.verticalTrimPx)
    ? v.verticalTrimPx
    : GIN_STOCK_COUNT_DEFAULTS.verticalTrimPx;
  const verticalTrimPx = Math.max(-32, Math.min(32, trimRaw));
  return { placement, gapPx, verticalTrimPx };
}

registerDomain<GinStockCountSettings>({
  key: GIN_STOCK_COUNT_KEY,
  defaults: GIN_STOCK_COUNT_DEFAULTS,
  sanitize,
  firstPaintCacheKey: GIN_STOCK_COUNT_CACHE_KEY,
});

export function useGinStockCountSettings(): GinStockCountSettings {
  return useSyncExternalStore(
    (cb) => subscribe<GinStockCountSettings>(GIN_STOCK_COUNT_KEY, cb),
    () => getSnapshot<GinStockCountSettings>(GIN_STOCK_COUNT_KEY),
    () => getSnapshot<GinStockCountSettings>(GIN_STOCK_COUNT_KEY),
  );
}

/**
 * Absolutely-positioned style for the count element relative to the
 * stock card rect. Parent must be `position: relative` and sized to
 * the stock-card rect.
 */
export function resolveGinStockCountStyle(
  s: GinStockCountSettings,
): React.CSSProperties {
  switch (s.placement) {
    case 'top-center':
      return {
        position: 'absolute',
        bottom: `calc(100% + ${s.gapPx.toFixed(2)}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      };
    case 'left-center':
    default:
      return {
        position: 'absolute',
        right: `calc(100% + ${s.gapPx.toFixed(2)}px)`,
        top: `calc(50% + ${s.verticalTrimPx.toFixed(2)}px)`,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      };
  }
}
