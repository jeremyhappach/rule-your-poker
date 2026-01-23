import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
