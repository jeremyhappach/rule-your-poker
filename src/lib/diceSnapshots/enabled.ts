const STORAGE_KEY = "diceSnap";
const STORAGE_MS_KEY = "diceSnapMs";

function getSearchParams(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Enable/disable is controlled via URL only (no UI), but persisted in sessionStorage
 * so it survives in-app navigation.
 *
 * - Enable:  ?diceSnap=1
 * - Disable: ?diceSnap=0
 * - Optional interval override: ?diceSnapMs=50
 */
export function isDiceSnapEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const sp = getSearchParams();
  const urlToggle = sp.get("diceSnap");

  if (urlToggle === "1") {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } else if (urlToggle === "0") {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

export function getDiceSnapIntervalMs(): number {
  if (typeof window === "undefined") return 50;
  const sp = getSearchParams();
  const urlMs = sp.get("diceSnapMs");
  if (urlMs) {
    const parsed = Number(urlMs);
    if (Number.isFinite(parsed) && parsed >= 10 && parsed <= 500) {
      sessionStorage.setItem(STORAGE_MS_KEY, String(Math.round(parsed)));
    }
  }
  const stored = Number(sessionStorage.getItem(STORAGE_MS_KEY) || "50");
  return Number.isFinite(stored) ? Math.min(500, Math.max(10, stored)) : 50;
}

export function getDiceSnapLabel(): string {
  if (typeof window === "undefined") return "diceSnap";
  const sp = getSearchParams();
  return sp.get("diceSnapLabel") || `diceSnap ${window.location.pathname}`;
}
