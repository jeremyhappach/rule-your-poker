import React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

/**
 * Catches render/runtime errors so the app doesn't hard-crash to a blank/white screen.
 * This is especially useful during realtime multiplayer updates where a single unexpected payload
 * can otherwise crash React rendering.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    // Keep console logging very explicit so we can debug from user reports.
    console.error("[RouteErrorBoundary] Caught error:", error);
    console.error("[RouteErrorBoundary] Error info:", errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.title ?? "Something went wrong";

    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-4">
          <header className="space-y-1">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">
              The game UI crashed during an update. Reloading should recover you without losing the room.
            </p>
          </header>

          <div className="flex items-center gap-3">
            <Button onClick={this.handleReload}>Reload</Button>
            <Button variant="outline" onClick={this.handleReset}>
              Try again
            </Button>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
{String((this.state.error as any)?.message ?? this.state.error ?? "Unknown error")}
            </pre>
          </details>
        </section>
      </main>
    );
  }
}
