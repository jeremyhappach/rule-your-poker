import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Game from "./pages/Game";
import HandEvalTest from "./pages/HandEvalTest";
import HandEvalDebug from "./pages/HandEvalDebug";
import DicePreview from "./pages/DicePreview";
import DeadlineDebug from "./pages/DeadlineDebug";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

const queryClient = new QueryClient();

const App = () => {
  // Global unhandled rejection handler to catch async errors that slip through
  // This prevents the app from crashing to a blank screen on "run it back" and similar flows
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[UNHANDLED REJECTION]", event.reason);
      // Show user-friendly error without crashing the app
      toast.error("An error occurred. Please try again.");
      // Prevent the default crash behavior
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
