import { useState } from 'react';
import { toast } from 'sonner';

type FieldValue = string | number | boolean | null | undefined;

interface Props {
  fields: Record<string, FieldValue>;
  alert?: boolean;
}

/**
 * Cribbage Render Truth Pill — collapsed instrumentation pill.
 *
 * - Collapsed by default: small pill, does NOT block gameplay.
 * - Tap the pill to expand into a scrollable panel with all fields.
 * - Copy button exports every field as plain text.
 * - No console, backend, storage, or side channels — read-only DOM/props.
 */
export function CribbageRenderTruthPill({ fields, alert }: Props) {
  const [open, setOpen] = useState(false);

  const formatText = () =>
    Object.entries(fields)
      .map(([k, v]) => {
        if (v === '' && (k === 'Parent' || k === 'Child' || k === 'DOM' || k === 'Transport' || k === 'Layout')) {
          return `\n── ${k} ──`;
        }
        return `${k}=${String(v)}`;
      })
      .join('\n');

  const buildExportFilename = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `cribbage-render-truth-${ts}.txt`;
  };

  const handleExportTxt = () => {
    try {
      const blob = new Blob([formatText()], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Truth panel exported');
    } catch {
      toast.error('Export failed');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatText());
      toast.success('Truth panel copied');
    } catch {
      // Fallback: temporary textarea
      try {
        const ta = document.createElement('textarea');
        ta.value = formatText();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('Truth panel copied');
      } catch {
        toast.error('Copy failed');
      }
    }
  };

  if (!open) {
    return (
      <div
        data-cribbage-render-truth-pill="collapsed"
        style={{
          position: 'fixed',
          left: 6,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
          zIndex: 2147483646,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'monospace',
        }}
      >
        <button
          type="button"
          data-cribbage-render-truth-open=""
          onClick={() => setOpen(true)}
          style={{
            padding: '4px 8px',
            fontSize: 10,
            lineHeight: 1.2,
            borderRadius: 9999,
            border: `1px solid ${alert ? 'hsl(var(--destructive))' : 'hsl(var(--border))'}`,
            background: alert ? 'hsl(var(--destructive) / 0.9)' : 'hsl(var(--background) / 0.9)',
            color: alert ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--foreground))',
            fontFamily: 'monospace',
            fontWeight: alert ? 700 : 500,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {alert ? '⚠ RENDER≠DOM' : 'Render truth'}
        </button>
        <button
          type="button"
          data-cribbage-render-truth-export=""
          onClick={handleExportTxt}
          style={{
            padding: '4px 8px',
            fontSize: 10,
            lineHeight: 1.2,
            borderRadius: 9999,
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            fontFamily: 'monospace',
            fontWeight: 700,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
          }}
        >
          Export TXT
        </button>
      </div>
    );
  }

  return (
    <div
      data-cribbage-render-truth-panel="expanded"
      style={{
        position: 'fixed',
        left: 6,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
        zIndex: 2147483646,
        pointerEvents: 'auto',
        maxHeight: '70vh',
        maxWidth: 'calc(100vw - 12px)',
        width: 340,
        overflow: 'auto',
        borderRadius: 8,
        border: `1px solid ${alert ? 'hsl(var(--destructive))' : 'hsl(var(--border))'}`,
        background: 'hsl(var(--background) / 0.97)',
        color: 'hsl(var(--foreground))',
        padding: 8,
        fontSize: 9,
        lineHeight: 1.25,
        fontFamily: 'monospace',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <strong style={{ color: alert ? 'hsl(var(--destructive))' : undefined, flex: 1 }}>
          Cribbage render truth {alert && '⚠'}
        </strong>
        <button
          type="button"
          onClick={handleExportTxt}
          style={{
            fontSize: 10,
            padding: '2px 8px',
            border: '1px solid hsl(var(--border))',
            borderRadius: 4,
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Export TXT
        </button>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            fontSize: 10,
            padding: '2px 8px',
            border: '1px solid hsl(var(--border))',
            borderRadius: 4,
            background: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Copy
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            fontSize: 10,
            padding: '2px 8px',
            border: '1px solid hsl(var(--border))',
            borderRadius: 4,
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{formatText()}</pre>
    </div>
  );
}
