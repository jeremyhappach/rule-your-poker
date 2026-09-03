import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import {
  getCribbageLivenessTraceSnapshot,
  sendCribbageLivenessTrace,
  startCribbageLivenessTrace,
  stopCribbageLivenessTrace,
  subscribeCribbageLivenessTrace,
} from '@/lib/cribbage/livenessTrace';

/**
 * Small player-operated recorder for a Cribbage liveness incident.
 * Recording is local/sessionStorage only. Send writes exactly one compact
 * debug_events capsule after the player stops the trace.
 */
export function CribbageLivenessTracePill() {
  const enabled = useDebugPillEnabled('cribbageLiveness');
  const trace = useSyncExternalStore(
    subscribeCribbageLivenessTrace,
    getCribbageLivenessTraceSnapshot,
    getCribbageLivenessTraceSnapshot,
  );
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);

  if (!enabled || !trace.identity.gameId) return null;

  const recording = trace.mode === 'recording';
  const stopped = trace.mode === 'stopped';
  const canSend = stopped && trace.entries.length > 0 && !trace.sentAt;

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      await sendCribbageLivenessTrace();
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      data-cribbage-liveness-trace-pill=""
      style={{
        position: 'relative',
        pointerEvents: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        title="Cribbage connection/reload trace"
        style={{
          background: recording ? '#b91c1c' : stopped ? '#92400e' : '#1f2937',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.35)',
          borderRadius: 999,
          padding: '4px 8px',
          cursor: 'pointer',
          font: 'inherit',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {recording ? '● CRIB TRACE' : 'CRIB TRACE'}
        {trace.entries.length ? ` ${trace.entries.length}` : ''}
      </button>
      {expanded ? (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 'calc(100% + 5px)',
            width: 210,
            padding: 8,
            borderRadius: 6,
            border: '1px solid #475569',
            background: 'rgba(15, 23, 42, 0.98)',
            color: '#fff',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ marginBottom: 6, color: '#cbd5e1' }}>
            {recording
              ? 'Recording locally. Refresh-safe.'
              : stopped
                ? `${trace.entries.length} events frozen.`
                : 'Capture a connection or refresh issue.'}
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              type="button"
              onClick={startCribbageLivenessTrace}
              disabled={recording}
              style={buttonStyle(recording ? '#475569' : '#166534')}
            >
              START
            </button>
            <button
              type="button"
              onClick={stopCribbageLivenessTrace}
              disabled={!recording}
              style={buttonStyle(recording ? '#9f1239' : '#475569')}
            >
              STOP
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend || sending}
              style={buttonStyle(canSend ? '#1d4ed8' : '#475569')}
            >
              {trace.sentAt ? 'SENT' : sending ? '...' : 'SEND'}
            </button>
          </div>
          {trace.lastSendError ? (
            <div style={{ color: '#fca5a5', marginTop: 6 }}>Send failed; the trace is retained.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buttonStyle(background: string): CSSProperties {
  return {
    flex: 1,
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 3,
    background,
    color: '#fff',
    padding: '3px 4px',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: 700,
  };
}
