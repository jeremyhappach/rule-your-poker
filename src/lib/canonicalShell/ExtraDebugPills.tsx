/**
 * EXTRA DEBUG PILLS — DEALER DBG, SEAT OWNERSHIP, DEALER AFFORDANCE.
 * Renders below FELT pill (stacked vertically). Each is a small
 * collapsible/copyable pill that proves the corresponding regression
 * via screenshots, no console.
 */
import { useState, useSyncExternalStore } from 'react';
import { useHideDebugUI } from '@/lib/debugUIVisibility';
import {
  dealerDbgStore,
  seatOwnershipStore,
  dealerAffordanceStore,
} from './extraDebugStore';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

function entryToText(e: any): string {
  const { ts, ...rest } = e;
  const lines = [fmtTime(ts), ''];
  for (const [k, v] of Object.entries(rest)) {
    let out: string;
    if (v && typeof v === 'object') {
      out = JSON.stringify(v);
    } else {
      out = String(v);
    }
    lines.push(`${k}: ${out}`);
  }
  return lines.join('\n');
}

interface PillProps {
  label: string;
  store: {
    get: () => any[];
    subscribe: (l: () => void) => () => void;
  };
  summarize: (latest: any | undefined) => string;
  top: number;
}

function Pill({ label, store, summarize, top }: PillProps) {
  const entries = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const latest = entries[entries.length - 1];

  const copyAll = async () => {
    const text = entries.map(entryToText).join('\n\n────────────\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  };

  return (
    <div
      data-extra-debug-pill={label}
      style={{
        position: 'fixed',
        right: 8,
        top,
        zIndex: 99999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        color: '#fff',
        pointerEvents: 'auto',
      }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: 'rgba(0,0,0,0.75)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 999,
            padding: '4px 8px',
            color: '#fff',
            fontSize: 10,
          }}
        >
          {label} · {summarize(latest)}
        </button>
      ) : (
        <div
          style={{
            width: 300,
            maxHeight: '50vh',
            background: 'rgba(0,0,0,0.88)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <strong style={{ fontSize: 11 }}>{label}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={copyAll} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, padding: '2px 6px', color: '#fff', fontSize: 10 }}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, padding: '2px 6px', color: '#fff', fontSize: 10 }}>
                ✕
              </button>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 8px' }}>
            {entries.length === 0 && <div style={{ opacity: 0.6 }}>No entries yet.</div>}
            {entries.slice().reverse().map((e, i) => (
              <pre key={`${e.ts}-${i}`} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '6px 0', borderTop: i === 0 ? 'none' : '1px dashed rgba(255,255,255,0.15)', fontSize: 10, lineHeight: 1.3 }}>
                {entryToText(e)}
              </pre>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ExtraDebugPills() {
  const hidden = useHideDebugUI();
  if (hidden) return null;
  return (
    <>
      <Pill
        label="DEALER DBG"
        store={dealerDbgStore}
        summarize={(e) => e ? `local:${e.localDealerVisible ? 'Y' : 'N'} opp:${Object.values(e.opponentDealerVisible || {}).some(Boolean) ? 'Y' : 'N'}` : '—'}
        top={40}
      />
      <Pill
        label="SEAT OWNERSHIP"
        store={seatOwnershipStore}
        summarize={(e) => e ? `${e.invariantHolds ? '✓' : '✗'} 1/seat · ${e.winSequencePhase}` : '—'}
        top={72}
      />

      <Pill
        label="DEALER AFFORDANCE"
        store={dealerAffordanceStore}
        summarize={(e) => e ? `${e.game} i:${e.identityDealerVisible?'Y':'N'} s:${e.seatDealerVisible?'Y':'N'} l:${e.legacyDealerVisible?'Y':'N'}` : '—'}
        top={104}
      />
    </>
  );
}
