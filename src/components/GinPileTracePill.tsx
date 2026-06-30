import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  clearGinPileTrace,
  formatGinPileTraceAsText,
  getGinPileTrace,
  subscribeGinPileTrace,
} from '@/lib/ginPileTrace';

export function GinPileTracePill() {
  const records = useSyncExternalStore(
    subscribeGinPileTrace,
    getGinPileTrace,
    getGinPileTrace,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const text = useMemo(() => formatGinPileTraceAsText(records), [records]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      areaRef.current?.select();
      try { document.execCommand('copy'); } catch { /* debug-only */ }
    }
  };

  if (!expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          right: 8,
          top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          zIndex: 2147483647,
          pointerEvents: 'auto',
        }}
        data-gin-pile-trace-pill=""
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expand Gin pile interaction trace"
          style={pillButtonStyle}
        >
          GIN PILE TRACE · {records.length}
        </button>
      </div>
    );
  }

  return (
    <section
      data-gin-pile-trace-panel=""
      aria-label="Gin pile interaction trace"
      className="border border-border bg-background/95 text-foreground backdrop-blur-sm"
      style={{
        position: 'fixed',
        left: 8,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        width: 'min(96vw, 520px)',
        zIndex: 2147483647,
        maxHeight: '38dvh',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        borderRadius: 8,
        boxShadow: '0 12px 30px hsl(var(--foreground) / 0.22)',
        // Panel body must NEVER intercept gameplay interaction. Only the
        // explicit controls (header button, Copy, Clear) re-enable
        // pointer-events. The textarea is read-only display and stays
        // pointer-events:none so taps over it fall through to the felt.
        pointerEvents: 'none',
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1" style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-xs font-semibold">▼ GIN PILE TRACE · {records.length} / 200</div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground" onClick={clearGinPileTrace}>
            Clear
          </button>
        </div>
      </div>
      <textarea
        ref={areaRef}
        readOnly
        value={text || '(no Gin pile events yet)'}
        className="h-full min-h-[180px] w-full resize-none bg-background/70 p-2 font-mono text-[10px] leading-snug text-foreground outline-none"
        style={{ pointerEvents: 'none' }}
      />
    </section>
  );
}

const pillButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'hsl(var(--muted))',
  color: 'hsl(var(--foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 999,
  padding: '4px 8px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
  whiteSpace: 'nowrap',
};

export default GinPileTracePill;