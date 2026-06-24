/**
 * R1SnapbackPill — gameplay debug pill for 3-5-7 R1 (3-card) opponent
 * showdown snapback forensics. Renders inside the canonical Debug Tray.
 *
 * Visibility:
 *  - Admin toggle: Debug Tools → "R1 Snapback Export" must be enabled.
 *  - Live gating: at least one [data-357-r1-host] element on-screen.
 *
 * Click downloads the latest completed capture as a .txt with the
 * filename `357-r1-static-snapback-<timestamp>.txt`.
 */

import { useEffect, useState } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import {
  downloadLastCapture,
  getLastCompletedCapture,
  setR1SnapbackEngineEnabled,
  subscribe,
  subscribeHostsPresence,
} from './r1SnapbackForensics';

export function R1SnapbackPill() {
  const enabled = useDebugPillEnabled('r1Snapback');
  const inTray = useInDebugTray();
  const [hostsPresent, setHostsPresent] = useState(false);
  const [hasCapture, setHasCapture] = useState(!!getLastCompletedCapture());
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    setR1SnapbackEngineEnabled(enabled);
    return () => { /* keep engine on while admin toggle stays on */ };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setHostsPresent(false); return; }
    return subscribeHostsPresence(setHostsPresent);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return subscribe(() => setHasCapture(!!getLastCompletedCapture()));
  }, [enabled]);

  if (!enabled || !hostsPresent) return null;

  const onClick = () => {
    if (!hasCapture) return;
    downloadLastCapture();
    setFlash(true);
    setTimeout(() => setFlash(false), 500);
  };

  const wrapperStyle: React.CSSProperties = inTray
    ? { pointerEvents: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 }
    : { position: 'fixed', right: 8, bottom: 40, zIndex: 2147483647, pointerEvents: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 };

  const label = flash ? 'EXPORTED ✓' : hasCapture ? 'R1 SNAPBACK EXPORT' : 'R1 SNAPBACK (waiting…)';

  return (
    <div data-r1-snapback-pill="" style={wrapperStyle}>
      <button
        type="button"
        onClick={onClick}
        disabled={!hasCapture}
        title={hasCapture
          ? 'Download 357-r1-static-snapback-<timestamp>.txt for the most recent completed capture'
          : 'Edit any R1 static size, dyn.enabled, fan, or overlap value to start a capture'}
        style={{
          background: flash
            ? 'rgba(64,160,96,0.9)'
            : hasCapture
              ? 'rgba(180,40,40,0.9)'
              : 'rgba(80,80,80,0.7)',
          border: '1px solid rgba(255,255,255,0.45)',
          borderRadius: 999,
          padding: '4px 10px',
          color: '#fff',
          fontSize: 10,
          lineHeight: 1.2,
          fontWeight: 700,
          letterSpacing: 0.5,
          cursor: hasCapture ? 'pointer' : 'default',
          opacity: hasCapture ? 1 : 0.85,
        }}
      >
        {label}
      </button>
    </div>
  );
}
