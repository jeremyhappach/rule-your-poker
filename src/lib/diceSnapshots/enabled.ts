import { isDebugChannel } from "@/lib/debugChannels";

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
 * Disabled by default. Enable through the shared `dice` debug channel or a
 * URL override that is persisted in sessionStorage for in-app navigation.
 *
 * - Enable:  ?diceSnap=1
 * - Disable: ?diceSnap=0
 * - Shared debug toggle: channel `dice`
 * - Optional interval override: ?diceSnapMs=50
 */
export function isDiceSnapEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const requested = getSearchParams().get(STORAGE_KEY);
  try {
    if (requested === "0") {
      sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    if (requested === "1") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
  } catch { /* storage can be unavailable in restricted browsers */ }

  if (isDebugChannel("dice")) return true;

  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
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
