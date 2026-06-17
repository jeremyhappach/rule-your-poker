/**
 * Wave 6 — Geometry Lab crash boundary + telemetry.
 *
 * Goal: never lose a Lab crash to "sometimes it just exits". Every render of
 * <GeometryLab/> writes a snapshot (selected game, selected artifact id,
 * current unsaved form values, current route) into a module-level diagnostic
 * ref via `recordGeometryLabContext()`. If anything inside the Lab throws,
 * this boundary catches it and emits a structured `geometrylab:crash` log
 * with that snapshot plus the React component stack, then renders a recovery
 * UI inside the Settings modal — instead of letting the error bubble up to
 * the route-level boundary, which is what was sending the user back to the
 * home screen.
 */

import React from "react";
import { Button } from "@/components/ui/button";

export interface GeometryLabContextSnapshot {
  game: string;
  artifactId: string;
  routeBeforeCrash: string;
  unsavedForm: Record<string, unknown>;
}

let LATEST: GeometryLabContextSnapshot = {
  game: "(none)",
  artifactId: "(none)",
  routeBeforeCrash: typeof window !== "undefined" ? window.location.pathname : "(ssr)",
  unsavedForm: {},
};

export function recordGeometryLabContext(s: Partial<GeometryLabContextSnapshot>) {
  LATEST = { ...LATEST, ...s };
}

export function getGeometryLabContext(): GeometryLabContextSnapshot {
  return LATEST;
}

/**
 * Structured logger used throughout the Lab so failures show up as
 * grep-able events in the console / log capture.
 */
export function logGeometryLab(
  event: string,
  payload: Record<string, unknown> = {},
) {
  // eslint-disable-next-line no-console
  console.info(`geometrylab:${event}`, payload);
}

interface State {
  hasError: boolean;
  error?: unknown;
  componentStack?: string;
  snapshotAtCrash?: GeometryLabContextSnapshot;
}

export class GeometryLabCrashBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    const snapshot = getGeometryLabContext();
    // eslint-disable-next-line no-console
    console.error("geometrylab:crash", {
      message: (error as { message?: string })?.message ?? String(error),
      name: (error as { name?: string })?.name,
      componentStack: info.componentStack,
      selectedGame: snapshot.game,
      selectedArtifact: snapshot.artifactId,
      sizeMode: (snapshot.unsavedForm as { sizeMode?: string }).sizeMode,
      unsavedForm: snapshot.unsavedForm,
      routeBeforeCrash: snapshot.routeBeforeCrash,
      currentRoute:
        typeof window !== "undefined" ? window.location.pathname : "(ssr)",
    });
    this.setState({
      componentStack: info.componentStack,
      snapshotAtCrash: snapshot,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: undefined,
      componentStack: undefined,
      snapshotAtCrash: undefined,
    });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const snap = this.state.snapshotAtCrash ?? getGeometryLabContext();
    return (
      <div className="space-y-4 p-2">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-2">
          <h3 className="font-semibold text-destructive">
            Geometry Lab crashed
          </h3>
          <p className="text-sm text-muted-foreground">
            The error was caught locally — your other Settings tabs are fine.
            Diagnostic details have been logged as <code>geometrylab:crash</code>.
          </p>
          <div className="text-xs space-y-1">
            <div>
              <span className="text-muted-foreground">selectedGame:</span>{" "}
              <code>{snap.game}</code>
            </div>
            <div>
              <span className="text-muted-foreground">selectedArtifact:</span>{" "}
              <code>{snap.artifactId}</code>
            </div>
            <div>
              <span className="text-muted-foreground">routeBeforeCrash:</span>{" "}
              <code>{snap.routeBeforeCrash}</code>
            </div>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">unsaved form</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {JSON.stringify(snap.unsavedForm, null, 2)}
            </pre>
          </details>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">error</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {String(
                (this.state.error as { message?: string } | undefined)?.message ??
                  this.state.error ??
                  "Unknown error",
              )}
            </pre>
          </details>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">component stack</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">
              {this.state.componentStack ?? "(none)"}
            </pre>
          </details>
          <Button size="sm" variant="outline" onClick={this.handleReset}>
            Reload Lab
          </Button>
        </div>
      </div>
    );
  }
}
