import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { persistSyncDebugEvent } from "@/lib/persistSyncDebugEvent";
import { bootstrapCanonicalShellLayout } from "@/lib/canonicalShell/canonicalShellLayoutConfig";
import { bootstrapDealTiming } from "@/lib/geometryLab/dealTimingStore";
import { bootstrapTableDemo } from "@/lib/geometryLab/tableDemoStore";
// Side-effect import: registers the `no_timers` domain with the Geometry Lab
// defaults registry before <GeometryLabDefaultsLoader /> performs its initial
// fetch. No bootstrap fn — registration runs at module load.
import "@/lib/geometryLab/noTimersStore";
// Side-effect import: registers `shell_nameplate` domain (global
// Shell → Seat Cluster → Nameplate). Applies CSS-var defaults at
// import time; the Geometry Lab loader fetches the committed row.
import "@/lib/canonicalShell/shellNameplateConfig";
import {
  installAuthEjectionHistoryListener,
  recordAuthStateChange,
} from "@/lib/authEjectionLedger";
import {
  installSessionLifecycleListeners,
  recordSessionLifecycleEvent,
} from "@/lib/sessionLifecycleLedger";
import { bootRuntimeTracer, recordRuntimeEvent, setRuntimeAmbient } from "@/lib/runtimeInstrumentation/runtimeTracer";

// Wartime: install the auth-ejection ledger history listener BEFORE any
// route mounts so a redirect to /auth is captured with pre-teardown context.
installAuthEjectionHistoryListener();
// P0: install the session lifecycle ledger listeners BEFORE any route
// mount so BOOT, ROUTE_HISTORY_*, error, unhandledrejection, pageshow,
// pagehide, visibilitychange, and online/offline are all captured from
// the very first frame — including when the app boots directly onto
// /auth or a legacy Join fallback screen.
installSessionLifecycleListeners();
bootRuntimeTracer();

// Rehydrate global Geometry Lab config before first render. Applies
// baked defaults synchronously, fetches DB-backed authoritative values,
// and subscribes to realtime updates so every device stays in sync.
bootstrapCanonicalShellLayout();
bootstrapDealTiming();
bootstrapTableDemo();


// ── Token refresh failure tracing ────────────────────────────
// Listen for auth errors that indicate a refresh failure
supabase.auth.onAuthStateChange((event, session) => {
  try {
    recordAuthStateChange({
      previousState: null,
      nextState: event,
      supabaseEvent: event,
      sessionBefore: false,
      sessionAfter: !!session,
      accessTokenExpiresAt: session?.expires_at ?? null,
      refreshTokenPresent: !!session?.refresh_token,
      userId: session?.user?.id ?? null,
      callerLabel: "main.tsx#global-onAuthStateChange",
    });
  } catch {
    /* noop */
  }
  try {
    recordSessionLifecycleEvent(
      event === "TOKEN_REFRESHED" && !session
        ? "AUTH_TOKEN_REFRESH_FAILED"
        : "AUTH_STATE_CHANGE",
      {
        supabaseEvent: event,
        sessionAfter: !!session,
        userId: session?.user?.id ?? null,
        accessTokenExpiresAt: session?.expires_at ?? null,
      },
      { userId: session?.user?.id ?? null },
    );
  } catch {
    /* noop */
  }
  if (event === "TOKEN_REFRESHED" && !session) {
    persistSyncDebugEvent({
      gameId: "00000000-0000-0000-0000-000000000000",
      gameType: "auth",
      handNumber: 0,
      eventType: "invariant",
      severity: "error",
      eventName: "app-supabase-refresh-failure",
      payload: {
        event,
        route: window.location.pathname,
        online: navigator.onLine,
        visibilityState: document.visibilityState,
        ts: Date.now(),
      },
    });
  }
});


// iOS Safari can restore pages from the Back/Forward Cache (BFCache), which may
// resurrect an *old published build* and show stale lobby content.
//
// 1) Adding an `unload` listener is a well-known way to disable BFCache.
// 2) As a fallback, if BFCache still happens, detect back_forward restores and
//    force a reload so the latest published assets/HTML are fetched.
window.addEventListener("unload", () => {
  // no-op
});

window.addEventListener("pageshow", (event) => {
  // `persisted` indicates BFCache restore in WebKit.
  const persisted = (event as PageTransitionEvent).persisted;

  // Some browsers expose the navigation type.
  const navEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const backForward = navEntry?.type === "back_forward";

  if (persisted || backForward) {
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
