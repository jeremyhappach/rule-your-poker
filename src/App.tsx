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
import { FeltDebugPill } from "@/lib/canonicalShell/FeltDebugPill";
import { ExtraDebugPills } from "@/lib/canonicalShell/ExtraDebugPills";
import { LayoutFaultBadge } from "@/lib/wave4LayoutResolver/LayoutFaultBadge";
import { ensureHarnessCacheLoaded } from "@/lib/debugHarness/runtimeCache";
import { DebugModeIndicator } from "@/lib/debugHarness/DebugModeIndicator";
import { AnnouncementDebugPanel } from "@/lib/canonicalShell/announcements/AnnouncementDebugPanel";
import { ShellLifecyclePanel } from "@/lib/canonicalShell/ShellLifecyclePanel";
import { NormalizationDbgPanel } from "@/lib/NormalizationDbgPanel";
import { SettlementDbgPanel } from "@/lib/canonicalShell/settlement/SettlementDbgPanel";
import { ChipTransportDbgPanel } from "@/lib/canonicalShell/ChipTransportDbgPanel";
import { StartupFlightRecorderOverlay } from "@/lib/startupFlightRecorder";
import { WartimeDebugPanel } from "@/lib/wartimeDebug/WartimeDebugPanel";
import { useWartimeEnabled } from "@/lib/wartimeDebug/core";
import { DebugTray } from "@/lib/debugTray/DebugTray";
import { Wave5ViewportOverlayToggle } from "@/lib/wave5GameplayGeometry/Wave5ViewportOverlay";
import { Wave5GridOverlayToggle } from "@/lib/wave5GameplayGeometry/Wave5GridOverlay";
import { Wave5SeatReserveOverlayToggle } from "@/lib/wave5GameplayGeometry/Wave5SeatReserveOverlay";
import { Wave5AnchoredProbeToggle } from "@/lib/wave5GameplayGeometry/Wave5AnchoredProbeOverlay";
import { Wave5OversizedProbeToggle } from "@/lib/wave5GameplayGeometry/Wave5OversizedProbeOverlay";
import { Wave5ContractViolationBadge } from "@/lib/wave5GameplayGeometry/Wave5ContractViolationBadge";
import { useHideDebugUI } from '@/lib/debugUIVisibility';
import { GeometryOverridesLoader } from '@/lib/geometryLab/GeometryOverridesLoader';
import { SeatClusterInvariantMonitor } from '@/lib/canonicalShell/seatClusterInvariant';



// Hydrate the Debug Harness cache once at module load so synchronous
// game-logic call sites see the active selection without awaiting a query.
void ensureHarnessCacheLoaded();


const queryClient = new QueryClient();

const App = () => {
  const hideDebugUI = useHideDebugUI();
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
          <GeometryOverridesLoader />
          <SeatClusterInvariantMonitor />
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
              {/* Tray always mounts; each pill self-gates via its admin toggle. */}
              <DebugTray>
                <NetworkSimIndicator />
                <DebugModeIndicator />
                <FeltDebugPill />
                <ExtraDebugPills />
                <LayoutFaultBadge />
                <Wave5ContractViolationBadge />
                {!hideDebugUI && <LegacyDebugPanels />}
                {!hideDebugUI && <WartimeDebugPanel />}
                {!hideDebugUI && <ShellLifecyclePanel />}
                <NormalizationDbgPanel />
                <SettlementDbgPanel />
                <ChipTransportDbgPanel />
              </DebugTray>
              {/* W5 GRID is always available, even when debug UI is hidden */}
              <div
                style={{
                  position: 'fixed',
                  right: 8,
                  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
                  zIndex: 2147483647,
                  pointerEvents: 'auto',
                }}
              >
                <Wave5GridOverlayToggle />
              </div>

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
      <StartupFlightRecorderOverlay />
    </>
  );
}

export default App;

