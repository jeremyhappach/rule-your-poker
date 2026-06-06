/**
 * waitingTableFlight — instrumentation-only helpers for the
 *   WAITING TABLE → INTERSTITIAL → DEALER SELECTION → DEALER CONFIG → GAMEPLAY
 * transition. NO behavior changes.
 *
 * All events are routed through the existing
 *   `StartupFlightRecorderOverlay`
 * (mounted app-wide in src/App.tsx) so they show up in the same
 * on-screen, copyable panel the rest of the lifecycle telemetry uses.
 * Event names are prefixed `[WAIT]` so they cluster when the panel is
 * copied as text.
 *
 * Four recorder families are exposed:
 *
 *   A. Lifecycle (`recordWaitingLifecycle`)
 *       Discrete one-shot markers: surface mounted/ready/unmounted,
 *       controls rendered, start-game enabled, dealer-selection entered,
 *       etc.
 *
 *   B. Ownership (`recordSurfaceOwnership`)
 *       Surface ⇒ { SeatOwner, ChipOwner, ControlOwner,
 *       AnnouncementOwner, HUDOwner }. Cached; only re-emits when
 *       the owner set actually changes.
 *
 *   C. Geometry (`recordSurfaceGeometry`)
 *       Surface ⇒ { geometryProviderId, seatAnchorSource,
 *       chipAnchorSource, chipStyleSource, anchorSnapshot }. Cached.
 *
 *   D. Mount/Unmount (`useWaitingMount`)
 *       Hook that emits structured mount/unmount events at the
 *       boundary of a surface component without other side effects.
 *
 * Read-only: this module produces telemetry only. No DOM, no state,
 * no behavioral consequences.
 */

import { useEffect } from 'react';
import { recordStartupFlight } from '@/lib/startupFlightRecorder';

export type WaitingSurfaceName =
  | 'WaitingTable'           // CanonicalShellWaitingSurface OR WaitingForPlayersTable
  | 'WaitingSlot'            // inner waiting slot (mobile MGT in waiting phase)
  | 'NeutralInterstitial'
  | 'DealerSelection'
  | 'DealerConfig'
  | 'Gameplay'
  | 'PlayfieldSlotController';

export interface SurfaceOwnership {
  SeatOwner?: string | null;
  ChipOwner?: string | null;
  ControlOwner?: string | null;
  AnnouncementOwner?: string | null;
  HUDOwner?: string | null;
}

export interface SurfaceGeometry {
  geometryProviderId?: string | null;
  seatAnchorSource?: string | null;
  chipAnchorSource?: string | null;
  chipStyleSource?: string | null;
  /** Optional snapshot of resolved anchors (position → slot/coords) */
  anchorSnapshot?: Record<string, unknown> | null;
  /** Optional viewer/projection info for cross-surface diff */
  projectionMode?: string | null;
  viewerPosition?: number | null;
}

const ownershipCache = new Map<string, string>();
const geometryCache = new Map<string, string>();

function stable(v: unknown): string {
  try {
    return JSON.stringify(v, Object.keys(v as object).sort());
  } catch {
    return String(v);
  }
}

/** A — Lifecycle markers. Always emitted. */
export function recordWaitingLifecycle(
  event: string,
  payload: Record<string, unknown> = {},
) {
  recordStartupFlight('PHASE TIMELINE', `[WAIT] ${event}`, payload);
}

/** B — Ownership snapshot, cached per surface (emits only on change). */
export function recordSurfaceOwnership(
  surface: WaitingSurfaceName,
  owners: SurfaceOwnership,
  extra: Record<string, unknown> = {},
) {
  const key = `own:${surface}`;
  const sig = stable(owners);
  if (ownershipCache.get(key) === sig) return;
  const prev = ownershipCache.get(key) ?? null;
  ownershipCache.set(key, sig);
  recordStartupFlight('RENDER TIMELINE', `[WAIT] ownership ${surface}`, {
    surface,
    owners,
    prevSig: prev,
    ...extra,
  });
}

/** C — Geometry snapshot, cached per surface (emits only on change). */
export function recordSurfaceGeometry(
  surface: WaitingSurfaceName,
  geometry: SurfaceGeometry,
  extra: Record<string, unknown> = {},
) {
  const key = `geom:${surface}`;
  const sig = stable(geometry);
  if (geometryCache.get(key) === sig) return;
  geometryCache.set(key, sig);
  recordStartupFlight('RENDER TIMELINE', `[WAIT] geometry ${surface}`, {
    surface,
    geometry,
    ...extra,
  });
}

/** D — Mount/Unmount recorder hook. Stable-deps; fires once each. */
export function useWaitingMount(
  surface: WaitingSurfaceName,
  payload: Record<string, unknown> = {},
) {
  useEffect(() => {
    recordStartupFlight('MOUNT TIMELINE', `[WAIT] mount ${surface}`, {
      surface,
      ...payload,
    });
    return () => {
      recordStartupFlight('MOUNT TIMELINE', `[WAIT] unmount ${surface}`, {
        surface,
        ...payload,
      });
    };
    // Mount/unmount only — intentionally NOT keyed on payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const miscCache = new Map<string, string>();

/**
 * Lifecycle emit that suppresses duplicates per `key`. Use for
 * per-entity (per-seat, per-player) signature-keyed events that
 * otherwise would fire every render.
 */
export function recordWaitingLifecycleIfChanged(
  key: string,
  event: string,
  payload: Record<string, unknown> = {},
) {
  const sig = stable(payload);
  if (miscCache.get(key) === sig) return;
  miscCache.set(key, sig);
  recordStartupFlight('PHASE TIMELINE', `[WAIT] ${event}`, payload);
}

/**
 * Tiny mount/unmount marker component for use inside JSX trees where
 * adding a useEffect to an existing component would touch unrelated
 * code. Emits `[WAIT] {event} mount` on mount and `[WAIT] {event}
 * unmount` on unmount. Renders nothing.
 */
import { createElement } from 'react';
export function WaitingFlightMarker({
  event,
  payload,
}: {
  event: string;
  payload?: Record<string, unknown>;
}) {
  useEffect(() => {
    recordStartupFlight('MOUNT TIMELINE', `[WAIT] ${event} mount`, payload ?? {});
    return () => {
      recordStartupFlight('MOUNT TIMELINE', `[WAIT] ${event} unmount`, payload ?? {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Test/escape hatch to clear caches (not wired to UI). */
export function _resetWaitingTableFlightCaches() {
  ownershipCache.clear();
  geometryCache.clear();
  miscCache.clear();
}
