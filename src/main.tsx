import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";
import { persistSyncDebugEvent } from "@/lib/persistSyncDebugEvent";
import { bootstrapLayoutTuning } from "@/components/admin/LayoutTuningAdminSection";

// Rehydrate persistent admin layout tuning before first render.
bootstrapLayoutTuning();

// ── Token refresh failure tracing ────────────────────────────
// Listen for auth errors that indicate a refresh failure
supabase.auth.onAuthStateChange((event, session) => {
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
