import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import { persistSyncDebugEvent } from "@/lib/persistSyncDebugEvent";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Game from "./pages/Game";
import HandEvalTest from "./pages/HandEvalTest";
import HandEvalDebug from "./pages/HandEvalDebug";
import DicePreview from "./pages/DicePreview";
import DeadlineDebug from "./pages/DeadlineDebug";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { AppNetworkSim } from "@/components/AppNetworkSim";
import { NetworkSimIndicator } from "@/components/NetworkSimIndicator";
import { ResponsiveGeometryProvider } from "@/lib/canonicalShell/ResponsiveGeometryProvider";
import { LifecycleDebugBadge } from "@/lib/canonicalShell/LifecycleDebugBadge";
import { LayoutFaultBadge } from "@/lib/wave4LayoutResolver/LayoutFaultBadge";
import { ensureHarnessCacheLoaded } from "@/lib/debugHarness/runtimeCache";
import { DebugModeIndicator } from "@/lib/debugHarness/DebugModeIndicator";
import { AnnouncementDebugPanel } from "@/lib/canonicalShell/announcements/AnnouncementDebugPanel";
import { ShellLifecyclePanel } from "@/lib/canonicalShell/ShellLifecyclePanel";
import { StartupFlightRecorderOverlay } from "@/lib/startupFlightRecorder";
import { WartimeDebugPanel } from "@/lib/wartimeDebug/WartimeDebugPanel";
import { useWartimeEnabled } from "@/lib/wartimeDebug/core";
import { DebugTray } from "@/lib/debugTray/DebugTray";
import { LayoutTuningPill } from "@/components/LayoutTuningPill";


// Hydrate the Debug Harness cache once at module load so synchronous
// game-logic call sites see the active selection without awaiting a query.
void ensureHarnessCacheLoaded();


const queryClient = new QueryClient();

const App = () => {
  // Global unhandled rejection handler to catch async errors that slip through
  // This prevents the app from crashing to a blank screen on "run it back" and similar flows
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[UNHANDLED REJECTION]", event.reason);
      persistSyncDebugEvent({
        gameId: "00000000-0000-0000-0000-000000000000",
        gameType: "auth",
        handNumber: 0,
        eventType: "invariant",
        severity: "error",
        eventName: "app-window-reload-or-crash",
        payload: {
          route: window.location.pathname,
          error: String(event.reason?.message ?? event.reason ?? "unknown"),
          ts: Date.now(),
        },
      });
      toast.error("An error occurred. Please try again.");
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ResponsiveGeometryProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppNetworkSim>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/game/:gameId"
                  element={
                    <RouteErrorBoundary title="Game screen crashed">
                      <Game />
                    </RouteErrorBoundary>
                  }
                />
                <Route path="/test-hands" element={<HandEvalTest />} />
                <Route path="/debug-hands" element={<HandEvalDebug />} />
                <Route path="/dice-preview" element={<DicePreview />} />
                <Route path="/debug-deadlines" element={<DeadlineDebug />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              <LifecycleDebugBadge />
              <LayoutFaultBadge />
              {/*
                Single canonical Debug Tray. Pinned to the bottom of the
                viewport (above the iOS browser toolbar via safe-area inset).
                All debug pills live here so nothing covers the shell header,
                admin controls, dealer controls, announcements, or gameplay.
              */}
              <DebugTray>
                <NetworkSimIndicator />
                <DebugModeIndicator />
                <LayoutTuningPill />
                <LegacyDebugPanels />
                <WartimeDebugPanel />
              </DebugTray>
            </AppNetworkSim>
          </BrowserRouter>

        </ResponsiveGeometryProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

/**
 * Legacy debug panels (Announcement Debug + Startup Flight Recorder) are
 * kept intact but hidden while the Wartime Debug Framework is enabled.
 * Toggle Wartime Debug from Admin Settings to switch surfaces.
 *
 * AnnouncementDebugPanel positions itself top-left; SFR renders as a tray
 * pill that expands upward.
 */
function LegacyDebugPanels() {
  const wartimeEnabled = useWartimeEnabled();
  if (wartimeEnabled) return null;
  return (
    <>
      <AnnouncementDebugPanel />
      <StartupFlightRecorderOverlay />
    </>
  );
}

export default App;

