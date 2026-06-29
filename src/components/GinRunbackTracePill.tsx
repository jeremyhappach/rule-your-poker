import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  clearGinRunbackTrace,
  formatGinRunbackTraceAsText,
  getGinRunbackTrace,
  subscribeGinRunbackTrace,
} from '@/lib/ginRunbackTrace';

export function GinRunbackTracePill() {
  const records = useSyncExternalStore(
    subscribeGinRunbackTrace,
    getGinRunbackTrace,
    getGinRunbackTrace,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const text = formatGinRunbackTraceAsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      try { window.prompt('Copy Gin runback trace:', text); } catch { /* non-fatal */ }
    }
  };

  const exportTxt = () => {
    const blob = new Blob([formatGinRunbackTraceAsText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gin-runback-trace-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const newest = records[records.length - 1];

  return (
    <div
      data-gin-runback-trace-pill=""
      style={{
        position: 'fixed',
        left: 6,
        bottom: 6,
        zIndex: 2147483647,
        width: expanded ? 'min(96vw, 760px)' : 'auto',
        maxWidth: expanded ? undefined : '94vw',
        background: 'rgba(0,0,0,0.88)',
        color: '#FFD580',
        border: '1px solid #FFD580',
        borderRadius: 6,
        font: '10px/1.25 ui-monospace, Menlo, monospace',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFD580',
            cursor: 'pointer',
            font: 'inherit',
            fontWeight: 800,
            padding: 0,
            textAlign: 'left',
          }}
        >
          GIN RUNBACK TRACE · {records.length}
        </button>
        <button type="button" onClick={copy} style={buttonStyle}>{copied ? 'COPIED' : 'COPY'}</button>
        <button type="button" onClick={exportTxt} style={buttonStyle}>EXPORT</button>
        <button type="button" onClick={clearGinRunbackTrace} style={buttonStyle}>CLEAR</button>
      </div>
      {expanded ? (
        <div style={{ borderTop: '1px solid rgba(255,213,128,0.35)', color: '#fff', maxHeight: 420, overflow: 'auto', padding: '5px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest ? formatGinRunbackTraceAsText() : '(no Gin runback events yet)'}
        </div>
      ) : newest ? (
        <div style={{ padding: '0 6px 4px', color: '#fff', opacity: 0.82, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          #{newest.seq} {newest.event}
        </div>
      ) : null}
    </div>
  );
}

const buttonStyle: CSSProperties = {
  background: '#FFD580',
  color: '#000',
  border: 'none',
  borderRadius: 3,
  padding: '2px 5px',
  font: 'inherit',
  fontWeight: 800,
  cursor: 'pointer',
};

export default GinRunbackTracePill;
