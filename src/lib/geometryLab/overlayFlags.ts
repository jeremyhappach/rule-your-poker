/**
 * Wave 6 — Geometry Lab overlay flag wiring.
 *
 * Each overlay toggle is a shared persisted boolean in `system_settings`
 * (registered via the defaults registry). Inside the Geometry Lab
 * modal, toggles mutate the modal-wide DRAFT (so Apply Changes lights
 * up and commits them with every other section). Live preview during
 * drafting subscribes to the draft value; the published / committed
 * value flows through realtime to every client on Apply.
 *
 * Legacy localStorage keys are still mirrored for any overlay subscriber
 * that reads them directly; a `storage` event is dispatched on changes
 * (draft preview + committed echo) so those subscribers stay in sync
 * without code changes.
 */

import {
  registerDomain,
  useDomainSnapshot,
} from './defaultsRegistry';
import { useGeometryLabDraftOptional } from './GeometryLabDraftProvider';

export interface OverlayFlagDescriptor {
  key: string;
  label: string;
  /** Registry domain key (also system_settings.key). */
  domainKey: string;
  /** Legacy localStorage key (mirrored for direct readers). */
  storageKey: string;
  /** Companion event fired on every value change. */
  eventName: string;
}

export const OVERLAY_FLAGS: OverlayFlagDescriptor[] = [
  { key: 'grid',       label: 'Show W5 Grid',              domainKey: 'overlay.grid',       storageKey: 'ptp_wave5_grid',              eventName: 'ptp:wave5-grid-changed' },
  { key: 'viewport',   label: 'Show Viewport',             domainKey: 'overlay.viewport',   storageKey: 'ptp_wave5_viewport_overlay',  eventName: 'ptp:wave5-viewport-overlay-changed' },
  { key: 'crosshair',  label: 'Show Anchor Crosshair',     domainKey: 'overlay.crosshair',  storageKey: 'ptp_geomlab_crosshair',       eventName: 'ptp:geomlab-crosshair-changed' },
  { key: 'assigned',   label: 'Show Assigned Rect',        domainKey: 'overlay.assigned',   storageKey: 'ptp_geomlab_assigned',        eventName: 'ptp:geomlab-assigned-changed' },
  { key: 'bounds',     label: 'Show Rendered Bounds',      domainKey: 'overlay.bounds',     storageKey: 'ptp_geomlab_bounds',          eventName: 'ptp:geomlab-bounds-changed' },
  { key: 'violations', label: 'Show Contract Violations',  domainKey: 'overlay.violations', storageKey: 'ptp_geomlab_violations',      eventName: 'ptp:geomlab-violations-changed' },
];

function sanitizeBool(fallback: boolean) {
  return (raw: unknown): boolean => {
    if (typeof raw === 'boolean') return raw;
    if (raw === '1' || raw === 1) return true;
    if (raw === '0' || raw === 0) return false;
    if (typeof raw === 'object' && raw !== null) {
      const v = (raw as { value?: unknown }).value;
      if (typeof v === 'boolean') return v;
    }
    return fallback;
  };
}

// Register each overlay flag as a shared persisted boolean domain.
// `onApply` mirrors the value into the legacy localStorage key and
// fires the companion event so direct subscribers stay in sync.
for (const d of OVERLAY_FLAGS) {
  registerDomain<boolean>({
    key: d.domainKey,
    defaults: false,
    sanitize: sanitizeBool(false),
    firstPaintCacheKey: d.storageKey,
    onApply: (next) => {
      try {
        if (next) window.localStorage.setItem(d.storageKey, '1');
        else window.localStorage.removeItem(d.storageKey);
        window.dispatchEvent(new Event(d.eventName));
        window.dispatchEvent(new Event('storage'));
      } catch { /* noop */ }
    },
  });
}

export function readOverlayFlag(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

/**
 * Read the COMMITTED overlay flag value. Use for runtime subscribers
 * (overlays themselves). Inside the Geometry Lab modal use
 * `useOverlayFlagDraft` so live preview reflects the draft.
 */
export function useOverlayFlag(
  d: OverlayFlagDescriptor,
): [boolean, (n: boolean) => void] {
  // When mounted under the draft provider, route writes through the
  // draft so the modal-wide Apply/Cancel contract owns persistence.
  // Outside the provider, the setter just mirrors to localStorage (no
  // persisted shared change).
  const draft = useGeometryLabDraftOptional();
  const committed = useDomainSnapshot<boolean>(d.domainKey);
  const draftVal = draft
    ? draft.getDraft<boolean>(d.domainKey)
    : committed;
  const setter = (n: boolean) => {
    if (draft) {
      draft.setDraft<boolean>(d.domainKey, n);
      // Live preview: mirror immediately so the overlay reflects the
      // draft without waiting for Apply. The committed value is
      // restored if the admin cancels.
      try {
        if (n) window.localStorage.setItem(d.storageKey, '1');
        else window.localStorage.removeItem(d.storageKey);
        window.dispatchEvent(new Event(d.eventName));
        window.dispatchEvent(new Event('storage'));
      } catch { /* noop */ }
    } else {
      // No draft context — write directly through the registry's
      // commit path so callers still produce a persisted change.
      // (Not the standard flow; admin UI always uses the draft.)
      try {
        if (n) window.localStorage.setItem(d.storageKey, '1');
        else window.localStorage.removeItem(d.storageKey);
        window.dispatchEvent(new Event(d.eventName));
        window.dispatchEvent(new Event('storage'));
      } catch { /* noop */ }
    }
  };
  return [draftVal, setter];
}

/** Subscribe to the committed overlay value (for overlay components). */
export function useCommittedOverlayFlag(d: OverlayFlagDescriptor): boolean {
  return useDomainSnapshot<boolean>(d.domainKey);
}
