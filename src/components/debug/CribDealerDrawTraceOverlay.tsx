/**
 * CribDealerDrawTraceOverlay — on-screen, exportable trace surface.
 *
 * Tails the per-active-game ring buffer from cribbageDealerDrawTrace.
 * Local buffer is authoritative for export.
 *
 * Controls: Copy JSON, Clear, Collapse.
 *
 * NO timers/guards/refs that alter behavior. NO fix path.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  getCribDealerDrawBuffer,
  subscribeCribDealerDraw,
  clearCribDealerDrawBuffer,
  isCribDealerDrawTraceEnabled,
  type CribDealerDrawEvent,
} from '@/lib/cribbageDealerDrawTrace';

interface Props {
  gameId: string | null | undefined;
}

const SURFACE_SHORT: Record<string, string> = {
  'Game.HighCardDealerSelection': 'Game.HCDS',
  'CribbageMobileGameTable.CribbageDealerSelectionController.sessionPhase': 'Crib.session',
  'CribbageMobileGameTable.CribbageDealerSelectionController.roundPhase': 'Crib.round',
  'CribbageMobileGameTable.loadOrInitializeState': 'Crib.loadInit',
  'CribbageMobileGameTable.handleHighCardComplete': 'Crib.hcComplete',
  'CribbageMobileGameTable.setShowHighCardSelection': 'Crib.setShowHC',
};

export default function CribDealerDrawTraceOverlay({ gameId }: Props) {
  if (!isCribDealerDrawTraceEnabled() || !gameId) return null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <Overlay gameId={gameId} />;
}

function Overlay({ gameId }: { gameId: string }) {
  const [events, setEvents] = useState<CribDealerDrawEvent[]>(() => getCribDealerDrawBuffer(gameId));
  const [collapsed, setCollapsed] = useState(true);
  const [copied, setCopied] = useState<null | 'ok' | 'err'>(null);

  useEffect(() => {
    const refresh = () => setEvents(getCribDealerDrawBuffer(gameId));
    refresh();
    return subscribeCribDealerDraw(gameId, refresh);
  }, [gameId]);

  const copyJson = useCallback(async () => {
    const payload = JSON.stringify({ gameId, exportedAt: new Date().toISOString(), count: events.length, events }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied('ok');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied('ok');
      } catch {
        setCopied('err');
      }
    }
    setTimeout(() => setCopied(null), 1500);
  }, [events, gameId]);

  const onClear = useCallback(() => clearCribDealerDrawBuffer(gameId), [gameId]);

  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 2147483600,
        maxWidth: collapsed ? 220 : 460,
        maxHeight: collapsed ? 'auto' : '60vh',
        background: 'rgba(15,23,42,0.92)',
        color: '#e2e8f0',
        font: '11px/1.3 ui-monospace,Menlo,monospace',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: 6,
        pointerEvents: 'auto',
      }}
      data-debug-overlay="crib-dealer-draw-trace"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <strong style={{ color: '#fbbf24' }}>CRIB DEALER DRAW</strong>
        <span style={{ marginLeft: 'auto' }}>{events.length}</span>
        <button onClick={copyJson} style={btn}>{copied === 'ok' ? '✓' : copied === 'err' ? '✗' : 'Copy'}</button>
        <button onClick={onClear} style={btn}>Clear</button>
        <button onClick={() => setCollapsed(c => !c)} style={btn}>{collapsed ? '▲' : '▼'}</button>
      </div>
      {!collapsed && (
        <div style={{ overflow: 'auto', maxHeight: 'calc(60vh - 32px)' }}>
          {events.length === 0 && <div style={{ opacity: 0.6 }}>no events</div>}
          {events.slice().reverse().map(e => (
            <div key={e.seq} style={{ borderTop: '1px solid #1e293b', padding: '3px 0' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>#{e.seq} </span>
                <span style={{ color: '#7dd3fc' }}>{(SURFACE_SHORT[e.surface] ?? e.surface)}</span>
                <span style={{ color: '#fde68a' }}> {e.event}</span>
                <span style={{ color: '#64748b', float: 'right' }}>{e.tsIso.slice(11, 23)}</span>
              </div>
              {e.controllerInstanceId && (
                <div style={{ color: '#a78bfa' }}>id={e.controllerInstanceId}</div>
              )}
              <pre style={{ margin: 0, color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(e.payload)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #475569',
  borderRadius: 3,
  padding: '1px 6px',
  fontSize: 10,
  cursor: 'pointer',
};
