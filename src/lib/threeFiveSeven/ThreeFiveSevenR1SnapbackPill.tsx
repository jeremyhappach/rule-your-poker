/**
 * 3-5-7 R1 SNAPBACK — manually-armed forensics pills.
 *
 * Renders two small pills inside the existing DebugTray when ALL of:
 *   - Admin toggle `threeFiveSevenR1Snapback` is ON.
 *   - A live R1 (3-card) exposed-opponent showdown is mounted, as
 *     reported by `useThreeFiveSevenR1OwnershipAudit()` (is357Game &&
 *     currentRound === 1 && displayCardCount === 3).
 *
 * ARM R1 SNAPBACK   — manual arm. No observers/listeners run before
 *                     this click. Capture auto-stops after 1s DOM-quiet
 *                     or 8s max window, whichever comes first.
 * EXPORT R1 SNAPBACK — downloads the most recent completed capture
 *                     as 357-r1-static-snapback-<timestamp>.txt.
 *
 * Side-effect surface: ZERO outside of the ARM click. Pill render
 * subscribes only to the in-memory snapback store via
 * useSyncExternalStore; the store is empty until ARM runs.
 */

import { useSyncExternalStore } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import { useThreeFiveSevenR1OwnershipAudit } from './showdownConfig';
import {
  armR1SnapbackCapture,
  downloadR1SnapbackCapture,
  getLastR1SnapbackCapture,
  isR1SnapbackCaptureActive,
  subscribeR1Snapback,
} from './r1SnapbackForensics';

let cachedSnapshot = { has: false, active: false };
function getSnapshot() {
  const has = !!getLastR1SnapbackCapture();
  const active = isR1SnapbackCaptureActive();
  if (cachedSnapshot.has === has && cachedSnapshot.active === active) {
    return cachedSnapshot;
  }
  cachedSnapshot = { has, active };
  return cachedSnapshot;
}
const initialSnapshot = { has: false, active: false };
function getServerSnapshot() { return initialSnapshot; }

export function ThreeFiveSevenR1SnapbackPill() {
  const inTray = useInDebugTray();
  const enabled = useDebugPillEnabled('threeFiveSevenR1Snapback');
  const audit = useThreeFiveSevenR1OwnershipAudit();
  const state = useSyncExternalStore(subscribeR1Snapback, getSnapshot, getServerSnapshot);

  if (!enabled) return null;

  const onR1ShowdownLive = !!audit
    && audit.is357Game
    && audit.currentRound === 1
    && audit.displayCardCount === 3;
  if (!onR1ShowdownLive) return null;

  const wrapperStyle: React.CSSProperties = inTray
    ? { pointerEvents: 'auto', display: 'flex', gap: 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 }
    : {
        position: 'fixed', right: 8, bottom: 8, zIndex: 2147483646,
        pointerEvents: 'auto', display: 'flex', gap: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10,
      };

  const armBg = state.active ? 'rgba(220,140,40,0.9)' : 'rgba(60,120,200,0.9)';
  const armLabel = state.active ? 'ARMED · CAPTURING…' : 'ARM R1 SNAPBACK';

  const exportBg = state.has ? 'rgba(40,140,90,0.9)' : 'rgba(80,80,80,0.6)';
  const exportLabel = state.has ? 'EXPORT R1 SNAPBACK' : 'EXPORT (none yet)';

  const pillStyle = (bg: string, enabledBtn: boolean): React.CSSProperties => ({
    background: bg,
    border: '1px solid rgba(255,255,255,0.45)',
    borderRadius: 999,
    padding: '4px 10px',
    color: '#fff',
    fontSize: 10,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: 0.5,
    opacity: enabledBtn ? 1 : 0.6,
    cursor: enabledBtn ? 'pointer' : 'default',
  });

  return (
    <div data-357-r1-snapback-pills="" style={wrapperStyle}>
      <button
        type="button"
        onClick={() => { armR1SnapbackCapture(); }}
        disabled={state.active}
        title="Arm a bounded R1 snapback capture (auto-stops 1s after quiet or 8s max)."
        style={pillStyle(armBg, !state.active)}
      >
        {armLabel}
      </button>
      <button
        type="button"
        onClick={() => { downloadR1SnapbackCapture(); }}
        disabled={!state.has}
        title="Download 357-r1-static-snapback-<timestamp>.txt for the most recent completed capture."
        style={pillStyle(exportBg, state.has)}
      >
        {exportLabel}
      </button>
    </div>
  );
}
