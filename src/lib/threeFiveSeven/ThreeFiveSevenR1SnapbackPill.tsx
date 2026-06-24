/**
 * 3-5-7 R1 SNAPBACK EXPORT PILL
 *
 * Gameplay debug pill that downloads the most recent completed
 * R1-snapback capture as a .txt file.
 *
 * Visibility rules:
 *   - Admin toggle `threeFiveSevenR1Snapback` is ON.
 *   - A R1 exposed-opponent showdown host is currently mounted
 *     (i.e. `useThreeFiveSevenR1OwnershipAudit()` reports an audit
 *     whose displayCardCount === 3 and currentRound === 1).
 *
 * Side-effect: while the toggle is ON the forensics capture engine is
 * armed. While OFF, no listeners / observers / rAF loops are attached.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import { useThreeFiveSevenR1OwnershipAudit } from './showdownConfig';
import {
  downloadR1SnapbackCapture,
  getLastR1SnapbackCapture,
  isR1SnapbackCaptureActive,
  setR1SnapbackCaptureEnabled,
  subscribeR1Snapback,
} from './r1SnapbackForensics';

function getSnapshot() {
  return {
    has: !!getLastR1SnapbackCapture(),
    active: isR1SnapbackCaptureActive(),
  };
}
const initialSnapshot = { has: false, active: false };
function getServerSnapshot() { return initialSnapshot; }

export function ThreeFiveSevenR1SnapbackPill() {
  const inTray = useInDebugTray();
  const enabled = useDebugPillEnabled('threeFiveSevenR1Snapback');
  const audit = useThreeFiveSevenR1OwnershipAudit();

  useEffect(() => {
    setR1SnapbackCaptureEnabled(enabled);
    return () => { /* keep enabled while pill toggle stays on */ };
  }, [enabled]);

  // Re-render on capture lifecycle.
  const state = useSyncExternalStore(subscribeR1Snapback, getSnapshot, getServerSnapshot);

  if (!enabled) return null;
  const onR1ShowdownLive = !!audit
    && audit.is357Game
    && audit.currentRound === 1
    && audit.displayCardCount === 3;
  if (!onR1ShowdownLive) return null;

  const onClick = () => { downloadR1SnapbackCapture(); };

  const wrapperStyle: React.CSSProperties = inTray
    ? { pointerEvents: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 }
    : {
        position: 'fixed', right: 8, bottom: 8, zIndex: 2147483646,
        pointerEvents: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10,
      };

  const bg = state.active
    ? 'rgba(220,140,40,0.9)'
    : state.has
      ? 'rgba(40,120,200,0.9)'
      : 'rgba(80,80,80,0.85)';
  const label = state.active
    ? 'R1 SNAPBACK · CAPTURING…'
    : state.has
      ? 'R1 SNAPBACK EXPORT'
      : 'R1 SNAPBACK · (edit R1 to capture)';

  return (
    <div data-357-r1-snapback-pill="" style={wrapperStyle}>
      <button
        type="button"
        onClick={onClick}
        disabled={!state.has}
        title="Download 357-r1-static-snapback-<timestamp>.txt for the most recent completed capture"
        style={{
          background: bg,
          border: '1px solid rgba(255,255,255,0.45)',
          borderRadius: 999,
          padding: '4px 10px',
          color: '#fff',
          fontSize: 10,
          lineHeight: 1.2,
          fontWeight: 700,
          letterSpacing: 0.5,
          opacity: state.has || state.active ? 1 : 0.85,
          cursor: state.has ? 'pointer' : 'default',
        }}
      >
        {label}
      </button>
    </div>
  );
}
