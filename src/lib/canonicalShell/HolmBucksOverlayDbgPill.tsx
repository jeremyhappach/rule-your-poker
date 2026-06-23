/**
 * HolmBucksOverlayDbgPill — tray pill for the BUCK'S ON YOU forensic dump.
 *
 * Pure viewer. Click COPY to copy the text dump; click TXT to download as a
 * timestamped .txt file. No behavior changes — instrumentation only.
 */

import { useCallback, useState } from 'react';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import {
  buildBucksForensicsText,
  getBucksForensics,
} from '@/lib/canonicalShell/holmBucksOverlayForensics';

export function HolmBucksOverlayDbgPill() {
  const inTray = useInDebugTray();
  const enabled = useDebugPillEnabled('bucksOverlay');
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildBucksForensicsText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  }, []);

  const download = useCallback(() => {
    const text = buildBucksForensicsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `bucks-forensics-${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (!enabled) return null;

  const snap = getBucksForensics();
  const eventCount = snap.totalRecords ?? snap.records.length;
  const violationCount = snap.totalViolations ?? snap.violations.length;

  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        background: '#5f3a1e',
        border: '1px solid #b87b4a',
        borderRadius: 4,
        color: '#fff',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        fontWeight: 700,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
      data-pill="bucks-overlay-dbg"
      title={inTray ? 'Bucks overlay forensics' : ''}
    >
      <span>BUCKS</span>
      <span style={{ color: violationCount ? '#ffb4b4' : '#cfe8ff', fontWeight: 600 }}>
        {eventCount}/{violationCount}
      </span>
      <button
        type="button"
        onClick={copy}
        style={{ background: '#3a2412', border: '1px solid #b87b4a', color: '#fff', padding: '1px 5px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
      >
        {copied ? 'OK' : 'COPY'}
      </button>
      <button
        type="button"
        onClick={download}
        style={{ background: '#3a2412', border: '1px solid #b87b4a', color: '#fff', padding: '1px 5px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
      >
        TXT
      </button>
    </div>
  );
}
