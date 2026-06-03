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
import { ResponsiveGeometryProvider } from "@/lib/canonicalShell/ResponsiveGeometryProvider";
import { LifecycleDebugBadge } from "@/lib/canonicalShell/LifecycleDebugBadge";
import { ensureHarnessCacheLoaded } from "@/lib/debugHarness/runtimeCache";
import { DebugModeIndicator } from "@/lib/debugHarness/DebugModeIndicator";
import { AnnouncementDebugPanel } from "@/lib/canonicalShell/announcements/AnnouncementDebugPanel";
import { ShellLifecyclePanel } from "@/lib/canonicalShell/ShellLifecyclePanel";
import { StartupFlightRecorderOverlay } from "@/lib/startupFlightRecorder";

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
            </AppNetworkSim>
            <LifecycleDebugBadge />
            <DebugModeIndicator />
            <AnnouncementDebugPanel />
            <ShellLifecyclePanel />
            <StartupFlightRecorderOverlay />
          </BrowserRouter>

        </ResponsiveGeometryProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
