/**
 * CribbageLabelTracePill
 * ──────────────────────
 * Small floating debug pill showing the most recent events from the
 * crib-label + discard-transport wartime ledger. Read-only.
 *
 * Follows the project debug-pill standard:
 *   - Compact collapsed pill
 *   - Expand / collapse
 *   - Export TXT
 */

import { useEffect, useState } from 'react';
import {
  clearCribLabelWartimeEvents,
  exportCribLabelWartimeAsText,
  getCribLabelWartimeEvents,
  subscribeCribLabelWartime,
  type CribLabelWartimeEvent,
} from '@/lib/cribbage/cribLabelWartimeLedger';

function isEnabled(): boolean {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get('crib_label_trace') === '1') return true;
  } catch {
    /* */
  }
  try {
    if (window.localStorage.getItem('ptp_crib_label_trace') === '1') return true;
  } catch {
    /* */
  }
  return false;
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CribbageLabelTracePill() {
  const [, force] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [enabled] = useState(() => isEnabled());

  useEffect(() => {
    if (!enabled) return;
    return subscribeCribLabelWartime(() => force((n) => n + 1));
  }, [enabled]);

  if (!enabled) return null;

  const events: CribLabelWartimeEvent[] = getCribLabelWartimeEvents();
  const latest = events.length > 0 ? events[events.length - 1] : null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 6,
        bottom: 6,
        zIndex: 9999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        color: '#fff',
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 6,
        padding: 4,
        maxWidth: expanded ? 480 : 220,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setExpanded((x) => !x)}
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          {expanded ? '▾' : '▸'} crib-label ({events.length})
        </button>
        <button
          onClick={() =>
            download(
              `crib-label-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
              exportCribLabelWartimeAsText(),
            )
          }
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Export TXT
        </button>
        <button
          onClick={() => clearCribLabelWartimeEvents()}
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 3,
            padding: '1px 5px',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
      {!expanded && latest ? (
        <div style={{ marginTop: 3, opacity: 0.85 }}>
          {latest.kind}
        </div>
      ) : null}
      {expanded ? (
        <div
          style={{
            marginTop: 4,
            maxHeight: 260,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {events
            .slice(-80)
            .map(
              (ev) =>
                `[${ev.seq}] ${ev.kind} ${JSON.stringify(ev.payload)}`,
            )
            .join('\n')}
        </div>
      ) : null}
    </div>
  );
}

export default CribbageLabelTracePill;
