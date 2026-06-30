import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  clearGinSelfDrawTrace,
  formatGinSelfDrawTraceAsText,
  getGinSelfDrawTrace,
  subscribeGinSelfDrawTrace,
} from '@/lib/ginSelfDrawTrace';

export function GinSelfDrawTracePill() {
  const records = useSyncExternalStore(
    subscribeGinSelfDrawTrace,
    getGinSelfDrawTrace,
    getGinSelfDrawTrace,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const text = useMemo(() => formatGinSelfDrawTraceAsText(records), [records]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      areaRef.current?.select();
      try { document.execCommand('copy'); } catch { /* */ }
    }
  };

  if (!expanded) {
    return (
      <div
        style={{
          position: 'fixed',
          right: 8,
          top: 'calc(env(safe-area-inset-top, 0px) + 40px)',
          zIndex: 2147483647,
          pointerEvents: 'auto',
        }}
        data-gin-self-draw-trace-pill=""
      >
        <button type="button" onClick={() => setExpanded(true)} style={pillButton}>
          GIN SELF DRAW TRACE · {records.length}
        </button>
      </div>
    );
  }

  return (
    <section
      data-gin-self-draw-trace-panel=""
      aria-label="Gin self-draw trace"
      className="border border-border bg-background/95 text-foreground backdrop-blur-sm"
      style={{
        position: 'fixed',
        right: 8,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        width: 'min(96vw, 540px)',
        zIndex: 2147483647,
        maxHeight: '42dvh',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        borderRadius: 8,
        boxShadow: '0 12px 30px hsl(var(--foreground) / 0.22)',
        pointerEvents: 'none',
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1" style={{ pointerEvents: 'auto' }}>
        <button type="button" onClick={() => setExpanded(false)} className="min-w-0 flex-1 text-left">
          <div className="text-xs font-semibold">▼ GIN SELF DRAW TRACE · {records.length} / 200</div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="rounded border border-border bg-muted px-2 py-1 text-[10px]" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="rounded border border-border bg-muted px-2 py-1 text-[10px]" onClick={clearGinSelfDrawTrace}>
            Clear
          </button>
        </div>
      </div>
      <textarea
        ref={areaRef}
        readOnly
        value={text || '(no self-draw events yet)'}
        className="h-full min-h-[180px] w-full resize-none bg-background/70 p-2 font-mono text-[10px] leading-snug outline-none"
        style={{ pointerEvents: 'auto' }}
      />
    </section>
  );
}

const pillButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
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

export default GinSelfDrawTracePill;
