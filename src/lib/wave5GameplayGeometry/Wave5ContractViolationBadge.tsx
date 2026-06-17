/**
 * Wave 5D — Phase 3
 * DEV badge surfacing the latest `wave5:contract_violation`.
 *
 * Sits next to the Wave 4 layout-fault badge but with distinct color
 * (amber) and a separate event source. Click to expand details.
 */

import { useEffect, useState } from "react";
import {
  getRecentContractViolations,
  onContractViolation,
  type ContractViolationEvent,
} from "./contractTelemetry";
import { HIDE_DEBUG_UI } from "@/lib/debugUIVisibility";

function fmt(n: number): string {
  return n.toFixed(2);
}

function rectStr(r: { x: number; y: number; width: number; height: number }): string {
  return `x ${fmt(r.x)} y ${fmt(r.y)} w ${fmt(r.width)} h ${fmt(r.height)}`;
}

export function Wave5ContractViolationBadge() {
  const [latest, setLatest] = useState<ContractViolationEvent | null>(() => {
    const r = getRecentContractViolations();
    return r.length ? r[r.length - 1] : null;
  });
  const [expanded, setExpanded] = useState(false);
  const [count, setCount] = useState(() => getRecentContractViolations().length);

  useEffect(() => {
    return onContractViolation((e) => {
      setLatest(e);
      setCount(getRecentContractViolations().length);
    });
  }, []);

  if (HIDE_DEBUG_UI) return null;
  if (!latest) return null;

  return (
    <div
      data-wave5-contract-badge=""
      onClick={() => setExpanded((v) => !v)}
      style={{
        position: "fixed",
        bottom: 8,
        left: 220,
        zIndex: 99999,
        background: "rgba(146, 64, 14, 0.94)", // amber-800
        color: "white",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.3,
        padding: "6px 10px",
        borderRadius: 4,
        maxWidth: expanded ? 380 : 220,
        cursor: "pointer",
        pointerEvents: "auto",
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        border: "1px solid rgba(252,211,77,0.6)",
      }}
      title="Click to expand / collapse"
    >
      <div style={{ fontWeight: 700 }}>⚠ wave5:contract_violation</div>
      <div style={{ opacity: 0.85 }}>
        {count} total · latest: {latest.artifactId}
      </div>
      {expanded ? (
        <div style={{ marginTop: 6, opacity: 0.95 }}>
          <div style={{ fontWeight: 600 }}>{latest.artifactId}</div>
          <div style={{ marginTop: 4 }}>
            <div>assigned   {rectStr(latest.assignedRect)}</div>
            <div>rendered   {rectStr(latest.renderedBounds)}</div>
            <div>viewport   {rectStr(latest.availableGameplayViewport)}</div>
          </div>
          <div style={{ marginTop: 6, fontWeight: 600 }}>overflow (vmin)</div>
          <div>
            top {fmt(latest.overflow.top)} · right {fmt(latest.overflow.right)}
            <br />
            bottom {fmt(latest.overflow.bottom)} · left {fmt(latest.overflow.left)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
