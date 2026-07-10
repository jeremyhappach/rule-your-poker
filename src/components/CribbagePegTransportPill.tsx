/**
 * CribbagePegTransportPill
 *
 * Small, collapsed-by-default diagnostic pill for the hand → pegging-row
 * transport pipeline. Renders in the fixed top-left area so it does not
 * collide with the layout-status pill (top-right). Copy + Export TXT
 * per debug-pill standard. Read-only; no gameplay effect.
 */

import { useEffect, useState } from 'react';
import {
  getPegTransportEntries,
  serializePegTransport,
  subscribePegTransport,
  type PegTransportEntry,
} from '@/lib/cribbageTransportInstrumentation';

function summarize(entries: PegTransportEntry[]): {
  color: string;
  label: string;
} {
  if (entries.length === 0) return { color: '#a3e635', label: 'peg xport (0)' };
  const last = entries[entries.length - 1];
  const bad =
    last.skipReason ||
    (!last.animationSettled && last.cleanupReason && last.cleanupReason !== 'settled') ||
    (last.intentCreated && !last.intentMounted);
  return {
    color: bad ? '#f87171' : '#a3e635',
    label: `peg xport (${entries.length}) ${bad ? 'ISSUE' : 'ok'}`,
  };
}

export const CribbagePegTransportPill = () => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, force] = useState(0);

  useEffect(() => subscribePegTransport(() => force((n) => n + 1)), []);

  const entries = getPegTransportEntries();
  const { color, label } = summarize(entries);
  const text = serializePegTransport();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  const handleExport = () => {
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cribbage-peg-transport-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 6,
        left: 6,
        zIndex: 2147482900,
        pointerEvents: 'auto',
        fontSize: 10,
        lineHeight: 1.2,
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '2px 6px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.65)',
            color,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {label}
        </button>
      ) : (
        <div
          style={{
            width: 320,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.9)',
            color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.25)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 6,
              borderBottom: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.95)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600, color }}>{label}</span>
            <button
              onClick={handleCopy}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              {copied ? 'copied' : 'Copy'}
            </button>
            <button
              onClick={handleExport}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#065f46', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Export TXT
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="collapse"
              style={{ padding: '2px 6px', borderRadius: 4, background: '#374151', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              −
            </button>
          </div>
          <div style={{ padding: 6, overflow: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 10 }}>{text}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default CribbagePegTransportPill;
