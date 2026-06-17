/**
 * Wave 6 — Geometry Lab overlay flag wiring.
 *
 * Bridges the Lab's checkbox toggles to existing/future overlay localStorage
 * keys. Two of the six overlays already exist in the Wave 5 toolset; the
 * remaining four store their flags here so future overlay components can
 * subscribe with the same `useOverlayFlag()` hook.
 *
 * "Show Contract Violations" is wired to the already-mounted
 * <Wave5ContractViolationBadge/> which auto-shows on faults, but the toggle
 * lets admins explicitly opt-in to its visibility in the future.
 */

import { useEffect, useState } from "react";

export interface OverlayFlagDescriptor {
  key: string;
  label: string;
  storageKey: string;
  /** Optional companion event other overlays listen for. */
  eventName: string;
}

export const OVERLAY_FLAGS: OverlayFlagDescriptor[] = [
  { key: "grid", label: "Show W5 Grid", storageKey: "ptp_wave5_grid", eventName: "ptp:wave5-grid-changed" },
  { key: "viewport", label: "Show Viewport", storageKey: "ptp_wave5_viewport_overlay", eventName: "ptp:wave5-viewport-overlay-changed" },
  { key: "crosshair", label: "Show Anchor Crosshair", storageKey: "ptp_geomlab_crosshair", eventName: "ptp:geomlab-crosshair-changed" },
  { key: "assigned", label: "Show Assigned Rect", storageKey: "ptp_geomlab_assigned", eventName: "ptp:geomlab-assigned-changed" },
  { key: "bounds", label: "Show Rendered Bounds", storageKey: "ptp_geomlab_bounds", eventName: "ptp:geomlab-bounds-changed" },
  { key: "violations", label: "Show Contract Violations", storageKey: "ptp_geomlab_violations", eventName: "ptp:geomlab-violations-changed" },
];

export function readOverlayFlag(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function writeOverlayFlag(d: OverlayFlagDescriptor, next: boolean): void {
  try {
    if (next) window.localStorage.setItem(d.storageKey, "1");
    else window.localStorage.removeItem(d.storageKey);
    window.dispatchEvent(new Event(d.eventName));
    window.dispatchEvent(new Event("storage"));
  } catch { /* */ }
}

export function useOverlayFlag(d: OverlayFlagDescriptor): [boolean, (n: boolean) => void] {
  const [val, setVal] = useState<boolean>(() => readOverlayFlag(d.storageKey));
  useEffect(() => {
    const sync = () => setVal(readOverlayFlag(d.storageKey));
    window.addEventListener(d.eventName, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(d.eventName, sync);
      window.removeEventListener("storage", sync);
    };
  }, [d.eventName, d.storageKey]);
  return [val, (n: boolean) => { writeOverlayFlag(d, n); setVal(n); }];
}
