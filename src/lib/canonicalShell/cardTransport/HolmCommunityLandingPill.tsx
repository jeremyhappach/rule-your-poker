/**
 * HolmCommunityLandingPill — single visible "COMMUNITY EXPORT" pill.
 *
 * Not gated by wartime or any other pill toggle. Renders inside the
 * canonical Debug Tray. One tap downloads a .txt slice of the
 * existing wartime ring containing the Holm community-card landing
 * window only.
 */

import { useState } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { downloadHolmCommunityLandingExport } from './holmCommunityLandingForensics';

export function HolmCommunityLandingPill() {
  const inTray = useInDebugTray();
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    setBusy(true);
    try {
      downloadHolmCommunityLandingExport();
    } finally {
      setTimeout(() => setBusy(false), 500);
    }
  };

  const wrapperStyle: React.CSSProperties = inTray
    ? {
        pointerEvents: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
      }
    : {
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 2147483647,
        pointerEvents: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
      };

  return (
    <div data-holm-community-landing-pill="" style={wrapperStyle}>
      <button
        type="button"
        onClick={onClick}
        title="Download holm-community-landing-<timestamp>.txt from the retained wartime buffer"
        style={{
          background: busy ? 'rgba(64,160,96,0.85)' : 'rgba(180,40,40,0.85)',
          border: '1px solid rgba(255,255,255,0.45)',
          borderRadius: 999,
          padding: '4px 10px',
          color: '#fff',
          fontSize: 10,
          lineHeight: 1.2,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        {busy ? 'EXPORTED ✓' : 'COMMUNITY EXPORT'}
      </button>
    </div>
  );
}
