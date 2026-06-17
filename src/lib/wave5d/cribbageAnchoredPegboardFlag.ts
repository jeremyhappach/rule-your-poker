/**
 * Wave 5D — Phase 4 feature flag.
 *
 * `wave5d.cribbageAnchoredPegboard` — when ON, the Cribbage pegboard is
 * emitted as a `composeMode: 'anchored'` descriptor and placed off
 * `availableGameplayViewport` instead of participating in the column group.
 *
 * Shell-owned toggle only:
 *   - URL: ?wave5d_anchored_pegboard=1   (or 0)
 *   - localStorage: ptp_wave5d_anchored_pegboard = "1"
 *
 * Default OFF. Other artifacts are unaffected.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "ptp_wave5d_anchored_pegboard";
const EVENT_NAME = "ptp:wave5d-anchored-pegboard-changed";
const URL_PARAM = "wave5d_anchored_pegboard";

export function readCribbageAnchoredPegboardFlag(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get(URL_PARAM);
    if (q === "1" || q === "true") return true;
    if (q === "0" || q === "false") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCribbageAnchoredPegboardFlag(next: boolean): void {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    /* noop */
  }
}

export function useCribbageAnchoredPegboardFlag(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() =>
    readCribbageAnchoredPegboardFlag(),
  );
  useEffect(() => {
    const handler = () => setEnabled(readCribbageAnchoredPegboardFlag());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return enabled;
}
