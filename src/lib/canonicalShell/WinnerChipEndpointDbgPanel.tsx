/**
 * WinnerChipEndpointDbgPanel — collapsible audit pill for the
 * winner-endpoint-missing diagnostic. Gated by 'winnerChipEndpointDbg'.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearWinnerChipEndpointDbg,
  formatWinnerChipEndpointDbgAsText,
  getWinnerChipEndpointDbg,
  subscribeWinnerChipEndpointDbg,
  type WinnerChipEndpointSnapshot,
} from './winnerChipEndpointDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

function statusColor(s: WinnerChipEndpointSnapshot): string {
  if (s.winnerSeat == null) return '#aaa';
  if (!s.winnerSeatPresent) return '#ff7777';
  if (!s.winnerChipSubtreePresent) return '#FFD580';
  return '#7CFC00';
}

export function WinnerChipEndpointDbgPanel() {
  const inTray = useInDebugTray();
  const records = useSyncExternalStore(
    subscribeWinnerChipEndpointDbg,
    getWinnerChipEndpointDbg,
    getWinnerChipEndpointDbg,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const enabled = useDebugPillEnabled('winnerChipEndpointDbg');
  if (!enabled) return null;

  const handleCopy = async () => {
    const txt = formatWinnerChipEndpointDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy winner chip endpoint log:', txt); } catch { /* */ }
    }
  };

  const newest = [...records].reverse();
  const recent = newest[0];

  return (
    <div
      data-winner-chip-endpoint-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(94vw, 560px)' : 'auto',
        maxWidth: expanded ? undefined : 360,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        border: '1px solid #444',
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderBottom: expanded ? '1px solid #333' : 'none' }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700 }}
        >
          {expanded ? '▼' : '▶'} WIN ENDPT ({records.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· <span style={{ color: statusColor(recent) }}>{recent.site}/seat#{recent.winnerSeat ?? '∅'}{recent.winnerSeatPresent ? '' : '✗'}</span>
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearWinnerChipEndpointDbg()} title="Clear"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 420, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no snapshots yet)</div>
          ) : (
            newest.map((s, i) => {
              const time = new Date(s.ts).toISOString().substring(11, 23);
              return (
                <div key={`${s.ts}-${i}`} style={{ marginBottom: 6, borderTop: '1px dashed #333', paddingTop: 3 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: statusColor(s), fontWeight: 700 }}>● </span>
                    <span>{s.site}</span>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    winnerSeat={s.winnerSeat ?? '∅'} winnerId={s.winnerPlayerId?.slice(0, 8) ?? '∅'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    loserSeats=[{(s.loserSeats ?? []).join(',')}] presentLosers=[{s.loserSeatsPresent.join(',')}]
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    DOM positions=[{s.chipCenterPositions.join(',')}] count={s.domCount}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    winnerSeatPresent={String(s.winnerSeatPresent)} cluster={String(s.winnerClusterPresent)} subtree={String(s.winnerChipSubtreePresent)}
                  </div>
                  {s.note ? <div style={{ opacity: 0.7 }}>{s.note}</div> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
