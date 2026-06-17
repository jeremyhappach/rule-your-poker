/**
 * Wave 5D — Phase 4 debug toggle pill for the
 * `wave5d.cribbageAnchoredPegboard` flag.
 */

import { HIDE_DEBUG_UI } from "@/lib/debugUIVisibility";
import {
  setCribbageAnchoredPegboardFlag,
  useCribbageAnchoredPegboardFlag,
} from "./cribbageAnchoredPegboardFlag";

export function CribbageAnchoredPegboardToggle() {
  const enabled = useCribbageAnchoredPegboardFlag();
  if (HIDE_DEBUG_UI) return null;
  return (
    <button
      type="button"
      onClick={() => setCribbageAnchoredPegboardFlag(!enabled)}
      title={
        enabled
          ? "Disable Wave 5D anchored Cribbage pegboard"
          : "Enable Wave 5D anchored Cribbage pegboard"
      }
      style={{
        pointerEvents: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1,
        padding: "5px 7px",
        borderRadius: 6,
        border: "1px solid rgba(56,189,248,0.65)",
        background: enabled
          ? "rgba(56,189,248,0.85)"
          : "rgba(15,23,42,0.75)",
        color: enabled ? "#001520" : "rgba(186,230,253,0.95)",
        backdropFilter: "blur(4px)",
        fontWeight: 600,
        letterSpacing: 0.4,
        cursor: "pointer",
      }}
    >
      W5 PEGBOARD
    </button>
  );
}
