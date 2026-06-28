/**
 * Wave 6 — Cribbage Pegging Row Gameplay Artifact settings.
 *
 * Persists Pegging-Row-specific preferences that live OUTSIDE the
 * anchored geometry override row (anchor/origin/size remain in
 * `geometry_overrides`). For now this domain holds one preference:
 *
 *   adaptiveFan: boolean   (default: true)
 *
 * UI contract (Geometry Lab, Gameplay Artifacts → Pegging Row):
 *   - adaptiveFan = true   → hide explicit Fan Overlap input.
 *   - adaptiveFan = false  → show explicit Fan Overlap input
 *                            (persisted as `cardOverlap.cribbage.pegging`).
 *
 * Runtime behavior (DEFERRED):
 *   - The pegging renderer currently flows through `useCardRowLayout`
 *     in `Wave4PeggingRowSlot.tsx` with a hardcoded
 *     `preferredOverlapRatio: 0.18` (see HUDStack adaptive resolver).
 *   - This preference is persisted and broadcast today, but the
 *     renderer does NOT consume it yet. Current visible behaviour is
 *     preserved exactly.
 *   - Planned consumer: `Wave4PeggingRowSlot` will read
 *     `useCribbagePeggingRowSettings().adaptiveFan` and, when false,
 *     swap the adaptive `useCardRowLayout` overlap for the explicit
 *     `cardOverlap.cribbage.pegging` value (varying overlap only — it
 *     does NOT resize cards). Adaptive mode keeps the existing
 *     viewport-proportional fit-to-row behaviour.
 *
 * Persistence: `system_settings` row, key `cribbage.peggingRow` (JSON
 * blob), driven through the standard `GeometryLabDraftProvider` /
 * `useDomainDraft` modal-wide draft contract (Apply / Cancel /
 * realtime).
 */

import { useSyncExternalStore } from 'react';
import { registerDomain, subscribe, getSnapshot } from '@/lib/geometryLab/defaultsRegistry';

export interface CribbagePeggingRowSettings {
  adaptiveFan: boolean;
}

export const CRIBBAGE_PEGGING_ROW_SETTINGS_KEY = 'cribbage.peggingRow';

export const CRIBBAGE_PEGGING_ROW_SETTINGS_DEFAULTS: CribbagePeggingRowSettings = {
  adaptiveFan: true,
};

function sanitize(raw: unknown): CribbagePeggingRowSettings {
  const v = (raw ?? {}) as Partial<Record<keyof CribbagePeggingRowSettings, unknown>>;
  return {
    adaptiveFan:
      typeof v.adaptiveFan === 'boolean'
        ? v.adaptiveFan
        : CRIBBAGE_PEGGING_ROW_SETTINGS_DEFAULTS.adaptiveFan,
  };
}

registerDomain<CribbagePeggingRowSettings>({
  key: CRIBBAGE_PEGGING_ROW_SETTINGS_KEY,
  defaults: CRIBBAGE_PEGGING_ROW_SETTINGS_DEFAULTS,
  sanitize,
  firstPaintCacheKey: 'ptp_cribbage_peggingRow_settings',
});

export function useCribbagePeggingRowSettings(): CribbagePeggingRowSettings {
  return useSyncExternalStore(
    (cb) => subscribe<CribbagePeggingRowSettings>(CRIBBAGE_PEGGING_ROW_SETTINGS_KEY, cb),
    () => getSnapshot<CribbagePeggingRowSettings>(CRIBBAGE_PEGGING_ROW_SETTINGS_KEY),
    () => getSnapshot<CribbagePeggingRowSettings>(CRIBBAGE_PEGGING_ROW_SETTINGS_KEY),
  );
}
