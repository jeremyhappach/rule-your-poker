/**
 * Wave 4 — Phase 5A
 * Wave4CribbageChromeHost — first live Cribbage cutover.
 *
 * What this is:
 *   The Cribbage chrome (Announcement / GameTitle / Parameter chips /
 *   TopHUD / BottomHUD / Tabs) routed through:
 *
 *     cribbageArtifactDescriptors  +  liveGeometryConstraints
 *           ↓
 *     resolveLayout()
 *           ↓
 *     ArtifactHost
 *           ↓
 *     positioned ghost rects (labeled, semi-transparent)
 *
 *   The host paints over the existing chrome as a verification overlay.
 *   Legacy renderers remain in place as the safety net.
 *
 * Gating:
 *   - Default: rendered, pointer-events-none, opacity-low. Visible only
 *     when `?wave4=1` or `localStorage.wave4=1` is set. Otherwise hidden.
 *   - Faults always emit to `emitLayoutFault` regardless of visibility,
 *     so telemetry & the DEV badge work even without the visual overlay.
 *
 * Acceptance covered here:
 *   ☐ Resolver consumes live geometry
 *   ☐ ArtifactHost renders the resolved chrome rects
 *   ☐ wave4:layout_fault surfaces faults (badge + telemetry)
 *   ☐ Zero changes to legacy chrome — no risk to live gameplay
 *
 * The next phase (5B) replaces the ghost rects with real chrome content
 * and removes the legacy renderers for these specific artifacts.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  ArtifactHost,
  resolveLayout,
  type RenderedArtifact,
} from "@/lib/wave4LayoutResolver";
import {
  emitLayoutFault,
  hashLayout,
  orientationFor,
  viewportBucketFor,
} from "@/lib/wave4LayoutResolver/telemetry";
import { useLiveGeometryConstraints } from "@/lib/wave4LayoutResolver/useLiveGeometryConstraints";
import {
  getCribbageArtifactDescriptors,
  type CribbagePhase,
} from "@/lib/cribbage/cribbageArtifactDescriptors";



// Artifacts we project as ghost rects.
// Phase 5A: chrome only.
// Phase 5C: pegboard joins (first gameplay artifact under host control —
// the legacy <CribbagePegBoard/> is now positioned by Wave4PegboardSlot,
// so the ghost should pixel-align with the live pegboard).
const CHROME_ARTIFACT_IDS = new Set<string>([
  "cribbage.announcement",
  "cribbage.topHud",
  "cribbage.gameTitle",
  "cribbage.parameterChips",
  "cribbage.bottomHud",
  "cribbage.tabs",
  "cribbage.pegboard",
]);

function flagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("wave4") === "1") return true;
    if (window.localStorage.getItem("wave4") === "1") return true;
  } catch {
    /* noop */
  }
  return false;
}

export interface Wave4CribbageChromeHostProps {
  phase: CribbagePhase;
  viewerSeatPosition: number | null;
  opponentSeatPositions: ReadonlyArray<number>;
  cutCardRevealed: boolean;
  cribVisible: boolean;
}

export function Wave4CribbageChromeHost(props: Wave4CribbageChromeHostProps) {
  const { geometry, vminInPx } = useLiveGeometryConstraints();
  const visible = flagEnabled();
  const lastHashRef = useRef<string | null>(null);

  const descriptors = useMemo(
    () => {
      const all = getCribbageArtifactDescriptors({
        phase: props.phase,
        viewerSeatPosition: props.viewerSeatPosition,
        opponentSeatPositions: props.opponentSeatPositions,
        cutCardRevealed: props.cutCardRevealed,
        cribVisible: props.cribVisible,
      });
      // Wave 5D — Pegboard + CribCutGroup Graduation. These anchored
      // artifacts are owned exclusively by CribbageGameplayGeometryProvider.
      // The chrome host must NOT resolve duplicates — doing so would split
      // descriptor ownership and produce spurious faults.
      return all.filter(
        (d) =>
          d.id !== "cribbage.pegboard" &&
          d.id !== "cribbage.cribCutGroup",
      );
    },
    [
      props.phase,
      props.viewerSeatPosition,
      props.opponentSeatPositions,
      props.cutCardRevealed,
      props.cribVisible,
    ],
  );


  // Resolve once per (descriptors, geometry) change, just for fault emission.
  // ArtifactHost resolves again internally for rendering — but the work is
  // pure and cheap (no DOM), and avoids double-pipe state coupling.
  useEffect(() => {
    if (!geometry) return;
    const out = resolveLayout(descriptors, geometry);
    const hash = hashLayout(out.placements);
    lastHashRef.current = hash;
    if (out.faults.length > 0) {
      emitLayoutFault({
        layoutHash: hash,
        game: "cribbage",
        orientation:
          typeof window !== "undefined"
            ? orientationFor(window.innerWidth, window.innerHeight)
            : "unknown",
        viewportBucket:
          typeof window !== "undefined"
            ? viewportBucketFor(window.innerWidth, window.innerHeight)
            : "unknown",
        faults: out.faults,
        timestamp: Date.now(),
      });
    }
  }, [descriptors, geometry]);

  if (!geometry || vminInPx <= 0) return null;

  // Render the ArtifactHost as an absolutely-positioned overlay covering
  // the canonical felt surface. pointer-events:none so it never blocks
  // legacy interaction.
  return (
    <div
      data-wave4-chrome-host=""
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // Ghost overlay is hidden by default; flag flips it on.
        opacity: visible ? 1 : 0,
        zIndex: visible ? 90 : -1,
      }}
    >
      <ArtifactHost
        descriptors={descriptors}
        constraints={geometry}
        feltVminInPx={vminInPx}
        renderArtifact={(d, r) => renderGhost(d.id, r, visible)}
      />
    </div>
  );
}

function renderGhost(
  id: string,
  rendered: RenderedArtifact,
  visible: boolean,
): React.ReactNode {
  if (!rendered.visible) return null;
  const isChrome = CHROME_ARTIFACT_IDS.has(id);
  // For Phase 5A: only paint ghosts for chrome artifacts. Gameplay rects
  // exist in the resolver output (so faults are accurate) but we do not
  // overlay them — legacy gameplay renderers are still authoritative.
  if (!isChrome) return null;

  const color = ghostColorFor(id);
  const label = id.replace(/^cribbage\./, "");
  return (
    <div
      data-wave4-ghost={id}
      style={{
        ...rendered.style,
        border: `1px dashed ${color}`,
        background: visible ? `${color}22` : "transparent",
        color: color,
        fontFamily: "ui-monospace, monospace",
        fontSize: 10,
        lineHeight: 1.1,
        padding: 2,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <span style={{ opacity: 0.9 }}>w4:{label}</span>
      {rendered.faults.length > 0 ? (
        <span style={{ marginLeft: 4, color: "#ff5252" }}>⚠</span>
      ) : null}
    </div>
  );
}

function ghostColorFor(id: string): string {
  switch (id) {
    case "cribbage.announcement":
      return "#3DD68C";
    case "cribbage.gameTitle":
      return "#7FB8FF";
    case "cribbage.parameterChips":
      return "#FFC857";
    case "cribbage.topHud":
      return "#A0A0A0";
    case "cribbage.bottomHud":
      return "#A0A0A0";
    case "cribbage.tabs":
      return "#C77DFF";
    default:
      return "#888";
  }
}
