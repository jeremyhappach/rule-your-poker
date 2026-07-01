/**
 * CribDealerDrawTraceOverlay — on-screen, exportable trace surface.
 *
 * Collapsed by default as a tiny pill in a safe corner so it cannot
 * obstruct Start Game / game-selection / action / table controls.
 * Tap pill to expand; Copy JSON / Clear / Collapse live in the
 * expanded header only.
 *
 * Capture behavior is unchanged — UI-only edit.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  getCribDealerDrawBuffer,
  subscribeCribDealerDraw,
  clearCribDealerDrawBuffer,
  isCribDealerDrawTraceEnabled,
  type CribDealerDrawEvent,
} from '@/lib/cribbageDealerDrawTrace';
import { useHideDebugUI } from '@/lib/debugUIVisibility';


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
  const hidden = useHideDebugUI();
  if (hidden || !isCribDealerDrawTraceEnabled() || !gameId) return null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <Overlay gameId={gameId} />;
}

// Anchor: top-left corner, well clear of typical bottom action bars,
// bottom-center Start Game, and bottom-right debug tray pills.
const ANCHOR_STYLE = {
  position: 'fixed' as const,
  top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
  left: 6,
  zIndex: 2147483600,
  // Container is non-interactive; only the pill/panel inside opt in.
  pointerEvents: 'none' as const,
};

function Overlay({ gameId }: { gameId: string }) {
  const [events, setEvents] = useState<CribDealerDrawEvent[]>(() => getCribDealerDrawBuffer(gameId));
  const [expanded, setExpanded] = useState(false);
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

  if (!expanded) {
    return (
      <div style={ANCHOR_STYLE} data-debug-overlay="crib-dealer-draw-trace-pill">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(15,23,42,0.85)',
            color: '#fbbf24',
            border: '1px solid #334155',
            borderRadius: 999,
            padding: '2px 8px',
            font: '10px/1.2 ui-monospace,Menlo,monospace',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
          title="Expand Crib Dealer Draw trace"
        >
          CRIB TRACE · {events.length}
        </button>
      </div>
    );
  }

  return (
    <div style={ANCHOR_STYLE} data-debug-overlay="crib-dealer-draw-trace">
      <div
        style={{
          pointerEvents: 'auto',
          width: 'min(92vw, 460px)',
          maxHeight: '60vh',
          background: 'rgba(15,23,42,0.92)',
          color: '#e2e8f0',
          font: '11px/1.3 ui-monospace,Menlo,monospace',
          border: '1px solid #334155',
          borderRadius: 6,
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <strong style={{ color: '#fbbf24' }}>CRIB DEALER DRAW</strong>
          <span style={{ marginLeft: 'auto' }}>{events.length}</span>
          <button onClick={copyJson} style={btn}>{copied === 'ok' ? '✓' : copied === 'err' ? '✗' : 'Copy'}</button>
          <button onClick={onClear} style={btn}>Clear</button>
          <button onClick={() => setExpanded(false)} style={btn}>▲</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
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
      </div>
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
