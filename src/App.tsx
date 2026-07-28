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
import { VoiceOperationPresenceMount } from "@/components/VoiceOperationPresenceMount";
import { AppNetworkSim } from "@/components/AppNetworkSim";
import { NetworkSimIndicator } from "@/components/NetworkSimIndicator";
import { ResponsiveGeometryProvider } from "@/lib/canonicalShell/ResponsiveGeometryProvider";
import { LifecycleDebugBadge } from "@/lib/canonicalShell/LifecycleDebugBadge";
import { FeltDebugPill } from "@/lib/canonicalShell/FeltDebugPill";
import { ExtraDebugPills } from "@/lib/canonicalShell/ExtraDebugPills";
import { LayoutFaultBadge } from "@/lib/wave4LayoutResolver/LayoutFaultBadge";
import { ensureHarnessCacheLoaded } from "@/lib/debugHarness/runtimeCache";
// 3-5-7 instant-win wartime global handlers retired (see instantWinLifecycle.ts).
import { DebugModeIndicator } from "@/lib/debugHarness/DebugModeIndicator";
import { ChatFlightPill } from "@/lib/chatFlightRecorder/ChatFlightPill";
import { AnnouncementDebugPanel } from "@/lib/canonicalShell/announcements/AnnouncementDebugPanel";
import { ShellLifecyclePanel } from "@/lib/canonicalShell/ShellLifecyclePanel";
import { NormalizationDbgPanel } from "@/lib/NormalizationDbgPanel";
import { SettlementDbgPanel } from "@/lib/canonicalShell/settlement/SettlementDbgPanel";
import { ChipTransportDbgPanel } from "@/lib/canonicalShell/ChipTransportDbgPanel";
import { CardTransportDbgPanel } from "@/lib/canonicalShell/cardTransport/CardTransportDbgPanel";
import { ThreeFiveSevenDealDiagPanel } from "@/lib/canonicalShell/cardTransport/ThreeFiveSevenDealDiagPanel";
import { ThreeFiveSevenForensicsPanel } from "@/lib/canonicalShell/cardTransport/ThreeFiveSevenForensicsPanel";
import { HolmDealDbgPanel } from "@/lib/canonicalShell/cardTransport/HolmDealDbgPanel";
import { HolmBucksOverlayDbgPill } from "@/lib/canonicalShell/HolmBucksOverlayDbgPill";
import { startHolmOwnershipScanner } from "@/lib/canonicalShell/cardTransport/holmCardOwnership";
if (typeof window !== "undefined") startHolmOwnershipScanner(500);

import { CardBackDbgPanel } from "@/lib/canonicalShell/CardBackDbgPanel";
import { WinnerChipEndpointDbgPanel } from "@/lib/canonicalShell/WinnerChipEndpointDbgPanel";
import { DestReactionDbgPanel } from "@/lib/canonicalShell/DestReactionDbgPanel";
import { VisibleChipDbgPanel } from "@/lib/canonicalShell/VisibleChipDbgPanel";
import { StartupFlightRecorderOverlay } from "@/lib/startupFlightRecorder";
import { WartimeDebugPanel } from "@/lib/wartimeDebug/WartimeDebugPanel";
import { WartimeAdminGateMount } from "@/lib/wartimeDebug/WartimeAdminGateMount";
import { useWartimeEnabled, useWartimeAdminGateOpen } from "@/lib/wartimeDebug/core";
import {
  reportGlobalErrorOrigin as __reportWartimeGlobalErrorOrigin,
  registerActualEmitterInvocation as __wartimeRegisterEmitterApp,
  registerWartimeProductionHook as __wartimeRegisterHookApp,
  SRC as __WARTIME_SRC_APP,
} from "@/lib/threeFiveSeven/wartime";

// 3-5-7 Wartime — canonical production owner for global.error.origin.
// App.tsx owns the top-level React error boundary and application
// toast surface; reportGlobalErrorOrigin fires from those owners in
// addition to the always-on window listeners.
__wartimeRegisterHookApp({
  requirementId: 'global.error.origin',
  sourceSiteId: __WARTIME_SRC_APP.GLOBAL_ERROR_ORIGIN.id,
  sourceFile: 'src/App.tsx',
  sourceFunction: 'App.errorBoundaryAndToast',
});
__wartimeRegisterEmitterApp('global.error.origin', __WARTIME_SRC_APP.GLOBAL_ERROR_ORIGIN.id);
import { DebugTray } from "@/lib/debugTray/DebugTray";
import { HolmCommunityLandingPill } from "@/lib/canonicalShell/cardTransport/HolmCommunityLandingPill";
import { IncidentExportPill } from "@/components/IncidentExportPill";





import Diagnostics from "@/pages/Diagnostics";
import RuntimeDiagnostics from "@/pages/RuntimeDiagnostics";
import { SessionLifecycleRecoveryPill } from "@/lib/sessionLifecycle/SessionLifecycleRecoveryPill";
import { recordSessionIncident } from "@/lib/sessionLifecycleLedger";
import { ChatOperationInstrumentationMount } from "@/lib/chatOperations/ChatOperationInstrumentationMount";



import { R1SnapbackPill } from "@/lib/wartimeDebug/R1SnapbackPill";
import { Wave5ViewportOverlayToggle } from "@/lib/wave5GameplayGeometry/Wave5ViewportOverlay";
import { Wave5GridOverlayToggle } from "@/lib/wave5GameplayGeometry/Wave5GridOverlay";
import { Wave5SeatReserveOverlayToggle } from "@/lib/wave5GameplayGeometry/Wave5SeatReserveOverlay";
import { Wave5AnchoredProbeToggle } from "@/lib/wave5GameplayGeometry/Wave5AnchoredProbeOverlay";
import { Wave5OversizedProbeToggle } from "@/lib/wave5GameplayGeometry/Wave5OversizedProbeOverlay";
import { Wave5ContractViolationBadge } from "@/lib/wave5GameplayGeometry/Wave5ContractViolationBadge";
import { useHideDebugUI } from '@/lib/debugUIVisibility';
import { GeometryOverridesLoader } from '@/lib/geometryLab/GeometryOverridesLoader';
import { GeometryLabDefaultsLoader } from '@/lib/geometryLab/GeometryLabDefaultsLoader';
// Force domain registration at app boot so the defaults loader's initial
// fetch + realtime routing include every GeoLab-backed domain even before
// the consumer component (game table, admin modal, etc.) first mounts.
// Without these eager imports, a domain registered lazily would still be
// covered by the loader's late-registration lazy fetch — but boot-time
// registration is preferred because it consolidates everything into the
// single initial bulk query.
import '@/lib/threeFiveSeven/showdownConfig';
import '@/lib/holm/showdownConfig';
import '@/lib/cardFrontDesign/config';
import '@/lib/geometryLab/cardArtifactOverlap';
import '@/lib/geometryLab/overlayFlags';
import '@/lib/geometryLab/noTimersStore';
import '@/lib/geometryLab/dealTimingStore';
import '@/lib/geometryLab/tableDemoStore';
import '@/lib/canonicalShell/shellNameplateConfig';
import '@/lib/canonicalShell/shellChipBalanceConfig';
import '@/lib/canonicalShell/holmBuckIndicatorConfig';
import '@/lib/canonicalShell/canonicalShellLayoutConfig';
import '@/lib/cribbage/peggingRowSettings';
import '@/lib/activeHand/activeHandLayoutSettings';
import { SeatClusterInvariantMonitor } from '@/lib/canonicalShell/seatClusterInvariant';




// Hydrate the Debug Harness cache once at module load so synchronous
// game-logic call sites see the active selection without awaiting a query.
void ensureHarnessCacheLoaded();


const queryClient = new QueryClient();

const App = () => {
  const hideDebugUI = useHideDebugUI();
  // 3-5-7 instant-win global handlers retired — they were wartime-only.
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
      try {
        recordSessionIncident("FATAL_RENDER_OR_PROMISE_REJECTION", {
          source: "App#unhandledrejection",
          error: String(event.reason?.message ?? event.reason ?? "unknown"),
        });
      } catch {
        /* noop */
      }
      // E. Error toast invocation diagnostic — pins the toast owner so a
      //    visible "An error occurred" during 3-5-7 harness runs can be
      //    correlated with 357.runtime.global_error and the last
      //    lifecycle event.
      try {
        __reportWartimeGlobalErrorOrigin({
          kind: 'error_toast',
          message: String(event.reason?.message ?? event.reason ?? 'unknown'),
          errorName: event.reason instanceof Error ? event.reason.name : typeof event.reason,
          stack: event.reason instanceof Error ? event.reason.stack ?? null : null,
        });
        void import("@/lib/threeFiveSeven/runtimeDiag").then(({ emit357RuntimeDiag }) => {
          emit357RuntimeDiag("error_toast_invoked", {}, {
            source: "App#unhandledrejection",
            route: window.location.pathname,
            reasonMessage: String(event.reason?.message ?? event.reason ?? "unknown"),
            reasonStack: (event.reason && (event.reason as { stack?: string }).stack) ?? null,
          });
        }).catch(() => {});
      } catch { /* diagnostic-only */ }
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
          <GeometryLabDefaultsLoader />
          <SeatClusterInvariantMonitor />
          <StalePublicationWarning />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppNetworkSim>
              <ChatOperationInstrumentationMount />
              <WartimeAdminGateMount />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route
                  path="/game/:gameId"
                  element={
                    <RouteErrorBoundary title="Game screen crashed">
                      <VoiceOperationPresenceMount />
                      <Game />
                    </RouteErrorBoundary>
                  }
                />

                <Route path="/test-hands" element={<HandEvalTest />} />
                <Route path="/debug-hands" element={<HandEvalDebug />} />
                <Route path="/dice-preview" element={<DicePreview />} />
                <Route path="/debug-deadlines" element={<DeadlineDebug />} />
                <Route path="/diagnostics" element={<Diagnostics />} />
                <Route path="/runtime-diagnostics" element={<RuntimeDiagnostics />} />
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
                <WartimeGatedPanel hideDebugUI={hideDebugUI} />
                {!hideDebugUI && <ShellLifecyclePanel />}
                <NormalizationDbgPanel />
                <SettlementDbgPanel />
                <ChipTransportDbgPanel />
                <CardTransportDbgPanel />
                <ThreeFiveSevenDealDiagPanel />
                <ThreeFiveSevenForensicsPanel />
                <HolmDealDbgPanel />
                <HolmBucksOverlayDbgPill />
                <HolmCommunityLandingPill />
                <R1SnapbackPill />


                <CardBackDbgPanel />
                <WinnerChipEndpointDbgPanel />
                <DestReactionDbgPanel />
                <VisibleChipDbgPanel />
              </DebugTray>
              {/* W5 GRID is always available, even when debug UI is hidden */}
              <div
                style={{
                  position: 'fixed',
                  right: 8,
                  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
                  zIndex: 40,
                  pointerEvents: 'auto',
                }}
              >
              <Wave5GridOverlayToggle />
              </div>

              {/* Single, session-scoped incident export pill.
                  Replaces ChatDeliveryExportPill, IncidentReportBanner,
                  and VoiceOperationReportBanner — exactly one "Export
                  Incident" surface per current session/game. */}
              <IncidentExportPill />
              <ChatFlightPill />
              
              


              

              

              {/* SessionLifecycleRecoveryPill (DIAG + COPY) intentionally
                  suppressed from published UI per operator request. The
                  only visible in-game diagnostic surface is the Cribbage
                  layout trace pill. /diagnostics route remains reachable
                  directly. */}
              {/* <SessionLifecycleRecoveryPill /> */}







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

/**
 * Wartime Debug Panel — admin-only. Non-admins never see, mount, or
 * subscribe to any part of the wartime UI surface.
 */
function WartimeGatedPanel({ hideDebugUI }: { hideDebugUI: boolean }) {
  const adminGateOpen = useWartimeAdminGateOpen();
  if (hideDebugUI || !adminGateOpen) return null;
  return <WartimeDebugPanel />;
}

export default App;

