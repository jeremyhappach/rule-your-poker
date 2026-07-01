/**
 * Gin helper-text coupling settings.
 *
 * Helper text is NOT an independently anchored felt artifact. It is a
 * child of the stock pile and travels with it whenever Stock/Discard
 * geometry moves. Its only independent geometry is:
 *
 *   - placement:  Above | Below | Left | Right (edge of stock pile)
 *   - offsetPct:  fractional offset expressed as % of the resolved
 *                 stock-pile card size (card HEIGHT for Above/Below,
 *                 card WIDTH for Left/Right).
 *
 * There is no helper-text X/Y anchor. There are no hardcoded pixels
 * or viewport offsets. Follows the same GeometryLab defaults contract
 * as `activeHandLayoutSettings` — persisted as a `system_settings`
 * row, seeded/hydrated by `GeometryLabDefaultsLoader`, edited through
 * `GeometryLabDraftProvider`, and applied atomically on Apply.
 */

import { useSyncExternalStore } from 'react';
import {
  registerDomain,
  subscribe,
  getSnapshot,
} from '@/lib/geometryLab/defaultsRegistry';

export type GinHelperTextPlacement = 'Above' | 'Below' | 'Left' | 'Right';

export interface GinHelperTextSettings {
  placement: GinHelperTextPlacement;
  /** Offset as a fraction of the resolved stock-pile card size. */
  offsetPct: number;
}

export const GIN_HELPER_TEXT_KEY = 'ginHelperText' as const;
export const GIN_HELPER_TEXT_CACHE_KEY = 'ptp_ginHelperText' as const;

export const GIN_HELPER_TEXT_DEFAULTS: GinHelperTextSettings = {
  placement: 'Below',
  offsetPct: 0.12,
};

const PLACEMENTS: readonly GinHelperTextPlacement[] = [
  'Above',
  'Below',
  'Left',
  'Right',
];

function sanitize(raw: unknown): GinHelperTextSettings {
  const v = (raw ?? {}) as Partial<Record<keyof GinHelperTextSettings, unknown>>;
  const placement = PLACEMENTS.includes(v.placement as GinHelperTextPlacement)
    ? (v.placement as GinHelperTextPlacement)
    : GIN_HELPER_TEXT_DEFAULTS.placement;
  const rawOffset = typeof v.offsetPct === 'number' && Number.isFinite(v.offsetPct)
    ? v.offsetPct
    : GIN_HELPER_TEXT_DEFAULTS.offsetPct;
  const offsetPct = Math.max(-2, Math.min(2, rawOffset));
  return { placement, offsetPct };
}

registerDomain<GinHelperTextSettings>({
  key: GIN_HELPER_TEXT_KEY,
  defaults: GIN_HELPER_TEXT_DEFAULTS,
  sanitize,
  firstPaintCacheKey: GIN_HELPER_TEXT_CACHE_KEY,
});

export function useGinHelperTextSettings(): GinHelperTextSettings {
  return useSyncExternalStore(
    (cb) => subscribe<GinHelperTextSettings>(GIN_HELPER_TEXT_KEY, cb),
    () => getSnapshot<GinHelperTextSettings>(GIN_HELPER_TEXT_KEY),
    () => getSnapshot<GinHelperTextSettings>(GIN_HELPER_TEXT_KEY),
  );
}

/**
 * Compute the absolutely-positioned style for the helper text element
 * relative to the FULL Stock + Discard cluster slot (the anchored rect
 * owned by `gin.stockDiscardGroup`). The parent must be
 * `position: relative` and sized to the cluster's assigned rect —
 * i.e. `union(stockPileRect, discardPileRect)`, which is exactly the
 * slot produced by `GinAnchoredSlot artifactId="gin.stockDiscardGroup"`.
 *
 * Above/Below → horizontally centered on cluster, offset from the
 *   selected cluster edge by `offsetPct × pileCardHeightPx`.
 * Left/Right → vertically centered on cluster, offset from the
 *   selected cluster edge by `offsetPct × pileCardWidthPx`.
 *
 * There is a single offset scalar. No independent X/Y. No independent
 * helper-text anchor — placement selects the cluster edge, and the
 * helper text follows every cluster placement change automatically.
 */
export function resolveGinHelperTextStyle(
  s: GinHelperTextSettings,
  pileCardSizePx: { widthPx: number; heightPx: number },
): React.CSSProperties {
  const dxPx = s.offsetPct * pileCardSizePx.widthPx;
  const dyPx = s.offsetPct * pileCardSizePx.heightPx;
  switch (s.placement) {
    case 'Above':
      return {
        position: 'absolute',
        bottom: `calc(100% + ${dyPx.toFixed(3)}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
      };
    case 'Below':
      return {
        position: 'absolute',
        top: `calc(100% + ${dyPx.toFixed(3)}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
      };
    case 'Left':
      return {
        position: 'absolute',
        right: `calc(100% + ${dxPx.toFixed(3)}px)`,
        top: '50%',
        transform: 'translateY(-50%)',
      };
    case 'Right':
      return {
        position: 'absolute',
        left: `calc(100% + ${dxPx.toFixed(3)}px)`,
        top: '50%',
        transform: 'translateY(-50%)',
      };
  }
}
