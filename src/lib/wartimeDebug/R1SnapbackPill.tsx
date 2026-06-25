/**
 * R1SnapbackPill — manual 3-5-7 R1 snapback recorder UI.
 *
 * - Lives inside the canonical Debug Pill Tray (DebugTray).
 * - Hidden entirely when the `r1Snapback` Admin Debug Tools toggle is off
 *   (no dynamic import, no observer, no rAF, no timer, no recorder allocation).
 * - When the toggle is on, the pill polls the DOM (750 ms) for the existence
 *   of the passive `[data-357-r1-row]` marker — i.e. an active 3-5-7
 *   opponent R1 3-card showdown surface is mounted in the shell. Until that
 *   marker is present, ARM/EXPORT pills are not shown.
 * - ARM dynamically imports the framework-free recorder module exactly once
 *   per session and invokes its imperative `arm()`. EXPORT downloads the
 *   most recent completed recording.
 *
 * Polling/visibility logic lives entirely inside this pill — never touches
 * PlayerHand, MobileGameTable, game selection, ante, deal orchestration, or
 * showdown lifecycle.
 */

import { useEffect, useRef, useState } from 'react';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';

type RecorderApi = typeof import('./r1SnapbackRecorder');

export function R1SnapbackPill() {
  const enabled = useDebugPillEnabled('r1Snapback');
  const inTray = useInDebugTray();
  const [rowPresent, setRowPresent] = useState(false);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string>('');
  const apiRef = useRef<RecorderApi | null>(null);

  // Visibility poll — only while the user has enabled this pill.
  useEffect(() => {
    if (!enabled) {
      setRowPresent(false);
      return;
    }
    const tick = () => {
      const present = !!document.querySelector('[data-357-r1-row="true"]');
      setRowPresent(present);
      if (apiRef.current) {
        setArmed(apiRef.current.isArmed());
        setReady(apiRef.current.isReady());
      }
    };
    tick();
    const id = window.setInterval(tick, 750);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;
  if (!rowPresent) return null;

  const onArm = async () => {
    setStatus('loading…');
    if (!apiRef.current) {
      apiRef.current = await import('./r1SnapbackRecorder');
    }
    const r = apiRef.current.arm();
    if (!r.ok) {
      setStatus(`arm failed: ${r.reason ?? 'unknown'}`);
      return;
    }
    setArmed(true);
    setStatus('recording…');
    // The recorder self-stops; poll its state.
    const poll = window.setInterval(() => {
      const api = apiRef.current;
      if (!api) return;
      const a = api.isArmed();
      const ok = api.isReady();
      setArmed(a);
      setReady(ok);
      if (!a) {
        setStatus(ok ? 'ready ✓' : 'stopped');
        window.clearInterval(poll);
      }
    }, 200);
  };

  const onExport = () => {
    if (!apiRef.current) {
      setStatus('nothing to export');
      return;
    }
    const r = apiRef.current.download();
    setStatus(r.ok ? 'exported ✓' : `export failed: ${r.reason ?? 'unknown'}`);
  };

  const wrapper: React.CSSProperties = inTray
    ? { pointerEvents: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }
    : {
        position: 'fixed',
        right: 8,
        bottom: 56,
        zIndex: 2147483647,
        pointerEvents: 'auto',
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center',
      };

  const btnBase: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.45)',
    borderRadius: 999,
    padding: '4px 10px',
    color: '#fff',
    fontSize: 10,
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: 0.5,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  };

  return (
    <div data-r1-snapback-pill="" style={wrapper}>
      <button
        type="button"
        onClick={onArm}
        disabled={armed}
        style={{
          ...btnBase,
          background: armed ? 'rgba(200,140,40,0.85)' : 'rgba(180,40,40,0.85)',
          opacity: armed ? 0.6 : 1,
        }}
      >
        {armed ? 'ARMED…' : 'ARM R1 RECORD'}
      </button>
      <button
        type="button"
        onClick={onExport}
        disabled={!ready}
        style={{
          ...btnBase,
          background: ready ? 'rgba(64,160,96,0.85)' : 'rgba(80,80,80,0.6)',
          opacity: ready ? 1 : 0.5,
        }}
      >
        EXPORT R1 RECORD
      </button>
      {status && (
        <span
          style={{
            ...btnBase,
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.25)',
            fontWeight: 400,
          }}
        >
          {status}
        </span>
      )}
    </div>
  );
}
